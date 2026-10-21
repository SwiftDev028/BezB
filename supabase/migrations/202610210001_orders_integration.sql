-- BezB integration. Review current project state before running; this migration
-- only adds columns/table/functions and never recreates existing orders.
begin;

-- Fail before changing anything if the live legacy schema differs from the
-- order/admin shape these additive migrations support. No table data is read
-- out of the database, and the surrounding transaction rolls back on failure.
do $$
declare
  v_missing text;
begin
  if to_regclass('public.orders') is null or to_regclass('public.order_items') is null
     or to_regclass('public.admin_users') is null then
    raise exception 'BezB migrations require existing public.orders, public.order_items, and public.admin_users tables';
  end if;
  select string_agg(required.column_name, ', ' order by required.column_name) into v_missing
  from (values
    ('orders','id'),('orders','order_number'),('orders','customer_name'),('orders','customer_phone'),
    ('orders','customer_email'),('orders','delivery_address'),('orders','customer_comment'),('orders','status'),
    ('orders','total_amount'),('orders','created_at'),('orders','updated_at'),
    ('order_items','id'),('order_items','order_id'),('order_items','product_id'),('order_items','product_name'),
    ('order_items','quantity'),('order_items','unit_price'),('admin_users','user_id')
  ) as required(table_name,column_name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name=required.table_name and c.column_name=required.column_name
  );
  if v_missing is not null then
    raise exception 'Live schema is missing required columns: %', v_missing;
  end if;
  if (select a.atttypid from pg_attribute a where a.attrelid='public.orders'::regclass and a.attname='id' and not a.attisdropped) <> 'uuid'::regtype
     or (select a.atttypid from pg_attribute a where a.attrelid='public.order_items'::regclass and a.attname='id' and not a.attisdropped) <> 'uuid'::regtype
     or (select a.atttypid from pg_attribute a where a.attrelid='public.order_items'::regclass and a.attname='order_id' and not a.attisdropped) <> 'uuid'::regtype
     or (select a.atttypid from pg_attribute a where a.attrelid='public.order_items'::regclass and a.attname='product_id' and not a.attisdropped) <> 'text'::regtype
     or (select a.atttypid from pg_attribute a where a.attrelid='public.admin_users'::regclass and a.attname='user_id' and not a.attisdropped) <> 'uuid'::regtype then
    raise exception 'Unsupported live schema types: expected UUID order/item/admin IDs and text order_items.product_id';
  end if;
  if to_regprocedure('public.is_admin()') is null or
     (select p.prorettype from pg_proc p where p.oid=to_regprocedure('public.is_admin()')) <> 'boolean'::regtype then
    raise exception 'Expected public.is_admin() with no arguments returning boolean; inspect the live admin authorization function before migration';
  end if;
  if not exists (
    select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attname='id'
    where c.conrelid='public.orders'::regclass and c.contype in ('p','u') and c.conkey=array[a.attnum]
  ) or not exists (
    select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attname='id'
    where c.conrelid='public.order_items'::regclass and c.contype in ('p','u') and c.conkey=array[a.attnum]
  ) then
    raise exception 'Expected orders.id and order_items.id to be primary or unique keys';
  end if;
  if exists (
    select 1 from information_schema.columns c where c.table_schema='public'
      and ((c.table_name='orders' and c.column_name in ('id','order_number','created_at') and c.column_default is null and c.is_identity<>'YES')
        or (c.table_name='order_items' and c.column_name='id' and c.column_default is null and c.is_identity<>'YES'))
  ) then
    raise exception 'Expected generated defaults for orders.id/order_number/created_at and order_items.id';
  end if;
end;
$$;

alter table public.orders
  add column if not exists consent_at timestamptz,
  add column if not exists version integer not null default 1,
  add column if not exists admin_metadata jsonb not null default '{"history":[],"delivery":{"note":""}}'::jsonb;
alter table public.order_items
  add column if not exists platform text not null default '',
  add column if not exists region text;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create table if not exists public.products (
  product_id text not null,
  region text not null default '',
  title text not null,
  platform text not null,
  currency text not null default 'RUB' check (currency = 'RUB'),
  unit_price numeric(12,2) not null check (unit_price > 0),
  active boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (product_id, region)
);
do $$
begin
  if (select a.atttypid from pg_attribute a where a.attrelid='public.products'::regclass and a.attname='product_id' and not a.attisdropped) <> 'text'::regtype
     or (select a.atttypid from pg_attribute a where a.attrelid='public.products'::regclass and a.attname='region' and not a.attisdropped) <> 'text'::regtype then
    raise exception 'Expected public.products product_id and region columns to be text';
  end if;
