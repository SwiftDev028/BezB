-- Add catalog management, supplier mapping, account-owned orders and protected
-- digital-code fulfilment. Existing order tables and rows are preserved.
begin;

alter table public.products
  add column if not exists group_id uuid not null default gen_random_uuid(),
  add column if not exists slug text,
  add column if not exists description text not null default '',
  add column if not exists category text not null default 'apple',
  add column if not exists brand text not null default '',
  add column if not exists product_type text not null default 'gift-card',
  add column if not exists denomination numeric(12,2),
  add column if not exists denomination_currency text,
  add column if not exists image_url text,
  add column if not exists activation_instructions text not null default '',
  add column if not exists restrictions jsonb not null default '[]'::jsonb,
  add column if not exists availability text not null default 'unavailable',
  add column if not exists publication_status text not null default 'draft',
  add column if not exists popularity integer not null default 0,
  add column if not exists created_at timestamptz not null default now();
update public.products set slug = product_id || case when region = '' then '' else '-' || region end where slug is null;
alter table public.products alter column slug set not null;
create unique index if not exists products_slug_uidx on public.products (slug);
create index if not exists products_group_idx on public.products (group_id, region, denomination);
alter table public.products drop constraint if exists products_availability_check;
alter table public.products add constraint products_availability_check check (availability in ('in_stock','out_of_stock','unavailable'));
alter table public.products drop constraint if exists products_publication_status_check;
alter table public.products add constraint products_publication_status_check check (publication_status in ('draft','published','hidden'));
alter table public.products drop constraint if exists products_type_check;
alter table public.products add constraint products_type_check check (product_type in ('gift-card','game','subscription','topup'));
alter table public.products drop constraint if exists products_category_check;
alter table public.products add constraint products_category_check check (category in ('apple','xbox','playstation','steam','ai'));
alter table public.products drop constraint if exists products_denomination_check;
alter table public.products add constraint products_denomination_check check (denomination is null or denomination > 0);

create or replace function public.sync_product_active()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.active := new.publication_status = 'published' and new.availability = 'in_stock';
  return new;
end;
$$;
drop trigger if exists products_sync_active on public.products;
create trigger products_sync_active before insert or update of publication_status, availability on public.products
for each row execute function public.sync_product_active();

drop view if exists public.catalog_public;
create view public.catalog_public with (security_barrier = true) as
select product_id, group_id, slug, title, platform, currency, unit_price, region, description, category, brand,
       product_type, denomination, denomination_currency, image_url, activation_instructions, restrictions,
       popularity, availability, created_at, updated_at
from public.products where publication_status = 'published';
revoke all on public.products from public,anon;
revoke all on public.catalog_public from public,anon;
grant select on public.products to authenticated;
grant select on public.catalog_public to anon, authenticated;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  contact_url text,
  status text not null default 'active' check (status in ('active','inactive')),
  internal_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.supplier_products (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  product_id text not null,
  region text not null default '',
  supplier_sku text not null,
  purchase_cost numeric(12,2) not null check (purchase_cost >= 0),
  purchase_currency text not null default 'RUB',
  cost_updated_at timestamptz not null default now(),
  internal_notes text not null default '',
  created_at timestamptz not null default now(),
  constraint supplier_products_variant_fk foreign key (product_id,region) references public.products(product_id,region) on update cascade on delete cascade
);
create index if not exists supplier_products_variant_idx on public.supplier_products(product_id,region);

create table if not exists public.digital_codes (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  region text not null default '',
  secret_code text not null check (length(secret_code) between 1 and 4000),
  status text not null default 'available' check (status in ('available','reserved','delivered','void')),
  assigned_order_id uuid references public.orders(id) on delete restrict,
  assigned_order_item_id uuid references public.order_items(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  internal_note text not null default '',
  constraint digital_codes_variant_fk foreign key (product_id,region) references public.products(product_id,region) on update cascade on delete restrict,
  constraint digital_codes_assignment_consistency check ((status = 'available' and assigned_order_id is null and assigned_order_item_id is null) or (status in ('reserved','delivered') and assigned_order_id is not null and assigned_order_item_id is not null) or status = 'void')
);
create index if not exists digital_codes_stock_idx on public.digital_codes(product_id,region,created_at) where status='available';
create index if not exists digital_codes_order_idx on public.digital_codes(assigned_order_id) where assigned_order_id is not null;

create table if not exists public.order_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  digital_code_id uuid not null unique references public.digital_codes(id) on delete restrict,
  status text not null default 'reserved' check (status in ('reserved','delivered','released')),
  assigned_at timestamptz not null default now(),
  delivered_at timestamptz,
  released_at timestamptz,
  assigned_by uuid references auth.users(id) on delete set null,
  delivered_by uuid references auth.users(id) on delete set null
);
create index if not exists order_deliveries_order_idx on public.order_deliveries(order_id,status);
create index if not exists order_deliveries_item_idx on public.order_deliveries(order_item_id,status);
alter table public.order_deliveries drop constraint if exists order_deliveries_digital_code_id_key;
create unique index if not exists order_deliveries_active_code_uidx on public.order_deliveries(digital_code_id) where status in ('reserved','delivered');

create table if not exists public.order_audit_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  event_type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists order_audit_events_order_idx on public.order_audit_events(order_id,created_at desc);
create table if not exists public.order_idempotency (
  idempotency_key uuid not null,
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_user_id,idempotency_key)
);

alter table public.orders
  add column if not exists customer_user_id uuid references auth.users(id) on delete set null,
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists fulfillment_status text not null default 'new',
  add column if not exists payment_confirmed_at timestamptz,
  add column if not exists payment_confirmed_by uuid references auth.users(id) on delete set null,
  add column if not exists delivery_email_sent_at timestamptz,
  add column if not exists delivery_email_sent_by uuid references auth.users(id) on delete set null;
alter table public.order_items
  add column if not exists denomination numeric(12,2),
  add column if not exists denomination_currency text;
update public.orders set fulfillment_status = case status
  when 'confirmed' then 'processing' when 'processing' then 'processing'
  when 'shipped' then 'delivered' when 'completed' then 'delivered'
  when 'cancelled' then 'cancelled' else 'new' end where fulfillment_status='new';
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check check (payment_status in ('unpaid','paid','refunded'));
alter table public.orders drop constraint if exists orders_fulfillment_status_check;
alter table public.orders add constraint orders_fulfillment_status_check check (fulfillment_status in ('new','processing','awaiting_supplier','delivered','cancelled'));
create index if not exists orders_customer_user_created_idx on public.orders(customer_user_id,created_at desc) where customer_user_id is not null;

alter table public.suppliers enable row level security;
alter table public.supplier_products enable row level security;
alter table public.digital_codes enable row level security;
alter table public.order_deliveries enable row level security;
alter table public.order_audit_events enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Admins manage products" on public.products;
drop policy if exists "Anyone can view active products" on public.products;
create policy "Admins manage products" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins manage suppliers" on public.suppliers;
create policy "Admins manage suppliers" on public.suppliers for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins manage supplier products" on public.supplier_products;
create policy "Admins manage supplier products" on public.supplier_products for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins manage digital codes" on public.digital_codes;
create policy "Admins manage digital codes" on public.digital_codes for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins manage order deliveries" on public.order_deliveries;
create policy "Admins manage order deliveries" on public.order_deliveries for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins read order audit" on public.order_audit_events;
create policy "Admins read order audit" on public.order_audit_events for select to authenticated using (public.is_admin());
drop policy if exists "Customers view own orders" on public.orders;
create policy "Customers view own orders" on public.orders for select to authenticated using (customer_user_id = (select auth.uid()));
drop policy if exists "Customers view own order items" on public.order_items;
create policy "Customers view own order items" on public.order_items for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_items.order_id and o.customer_user_id = (select auth.uid()))
);

-- Keep admin_users private and use an explicit SECURITY DEFINER predicate.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admin_users a where a.user_id=(select auth.uid()));
$$;
revoke all on function public.is_admin() from public,anon;
grant execute on function public.is_admin() to authenticated;
revoke all on public.admin_users from public,anon,authenticated;
revoke all on public.suppliers,public.supplier_products,public.digital_codes,public.order_deliveries,public.order_audit_events from public,anon,authenticated;
grant select,insert,update,delete on public.products to authenticated;
grant select,insert,update,delete on public.suppliers,public.supplier_products to authenticated;
grant select,insert,update,delete on public.digital_codes,public.order_deliveries to authenticated;
grant select on public.order_audit_events to authenticated;
grant select on public.orders,public.order_items to authenticated;
revoke all on public.order_idempotency from public,anon,authenticated;