end;
$$;
create unique index if not exists products_variant_uidx on public.products(product_id,region);
alter table public.products enable row level security;
revoke all on public.products from public, anon, authenticated;
drop policy if exists "Anyone can view active products" on public.products;
create policy "Anyone can view active products" on public.products for select to anon, authenticated using (active);
drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
revoke all on public.admin_users from public, anon, authenticated;

-- RPC is intentionally the only public order-creation path. It looks up current
-- prices itself, rejects unavailable/unknown variants, and commits parent and
-- lines in one transaction. No service role key is exposed to the browser.
create or replace function public.place_public_order(
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_delivery_address text,
  p_customer_comment text,
  p_consent boolean,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id text;
  v_region text;
  v_qty integer;
  v_total numeric(12,2) := 0;
  v_lines jsonb := '[]'::jsonb;
  v_count integer;
begin
  if p_consent is distinct from true then raise exception 'Consent is required'; end if;
  if p_customer_name is null or length(btrim(p_customer_name)) not between 2 and 100 then raise exception 'Invalid customer name'; end if;
  if p_customer_phone is null or length(btrim(p_customer_phone)) not between 5 and 40 then raise exception 'Invalid phone'; end if;
  if p_customer_email is null or length(btrim(p_customer_email)) > 254 or p_customer_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$' then raise exception 'Invalid email'; end if;
  if p_delivery_address is null or length(btrim(p_delivery_address)) not between 3 and 500 then raise exception 'Invalid delivery details'; end if;
  if p_customer_comment is not null and length(p_customer_comment) > 1000 then raise exception 'Comment is too long'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Items must be an array'; end if;
  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 20 then raise exception 'Order must contain 1 to 20 lines'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'Invalid item'; end if;
    v_product_id := v_item->>'product_id';
    v_region := coalesce(v_item->>'region', '');
    if v_product_id is null or length(v_product_id) > 120 or length(v_region) > 100 then raise exception 'Invalid product variant'; end if;
    if (v_item->>'quantity') is null or (v_item->>'quantity') !~ '^[0-9]{1,2}$' then raise exception 'Invalid quantity'; end if;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty not between 1 and 10 then raise exception 'Quantity must be between 1 and 10'; end if;
    select * into v_product from public.products p
      where p.product_id = v_product_id and p.region = v_region and p.active = true for share;
    if not found then raise exception 'A product or region is unavailable: %', v_product_id; end if;
    if (v_item->>'expected_price') is null or (v_item->>'expected_price') !~ '^[0-9]+([.][0-9]{1,2})?$' or (v_item->>'expected_price')::numeric <> v_product.unit_price then
      raise exception 'The displayed price for product % is outdated. Refresh the catalog before ordering.', v_product_id;
    end if;
    v_total := v_total + v_product.unit_price * v_qty;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.product_id, 'product_name', v_product.title,
      'platform', v_product.platform, 'region', nullif(v_product.region, ''),
      'quantity', v_qty, 'unit_price', v_product.unit_price
    ));
  end loop;

  insert into public.orders (customer_name, customer_phone, customer_email, delivery_address, customer_comment, consent_at, status, total_amount)
  values (btrim(p_customer_name), btrim(p_customer_phone), lower(btrim(p_customer_email)), btrim(p_delivery_address), nullif(btrim(coalesce(p_customer_comment, '')), ''), now(), 'new', v_total)
  returning * into v_order;

  insert into public.order_items (order_id, product_id, product_name, platform, region, quantity, unit_price)
  select v_order.id, x->>'product_id', x->>'product_name', x->>'platform', x->>'region', (x->>'quantity')::integer, (x->>'unit_price')::numeric
  from jsonb_array_elements(v_lines) x;

  return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'created_at', v_order.created_at,
    'consent_at', v_order.consent_at, 'total_amount', v_order.total_amount, 'items', v_lines);
end;
$$;
-- PUBLIC includes every database role; explicitly clear any earlier grants too.
revoke all on function public.place_public_order(text,text,text,text,text,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.place_public_order(text,text,text,text,text,boolean,jsonb) to anon, authenticated;

-- Do not allow direct customer writes or reads. Retain the existing admin policies.
revoke all on public.orders, public.order_items from public, anon, authenticated;
grant select on public.orders, public.order_items to authenticated;
-- Narrow admin-edit grants only; RLS must still authorize the row.
grant update (status, version, admin_metadata, updated_at) on public.orders to authenticated;

commit;