create or replace function public.log_order_action(p_order_id uuid,p_type text,p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.order_audit_events(order_id,event_type,actor_id,details)
  values(p_order_id,p_type,auth.uid(),coalesce(p_details,'{}'::jsonb));
end;
$$;
revoke all on function public.log_order_action(uuid,text,jsonb) from public;

-- Disable the earlier guest-order RPC: all new purchases must belong to the
-- confirmed email account used by the buyer's order history.
revoke all on function public.place_public_order(text,text,text,text,text,boolean,jsonb) from public,anon,authenticated;

create or replace function public.place_buyer_order(
  p_customer_name text,p_customer_phone text,p_customer_email text,p_delivery_address text,
  p_customer_comment text,p_consent boolean,p_items jsonb,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid(); v_confirmed_email text; v_reservation uuid; v_existing uuid;
  v_order public.orders%rowtype; v_item jsonb; v_product public.products%rowtype;
  v_product_id text; v_region text; v_qty integer; v_total numeric(12,2):=0;
  v_lines jsonb:='[]'::jsonb; v_count integer;
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;
  select email into v_confirmed_email from auth.users where id=v_user_id and email_confirmed_at is not null;
  if v_confirmed_email is null or lower(btrim(v_confirmed_email))<>lower(btrim(coalesce(p_customer_email,''))) then raise exception 'Use the confirmed email address on your account'; end if;
  if p_idempotency_key is null then raise exception 'Checkout request key is required'; end if;
  insert into public.order_idempotency(idempotency_key,customer_user_id) values(p_idempotency_key,v_user_id)
    on conflict do nothing returning idempotency_key into v_reservation;
  if v_reservation is null then
    select order_id into v_existing from public.order_idempotency where idempotency_key=p_idempotency_key and customer_user_id=v_user_id;
    if v_existing is null then raise exception 'Previous checkout request is still processing'; end if;
    select * into v_order from public.orders where id=v_existing;
    select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'product_name',product_name,'platform',platform,'region',region,'denomination',denomination,'denomination_currency',denomination_currency,'quantity',quantity,'unit_price',unit_price)),'[]'::jsonb)
      into v_lines from public.order_items where order_id=v_existing;
    return jsonb_build_object('id',v_order.id,'order_number',v_order.order_number,'created_at',v_order.created_at,'consent_at',v_order.consent_at,'total_amount',v_order.total_amount,'items',v_lines);
  end if;
  if p_consent is distinct from true then raise exception 'Consent is required'; end if;
  if p_customer_name is null or length(btrim(p_customer_name)) not between 2 and 100 then raise exception 'Invalid customer name'; end if;
  if p_customer_phone is null or length(btrim(p_customer_phone)) not between 5 and 40 then raise exception 'Invalid phone'; end if;
  if p_delivery_address is null or length(btrim(p_delivery_address)) not between 3 and 500 then raise exception 'Invalid delivery details'; end if;
  if p_customer_comment is not null and length(p_customer_comment)>1000 then raise exception 'Comment is too long'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Items must be an array'; end if;
  v_count:=jsonb_array_length(p_items);
  if v_count<1 or v_count>20 then raise exception 'Order must contain 1 to 20 lines'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'Invalid item'; end if;
    v_product_id:=v_item->>'product_id'; v_region:=coalesce(v_item->>'region','');
    if v_product_id is null or length(v_product_id)>120 or length(v_region)>100 then raise exception 'Invalid product variant'; end if;
    if (v_item->>'quantity') is null or (v_item->>'quantity') !~ '^[0-9]{1,2}$' then raise exception 'Invalid quantity'; end if;
    v_qty:=(v_item->>'quantity')::integer;
    if v_qty not between 1 and 10 then raise exception 'Quantity must be between 1 and 10'; end if;
    select * into v_product from public.products p where p.product_id=v_product_id and p.region=v_region
      and p.active=true and p.publication_status='published' and p.availability='in_stock' for share;
    if not found then raise exception 'A product or region is unavailable: %',v_product_id; end if;
    if (v_item->>'expected_price') is null or (v_item->>'expected_price') !~ '^[0-9]+([.][0-9]{1,2})?$'
      or (v_item->>'expected_price')::numeric<>v_product.unit_price then raise exception 'Displayed price is outdated for product %',v_product_id; end if;
    v_total:=v_total+v_product.unit_price*v_qty;
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object('product_id',v_product.product_id,'product_name',v_product.title,'platform',v_product.platform,
      'region',nullif(v_product.region,''),'denomination',v_product.denomination,'denomination_currency',v_product.denomination_currency,
      'quantity',v_qty,'unit_price',v_product.unit_price));
  end loop;
  insert into public.orders(customer_name,customer_phone,customer_email,delivery_address,customer_comment,consent_at,status,total_amount,customer_user_id,payment_status,fulfillment_status)
    values(btrim(p_customer_name),btrim(p_customer_phone),lower(btrim(p_customer_email)),btrim(p_delivery_address),nullif(btrim(coalesce(p_customer_comment,'')),''),now(),'new',v_total,v_user_id,'unpaid','new') returning * into v_order;
  insert into public.order_items(order_id,product_id,product_name,platform,region,denomination,denomination_currency,quantity,unit_price)
    select v_order.id,x->>'product_id',x->>'product_name',x->>'platform',x->>'region',(x->>'denomination')::numeric,x->>'denomination_currency',(x->>'quantity')::integer,(x->>'unit_price')::numeric from jsonb_array_elements(v_lines) x;
  update public.order_idempotency set order_id=v_order.id where customer_user_id=v_user_id and idempotency_key=p_idempotency_key;
  perform public.log_order_action(v_order.id,'order_created','{}'::jsonb);
  return jsonb_build_object('id',v_order.id,'order_number',v_order.order_number,'created_at',v_order.created_at,'consent_at',v_order.consent_at,'total_amount',v_order.total_amount,'items',v_lines);
end;
$$;

create or replace function public.admin_confirm_payment(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  select status into v_status from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_status='cancelled' then raise exception 'Cancelled order cannot be paid'; end if;
  update public.orders set payment_status='paid',payment_confirmed_at=now(),payment_confirmed_by=auth.uid(),status='confirmed',version=version+1,updated_at=now() where id=p_order_id;
  perform public.log_order_action(p_order_id,'payment_confirmed','{}'::jsonb);
end;
$$;

create or replace function public.admin_start_processing(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  update public.orders set status='processing',fulfillment_status='processing',version=version+1,updated_at=now()
    where id=p_order_id and payment_status='paid' and status not in ('cancelled','completed');
  if not found then raise exception 'Order must be paid and active before processing'; end if;
  perform public.log_order_action(p_order_id,'processing_started','{}'::jsonb);
end;
$$;

create or replace function public.admin_cancel_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  if exists(select 1 from public.orders where id=p_order_id and status in ('completed','shipped')) then raise exception 'Delivered order cannot be cancelled'; end if;
  update public.digital_codes c set status='available',assigned_order_id=null,assigned_order_item_id=null
    from public.order_deliveries d where d.order_id=p_order_id and d.status='reserved' and c.id=d.digital_code_id;
  update public.order_deliveries set status='released',released_at=now() where order_id=p_order_id and status='reserved';
  update public.orders set status='cancelled',fulfillment_status='cancelled',version=version+1,updated_at=now() where id=p_order_id and status<>'cancelled';
  if not found then raise exception 'Order not found or already cancelled'; end if;
  perform public.log_order_action(p_order_id,'order_cancelled','{}'::jsonb);
end;
$$;

create or replace function public.admin_assign_code(p_order_id uuid,p_order_item_id uuid,p_code_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_item public.order_items%rowtype; v_code public.digital_codes%rowtype; v_assigned integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.payment_status<>'paid' or v_order.status in ('cancelled','completed') then raise exception 'Order must be paid and active'; end if;
  select * into v_item from public.order_items where id=p_order_item_id and order_id=p_order_id;
  if not found then raise exception 'Order line does not belong to order'; end if;
  select * into v_code from public.digital_codes where id=p_code_id for update;
  if not found or v_code.status<>'available' or v_code.product_id::text<>v_item.product_id::text or v_code.region<>coalesce(v_item.region,'') then raise exception 'Code is unavailable or does not match this product variant'; end if;
  select count(*) into v_assigned from public.order_deliveries where order_item_id=p_order_item_id and status='reserved';
  if v_assigned >= v_item.quantity then raise exception 'All units of this line already have codes'; end if;
  insert into public.order_deliveries(order_id,order_item_id,digital_code_id,assigned_by) values(p_order_id,p_order_item_id,p_code_id,auth.uid());
  update public.digital_codes set status='reserved',assigned_order_id=p_order_id,assigned_order_item_id=p_order_item_id where id=p_code_id;
  update public.orders set fulfillment_status='awaiting_supplier',version=version+1,updated_at=now() where id=p_order_id;
  perform public.log_order_action(p_order_id,'code_assigned',jsonb_build_object('code_id',p_code_id,'order_item_id',p_order_item_id));
end;
$$;

create or replace function public.admin_deliver_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_expected bigint; v_reserved bigint;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  if not exists(select 1 from public.orders where id=p_order_id and payment_status='paid' and status not in ('cancelled','completed')) then raise exception 'Order must be paid and active before delivery'; end if;
  select coalesce(sum(quantity),0) into v_expected from public.order_items where order_id=p_order_id;
  select count(*) into v_reserved from public.order_deliveries where order_id=p_order_id and status='reserved';
  if v_expected=0 or v_reserved<>v_expected then raise exception 'Assign one available code for each ordered unit first'; end if;
  update public.digital_codes c set status='delivered',delivered_at=now() from public.order_deliveries d where d.order_id=p_order_id and d.status='reserved' and c.id=d.digital_code_id;
  update public.order_deliveries set status='delivered',delivered_at=now(),delivered_by=auth.uid() where order_id=p_order_id and status='reserved';
  update public.orders set status='completed',fulfillment_status='delivered',version=version+1,updated_at=now() where id=p_order_id;
  perform public.log_order_action(p_order_id,'digital_goods_delivered','{}'::jsonb);
end;
$$;

create or replace function public.admin_mark_delivery_email_sent(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  update public.orders set delivery_email_sent_at=now(),delivery_email_sent_by=auth.uid(),version=version+1,updated_at=now()
    where id=p_order_id and fulfillment_status='delivered';
  if not found then raise exception 'Codes must be delivered before recording email'; end if;
  perform public.log_order_action(p_order_id,'delivery_email_marked_sent','{}'::jsonb);
end;
$$;

create or replace function public.my_delivered_codes()
returns table(order_id uuid,order_number text,product_name text,region text,code text,activation_instructions text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  return query select d.order_id,o.order_number,i.product_name,nullif(c.region,''),c.secret_code,p.activation_instructions
    from public.order_deliveries d
    join public.orders o on o.id=d.order_id
    join public.order_items i on i.id=d.order_item_id
    join public.digital_codes c on c.id=d.digital_code_id
    join public.products p on p.product_id=c.product_id and p.region=c.region
    where o.customer_user_id=(select auth.uid()) and o.payment_status='paid' and o.fulfillment_status='delivered'
      and d.status='delivered' and c.status='delivered';
end;
$$;

revoke all on function public.admin_confirm_payment(uuid) from public;
revoke all on function public.admin_start_processing(uuid) from public;
revoke all on function public.admin_cancel_order(uuid) from public;
revoke all on function public.admin_assign_code(uuid,uuid,uuid) from public;
revoke all on function public.admin_deliver_order(uuid) from public;
revoke all on function public.admin_mark_delivery_email_sent(uuid) from public;
revoke all on function public.my_delivered_codes() from public;
revoke all on function public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid) from public;
grant execute on function public.admin_confirm_payment(uuid) to authenticated;
grant execute on function public.admin_start_processing(uuid) to authenticated;
grant execute on function public.admin_cancel_order(uuid) to authenticated;
grant execute on function public.admin_assign_code(uuid,uuid,uuid) to authenticated;
grant execute on function public.admin_deliver_order(uuid) to authenticated;
grant execute on function public.admin_mark_delivery_email_sent(uuid) to authenticated;
grant execute on function public.my_delivered_codes() to authenticated;
grant execute on function public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid) to authenticated;

commit;
