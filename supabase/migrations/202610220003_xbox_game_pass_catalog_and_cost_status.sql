-- Structured subscription terms and safe checkout snapshots for existing Xbox variants.
-- Existing product metadata and publication state are preserved.
begin;

alter table public.products
  add column if not exists subscription_months smallint,
  add column if not exists subscription_bonus_months smallint not null default 0;

alter table public.order_items
  add column if not exists subscription_months smallint,
  add column if not exists subscription_bonus_months smallint not null default 0;

alter table public.products drop constraint if exists products_subscription_months_check;
alter table public.products add constraint products_subscription_months_check
  check (subscription_months is null or subscription_months between 1 and 120);
alter table public.products drop constraint if exists products_subscription_bonus_months_check;
alter table public.products add constraint products_subscription_bonus_months_check
  check (subscription_bonus_months between 0 and 120 and (subscription_bonus_months = 0 or subscription_months is not null));
alter table public.order_items drop constraint if exists order_items_subscription_months_check;
alter table public.order_items add constraint order_items_subscription_months_check
  check (subscription_months is null or subscription_months between 1 and 120);
alter table public.order_items drop constraint if exists order_items_subscription_bonus_months_check;
alter table public.order_items add constraint order_items_subscription_bonus_months_check
  check (subscription_bonus_months between 0 and 120 and (subscription_bonus_months = 0 or subscription_months is not null));

-- Supplier-linked costs keep their existing required supplier and SKU fields.
-- Missing legacy classification is never treated as confirmation.
alter table public.supplier_products
  add column if not exists purchase_cost_status text not null default 'unverified';
alter table public.supplier_products drop constraint if exists supplier_products_purchase_cost_status_check;
alter table public.supplier_products add constraint supplier_products_purchase_cost_status_check
  check (purchase_cost_status in ('confirmed', 'estimate', 'unverified'));

-- Owner-maintained internal costs do not represent supplier mappings.
create table if not exists public.internal_purchase_costs (
  product_id text not null,
  region text not null default '',
  purchase_cost numeric(12,2) not null check (purchase_cost >= 0),
  purchase_currency text not null default 'RUB' check (purchase_currency = 'RUB'),
  purchase_cost_status text not null default 'unverified'
    check (purchase_cost_status in ('confirmed', 'estimate', 'unverified')),
  cost_updated_at timestamptz not null default now(),
  internal_notes text not null default '',
  primary key (product_id, region),
  constraint internal_purchase_costs_variant_fk
    foreign key (product_id, region) references public.products(product_id, region)
    on update cascade on delete cascade
);
alter table public.internal_purchase_costs enable row level security;
revoke all on public.internal_purchase_costs from public, anon, authenticated;
grant select, insert, update, delete on public.internal_purchase_costs to authenticated;
drop policy if exists "Admins manage internal purchase costs" on public.internal_purchase_costs;
create policy "Admins manage internal purchase costs" on public.internal_purchase_costs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "BezB internal purchase costs admin boundary" on public.internal_purchase_costs;
create policy "BezB internal purchase costs admin boundary" on public.internal_purchase_costs
  as restrictive for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Fail closed if a previous/manual schema uses incompatible types.
do $$
declare
  v_types text[];
begin
  select array_agg(pg_catalog.format_type(a.atttypid, a.atttypmod) order by a.attname)
    into v_types
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.products'::regclass
    and a.attname in ('subscription_months', 'subscription_bonus_months')
    and a.attnum > 0 and not a.attisdropped;
  if v_types is distinct from array['smallint', 'smallint']::text[] then
    raise exception 'Expected products subscription term columns to be smallint; found %', v_types;
  end if;
  select array_agg(pg_catalog.format_type(a.atttypid, a.atttypmod) order by a.attname)
    into v_types
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.order_items'::regclass
    and a.attname in ('subscription_months', 'subscription_bonus_months')
    and a.attnum > 0 and not a.attisdropped;
  if v_types is distinct from array['smallint', 'smallint']::text[] then
    raise exception 'Expected order_items subscription term columns to be smallint; found %', v_types;
  end if;
  if (select a.atttypid from pg_catalog.pg_attribute a where a.attrelid='public.supplier_products'::regclass and a.attname='purchase_cost_status' and not a.attisdropped) <> 'text'::regtype then
    raise exception 'Expected supplier_products.purchase_cost_status to be text';
  end if;
end;
$$;

-- Fail closed when the local migration assumptions do not match the live
-- catalog/order-item schema. The seed statements supply all fields that have
-- no defaults; unexpected NOT NULL columns abort before catalog/function DDL.
do $$
declare
  v_missing text;
begin
  select string_agg(required.table_name || '.' || required.column_name, ', ' order by required.table_name, required.column_name)
    into v_missing
  from (values
    ('products','product_id'),('products','region'),('products','group_id'),('products','slug'),
    ('products','title'),('products','brand'),('products','platform'),('products','currency'),
    ('products','unit_price'),('products','active'),('products','category'),('products','product_type'),
    ('products','denomination'),('products','denomination_currency'),('products','subscription_months'),
    ('products','subscription_bonus_months'),('products','availability'),('products','publication_status'),
    ('products','description'),('products','activation_instructions'),('products','restrictions'),
    ('products','created_at'),('products','updated_at'),
    ('order_items','order_id'),('order_items','product_id'),('order_items','product_name'),
    ('order_items','platform'),('order_items','region'),('order_items','denomination'),
    ('order_items','denomination_currency'),('order_items','subscription_months'),
    ('order_items','subscription_bonus_months'),('order_items','quantity'),('order_items','unit_price'),
    ('internal_purchase_costs','product_id'),('internal_purchase_costs','region'),
    ('internal_purchase_costs','purchase_cost'),('internal_purchase_costs','purchase_currency'),
    ('internal_purchase_costs','purchase_cost_status'),('internal_purchase_costs','cost_updated_at'),
    ('internal_purchase_costs','internal_notes')
  ) as required(table_name, column_name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = required.table_name
      and c.column_name = required.column_name
  );
  if v_missing is not null then
    raise exception 'Xbox Game Pass migration requires missing columns: %', v_missing;
  end if;

  select string_agg(required.table_name || '.' || required.column_name || '=' || c.data_type, ', ' order by required.table_name, required.column_name)
    into v_missing
  from (values
    ('products','product_id','text'),('products','region','text'),('products','group_id','uuid'),
    ('products','slug','text'),('products','title','text'),('products','brand','text'),
    ('products','platform','text'),('products','currency','text'),('products','unit_price','numeric'),
    ('products','active','boolean'),('products','category','text'),('products','product_type','text'),
    ('products','denomination','numeric'),('products','denomination_currency','text'),
    ('products','subscription_months','smallint'),('products','subscription_bonus_months','smallint'),
    ('products','availability','text'),('products','publication_status','text'),('products','description','text'),
    ('products','activation_instructions','text'),('products','restrictions','jsonb'),
    ('products','created_at','timestamp with time zone'),('products','updated_at','timestamp with time zone'),
    ('order_items','order_id','uuid'),('order_items','product_id','text'),('order_items','product_name','text'),
    ('order_items','platform','text'),('order_items','region','text'),('order_items','denomination','numeric'),
    ('order_items','denomination_currency','text'),('order_items','subscription_months','smallint'),
    ('order_items','subscription_bonus_months','smallint'),('order_items','quantity','integer'),
    ('order_items','unit_price','numeric'),('order_items','id','uuid'),
    ('internal_purchase_costs','product_id','text'),('internal_purchase_costs','region','text'),
    ('internal_purchase_costs','purchase_cost','numeric'),('internal_purchase_costs','purchase_currency','text'),
    ('internal_purchase_costs','purchase_cost_status','text'),('internal_purchase_costs','cost_updated_at','timestamp with time zone'),
    ('internal_purchase_costs','internal_notes','text'),
    ('orders','delivery_address','text'),
    ('supplier_products','purchase_cost_status','text')
  ) as required(table_name,column_name,data_type)
  join information_schema.columns c
    on c.table_schema='public' and c.table_name=required.table_name and c.column_name=required.column_name
  where c.data_type is distinct from required.data_type;
  if v_missing is not null then
    raise exception 'Xbox Game Pass migration found incompatible column types: %', v_missing;
  end if;

  select string_agg(format('%I.%I', t.relname, a.attname), ', ' order by t.relname, a.attname)
    into v_missing
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class t on t.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = t.relnamespace
  left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where n.nspname = 'public' and t.relname in ('products', 'order_items', 'internal_purchase_costs')
    and a.attnum > 0 and not a.attisdropped and a.attnotnull
    and a.attgenerated = '' and a.attidentity = '' and d.oid is null
    and not (
      (t.relname = 'products' and a.attname::text = any(array[
        'product_id','region','group_id','slug','title','brand','platform','currency','unit_price',
        'active','category','product_type','denomination','denomination_currency','subscription_months',
        'subscription_bonus_months','availability','publication_status','description',
        'activation_instructions','restrictions'
      ]))
      or
      (t.relname = 'order_items' and a.attname::text = any(array[
        'order_id','product_id','product_name','platform','region','denomination',
        'denomination_currency','subscription_months','subscription_bonus_months','quantity','unit_price'
      ]))
      or
      (t.relname = 'internal_purchase_costs' and a.attname::text = any(array[
        'product_id','region','purchase_cost','purchase_currency','purchase_cost_status','internal_notes'
      ]))
    );
  if v_missing is not null then
    raise exception 'Required columns without defaults are not populated by this migration: %', v_missing;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_index i
    join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attname = 'slug'
    where i.indrelid = 'public.products'::regclass and i.indisunique and i.indisvalid
      and i.indpred is null and i.indexprs is null and i.indnkeyatts = 1
      and i.indkey[0] = a.attnum
  ) then
    raise exception 'Expected a valid unique index on products.slug';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.products'::regclass and c.contype in ('p','u')
      and c.conkey = array[
        (select attnum from pg_catalog.pg_attribute where attrelid='public.products'::regclass and attname='product_id' and not attisdropped),
        (select attnum from pg_catalog.pg_attribute where attrelid='public.products'::regclass and attname='region' and not attisdropped)
      ]::smallint[]
  ) and not exists (
    select 1 from pg_catalog.pg_index i
    where i.indrelid = 'public.products'::regclass and i.indisunique and i.indisvalid
      and i.indpred is null and i.indexprs is null and i.indnkeyatts = 2
      and i.indkey[0] = (select attnum from pg_catalog.pg_attribute where attrelid='public.products'::regclass and attname='product_id' and not attisdropped)
      and i.indkey[1] = (select attnum from pg_catalog.pg_attribute where attrelid='public.products'::regclass and attname='region' and not attisdropped)
  ) then
    raise exception 'Expected a unique products(product_id, region) key';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.internal_purchase_costs'::regclass and c.contype in ('p','u')
      and c.conkey = array[
        (select attnum from pg_catalog.pg_attribute where attrelid='public.internal_purchase_costs'::regclass and attname='product_id' and not attisdropped),
        (select attnum from pg_catalog.pg_attribute where attrelid='public.internal_purchase_costs'::regclass and attname='region' and not attisdropped)
      ]::smallint[]
  ) then
    raise exception 'Expected a unique internal_purchase_costs(product_id, region) key';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='products' and column_name='slug' and is_nullable='YES'
  ) then
    raise exception 'Expected products.slug to be NOT NULL';
  end if;

  if (select column_default from information_schema.columns where table_schema='public' and table_name='products' and column_name='created_at') is null
     or (select column_default from information_schema.columns where table_schema='public' and table_name='products' and column_name='updated_at') is null
     or (select column_default from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='id') is null then
    raise exception 'Expected defaults for products.created_at/updated_at and order_items.id';
  end if;
end;
$$;

-- Check view compatibility before CREATE OR REPLACE VIEW (which may only
-- append columns without changing existing names/order/types).
do $$
declare
  v_columns text[];
begin
  if not exists (
    select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='catalog_public' and c.relkind='v'
  ) then
    raise exception 'Expected public.catalog_public view before replacing it';
  end if;
  select array_agg(a.attname order by a.attnum) into v_columns
  from pg_catalog.pg_attribute a
  where a.attrelid='public.catalog_public'::regclass and a.attnum>0 and not a.attisdropped;
  if v_columns is distinct from array[
    'product_id','group_id','slug','title','platform','currency','unit_price','region','description',
    'category','brand','product_type','denomination','denomination_currency','image_url',
    'activation_instructions','restrictions','popularity','availability','created_at','updated_at'
  ]::text[] and v_columns is distinct from array[
    'product_id','group_id','slug','title','platform','currency','unit_price','region','description',
    'category','brand','product_type','denomination','denomination_currency','image_url',
    'activation_instructions','restrictions','popularity','availability','created_at','updated_at',
    'subscription_months','subscription_bonus_months'
  ]::text[] then
    raise exception 'Unexpected public.catalog_public column layout: %', v_columns;
  end if;
  if not has_table_privilege('anon','public.catalog_public','SELECT')
     or not has_table_privilege('authenticated','public.catalog_public','SELECT') then
    raise exception 'Expected anon and authenticated SELECT on public.catalog_public';
  end if;
end;
$$;

-- Verify the checkout RPCs before replacement so an unexpected function body,
-- signature, or ACL cannot be silently overwritten by this migration.
do $$
declare
  v_public_oid oid := to_regprocedure('public.place_public_order(text,text,text,text,text,boolean,jsonb)');
  v_buyer_oid oid := to_regprocedure('public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)');
  v_public_src text;
  v_buyer_src text;
begin
  if v_public_oid is null or v_buyer_oid is null then
    raise exception 'Expected both checkout RPC signatures before migration 003';
  end if;
  if not (select prosecdef and prorettype='jsonb'::regtype from pg_catalog.pg_proc where oid=v_public_oid)
     or not (select prosecdef and prorettype='jsonb'::regtype from pg_catalog.pg_proc where oid=v_buyer_oid) then
    raise exception 'Checkout RPCs must remain SECURITY DEFINER functions returning jsonb';
  end if;
  select prosrc into v_public_src from pg_catalog.pg_proc where oid=v_public_oid;
  select prosrc into v_buyer_src from pg_catalog.pg_proc where oid=v_buyer_oid;
  if v_public_src not like '%p_consent is distinct from true%'
     or v_public_src not like '%p_customer_email%'
     or v_public_src not like '%v_qty not between 1 and 10%'
     or v_public_src not like '%expected_price%'
     or v_public_src not like '%publication_status%'
     or v_public_src not like '%availability%' then
    raise exception 'place_public_order does not match the expected validated checkout implementation';
  end if;
  if v_buyer_src not like '%email_confirmed_at%'
     or v_buyer_src not like '%p_idempotency_key%'
     or v_buyer_src not like '%p_consent is distinct from true%'
     or v_buyer_src not like '%v_qty not between 1 and 10%'
     or v_buyer_src not like '%expected_price%'
     or v_buyer_src not like '%log_order_action%' then
    raise exception 'place_buyer_order does not match the expected validated/idempotent implementation';
  end if;
  if not has_function_privilege('anon',v_public_oid,'EXECUTE')
     or not has_function_privilege('authenticated',v_public_oid,'EXECUTE')
     or has_function_privilege('anon',v_buyer_oid,'EXECUTE')
     or not has_function_privilege('authenticated',v_buyer_oid,'EXECUTE') then
    raise exception 'Checkout RPC EXECUTE grants differ from the expected anon/authenticated roles';
  end if;
end;
$$;

-- Reject occupied IDs/slugs, wrong group assignments, retail values, product
-- states, or procurement records before writing any of the 15 catalog rows.
-- Exact matching rows are accepted so a full rerun is a no-op; nothing updates
-- an existing product or cost automatically.
do $$
declare
  v_conflict text;
begin
  with seed(group_key, product_id, slug, title, months, bonus_months, retail_price) as (
    values
      ('ultimate','xbox-game-pass-ultimate-1-month','xbox-game-pass-ultimate-1-month','Xbox Game Pass Ultimate',1,0,1490),
      ('ultimate','xbox-game-pass-ultimate-2-months','xbox-game-pass-ultimate-2-months','Xbox Game Pass Ultimate',2,0,2790),
      ('ultimate','xbox-game-pass-ultimate-3-months','xbox-game-pass-ultimate-3-months','Xbox Game Pass Ultimate',3,0,3490),
      ('ultimate','xbox-game-pass-ultimate-4-months','xbox-game-pass-ultimate-4-months','Xbox Game Pass Ultimate',4,0,4990),
      ('ultimate','xbox-game-pass-ultimate-5-months','xbox-game-pass-ultimate-5-months','Xbox Game Pass Ultimate',5,0,6310),
      ('ultimate','xbox-game-pass-ultimate-6-months','xbox-game-pass-ultimate-6-months','Xbox Game Pass Ultimate',6,0,6990),
      ('ultimate','xbox-game-pass-ultimate-7-months','xbox-game-pass-ultimate-7-months','Xbox Game Pass Ultimate',7,0,7670),
      ('ultimate','xbox-game-pass-ultimate-11-months','xbox-game-pass-ultimate-11-months','Xbox Game Pass Ultimate',11,0,10390),
      ('ultimate','xbox-game-pass-ultimate-12-months-bonus-1','xbox-game-pass-ultimate-12-months-bonus-1','Xbox Game Pass Ultimate',12,1,10990),
      ('premium','xbox-game-pass-premium-1-month','xbox-game-pass-premium-1-month','Xbox Game Pass Premium',1,0,1290),
      ('essential','xbox-game-pass-essential-3-months','xbox-game-pass-essential-3-months','Xbox Game Pass Essential',3,0,1790),
      ('pc','pc-game-pass-3-months','pc-game-pass-3-months','PC Game Pass',3,0,1990),
      ('pc','pc-game-pass-6-months','pc-game-pass-6-months','PC Game Pass',6,0,3790),
      ('pc','pc-game-pass-9-months','pc-game-pass-9-months','PC Game Pass',9,0,4990),
      ('pc','pc-game-pass-12-months','pc-game-pass-12-months','PC Game Pass',12,0,5990)
  )
  select string_agg(s.product_id, ', ' order by s.product_id) into v_conflict
  from seed s
  join public.products p on p.product_id=s.product_id and p.region=''
  where p.slug is distinct from s.slug
     or p.currency is distinct from 'RUB'
     or p.unit_price is distinct from s.retail_price::numeric
     or p.active is distinct from false
     or p.category is distinct from 'xbox'
     or p.product_type is distinct from 'subscription'
     or p.denomination is not null
     or p.denomination_currency is not null
     or (p.subscription_months is not null and p.subscription_months is distinct from s.months::smallint)
     or (p.subscription_bonus_months is not null and p.subscription_bonus_months is distinct from s.bonus_months::smallint)
     or p.availability is distinct from 'unavailable'
     or p.publication_status is distinct from 'draft';
  if v_conflict is not null then
    raise exception 'Existing Xbox product variants conflict with migration seed (ID/slug/group metadata/retail price/status): %', v_conflict;
  end if;

  with seed(product_id, slug) as (
    values
      ('xbox-game-pass-ultimate-1-month','xbox-game-pass-ultimate-1-month'),
      ('xbox-game-pass-ultimate-2-months','xbox-game-pass-ultimate-2-months'),
      ('xbox-game-pass-ultimate-3-months','xbox-game-pass-ultimate-3-months'),
      ('xbox-game-pass-ultimate-4-months','xbox-game-pass-ultimate-4-months'),
      ('xbox-game-pass-ultimate-5-months','xbox-game-pass-ultimate-5-months'),
      ('xbox-game-pass-ultimate-6-months','xbox-game-pass-ultimate-6-months'),
      ('xbox-game-pass-ultimate-7-months','xbox-game-pass-ultimate-7-months'),
      ('xbox-game-pass-ultimate-11-months','xbox-game-pass-ultimate-11-months'),
      ('xbox-game-pass-ultimate-12-months-bonus-1','xbox-game-pass-ultimate-12-months-bonus-1'),
      ('xbox-game-pass-premium-1-month','xbox-game-pass-premium-1-month'),
      ('xbox-game-pass-essential-3-months','xbox-game-pass-essential-3-months'),
      ('pc-game-pass-3-months','pc-game-pass-3-months'),
      ('pc-game-pass-6-months','pc-game-pass-6-months'),
      ('pc-game-pass-9-months','pc-game-pass-9-months'),
      ('pc-game-pass-12-months','pc-game-pass-12-months')
  )
  select string_agg(p.product_id, ', ' order by p.product_id) into v_conflict
  from public.products p join seed s on p.slug=s.slug
  where (p.product_id,p.region) is distinct from (s.product_id,'');
  if v_conflict is not null then
    raise exception 'Xbox seed slug already belongs to another product variant: %', v_conflict;
  end if;

  with seed(product_id) as (
    values
      ('xbox-game-pass-ultimate-1-month'),('xbox-game-pass-ultimate-2-months'),
      ('xbox-game-pass-ultimate-3-months'),('xbox-game-pass-ultimate-4-months'),
      ('xbox-game-pass-ultimate-5-months'),('xbox-game-pass-ultimate-6-months'),
      ('xbox-game-pass-ultimate-7-months'),('xbox-game-pass-ultimate-11-months'),
      ('xbox-game-pass-ultimate-12-months-bonus-1'),('xbox-game-pass-premium-1-month'),
      ('xbox-game-pass-essential-3-months'),('pc-game-pass-3-months'),('pc-game-pass-6-months'),
      ('pc-game-pass-9-months'),('pc-game-pass-12-months')
  )
  select string_agg(p.product_id, ', ' order by p.product_id) into v_conflict
  from public.products p join seed s on s.product_id=p.product_id
  where p.region <> '';
  if v_conflict is not null then
    raise exception 'Xbox seed product_id already exists in another region: %', v_conflict;
  end if;

  with seed(group_key, product_id) as (
    values
      ('ultimate','xbox-game-pass-ultimate-1-month'),('ultimate','xbox-game-pass-ultimate-2-months'),
      ('ultimate','xbox-game-pass-ultimate-3-months'),('ultimate','xbox-game-pass-ultimate-4-months'),
      ('ultimate','xbox-game-pass-ultimate-5-months'),('ultimate','xbox-game-pass-ultimate-6-months'),
      ('ultimate','xbox-game-pass-ultimate-7-months'),('ultimate','xbox-game-pass-ultimate-11-months'),
      ('ultimate','xbox-game-pass-ultimate-12-months-bonus-1'),
      ('premium','xbox-game-pass-premium-1-month'),('essential','xbox-game-pass-essential-3-months'),
      ('pc','pc-game-pass-3-months'),('pc','pc-game-pass-6-months'),('pc','pc-game-pass-9-months'),
      ('pc','pc-game-pass-12-months')
  ), existing_groups as (
    select s.group_key, p.group_id
    from seed s join public.products p on p.product_id=s.product_id and p.region=''
    group by s.group_key,p.group_id
  )
  select string_agg(group_key, ', ' order by group_key) into v_conflict
  from (
    select group_key from existing_groups group by group_key having count(*) > 1
  ) conflicts;
  if v_conflict is not null then
    raise exception 'Existing Xbox variants in these families have inconsistent group_id values: %', v_conflict;
  end if;

  with seed(group_key, product_id) as (
    values
      ('ultimate','xbox-game-pass-ultimate-1-month'),('ultimate','xbox-game-pass-ultimate-2-months'),
      ('ultimate','xbox-game-pass-ultimate-3-months'),('ultimate','xbox-game-pass-ultimate-4-months'),
      ('ultimate','xbox-game-pass-ultimate-5-months'),('ultimate','xbox-game-pass-ultimate-6-months'),
      ('ultimate','xbox-game-pass-ultimate-7-months'),('ultimate','xbox-game-pass-ultimate-11-months'),
      ('ultimate','xbox-game-pass-ultimate-12-months-bonus-1'),
      ('premium','xbox-game-pass-premium-1-month'),('essential','xbox-game-pass-essential-3-months'),
      ('pc','pc-game-pass-3-months'),('pc','pc-game-pass-6-months'),('pc','pc-game-pass-9-months'),
      ('pc','pc-game-pass-12-months')
  ), existing_groups as (
    select distinct s.group_key,p.group_id
    from seed s join public.products p on p.product_id=s.product_id and p.region=''
  ), family_ids as (
    select group_key, min(group_id::text) as group_id from existing_groups group by group_key
  )
  select string_agg(a.group_key || '/' || b.group_key, ', ' order by a.group_key, b.group_key)
    into v_conflict
  from family_ids a join family_ids b on a.group_key < b.group_key and a.group_id=b.group_id;
  if v_conflict is not null then
    raise exception 'Existing Xbox product families share a group_id: %', v_conflict;
  end if;

  with costs(product_id, retail_price, cost, cost_status) as (
    values
      ('xbox-game-pass-ultimate-1-month',1490,1199,'confirmed'),
      ('xbox-game-pass-ultimate-2-months',2790,2300,'confirmed'),
      ('xbox-game-pass-ultimate-3-months',3490,2900,'confirmed'),
      ('xbox-game-pass-ultimate-4-months',4990,4500,'confirmed'),
      ('xbox-game-pass-ultimate-5-months',6310,5044,'estimate'),
      ('xbox-game-pass-ultimate-6-months',6990,5589,'estimate'),
      ('xbox-game-pass-ultimate-7-months',7670,6133,'estimate'),
      ('xbox-game-pass-ultimate-11-months',10390,8311,'estimate'),
      ('xbox-game-pass-ultimate-12-months-bonus-1',10990,9400,'confirmed'),
      ('xbox-game-pass-premium-1-month',1290,1000,'confirmed'),
      ('xbox-game-pass-essential-3-months',1790,1400,'confirmed'),
      ('pc-game-pass-3-months',1990,1600,'confirmed'),
      ('pc-game-pass-6-months',3790,3200,'confirmed'),
      ('pc-game-pass-9-months',4990,4300,'confirmed'),
      ('pc-game-pass-12-months',5990,5300,'confirmed')
  )
  select string_agg(c.product_id, ', ' order by c.product_id) into v_conflict
  from costs c join public.internal_purchase_costs i on i.product_id=c.product_id and i.region=''
  where i.purchase_cost is distinct from c.cost::numeric
     or i.purchase_currency is distinct from 'RUB';
  if v_conflict is not null then
    raise exception 'Existing Xbox internal purchase costs conflict with owner-confirmed seed values: %', v_conflict;
  end if;
end;
$$;

create or replace view public.catalog_public with (security_barrier = true) as
select product_id, group_id, slug, title, platform, currency, unit_price, region, description, category, brand,
       product_type, denomination, denomination_currency, image_url, activation_instructions, restrictions,
       popularity, availability, created_at, updated_at, subscription_months, subscription_bonus_months
from public.products
where publication_status = 'published' and active = true and availability = 'in_stock';

-- The 15 variants are already maintained in public.products. Fail closed if any
-- expected variant is missing or has a conflicting stable ID, slug, retail value,
-- grouping, or publication state. Never create a replacement or rewrite metadata.
do $$
declare
  v_conflicts text;
begin
  with expected(product_id, slug, family, months, bonus_months, retail) as (values
    ('xbox-game-pass-ultimate-1-month','xbox-game-pass-ultimate-1-month','ultimate',1,0,1490),
    ('xbox-game-pass-ultimate-2-months','xbox-game-pass-ultimate-2-months','ultimate',2,0,2790),
    ('xbox-game-pass-ultimate-3-months','xbox-game-pass-ultimate-3-months','ultimate',3,0,3490),
    ('xbox-game-pass-ultimate-4-months','xbox-game-pass-ultimate-4-months','ultimate',4,0,4990),
    ('xbox-game-pass-ultimate-5-months','xbox-game-pass-ultimate-5-months','ultimate',5,0,6310),
    ('xbox-game-pass-ultimate-6-months','xbox-game-pass-ultimate-6-months','ultimate',6,0,6990),
    ('xbox-game-pass-ultimate-7-months','xbox-game-pass-ultimate-7-months','ultimate',7,0,7670),
    ('xbox-game-pass-ultimate-11-months','xbox-game-pass-ultimate-11-months','ultimate',11,0,10390),
    ('xbox-game-pass-ultimate-12-months-bonus-1','xbox-game-pass-ultimate-12-months-bonus-1','ultimate',12,1,10990),
    ('xbox-game-pass-premium-1-month','xbox-game-pass-premium-1-month','premium',1,0,1290),
    ('xbox-game-pass-essential-3-months','xbox-game-pass-essential-3-months','essential',3,0,1790),
    ('pc-game-pass-3-months','pc-game-pass-3-months','pc',3,0,1990),
    ('pc-game-pass-6-months','pc-game-pass-6-months','pc',6,0,3790),
    ('pc-game-pass-9-months','pc-game-pass-9-months','pc',9,0,4990),
    ('pc-game-pass-12-months','pc-game-pass-12-months','pc',12,0,5990)
  ), actual as (
    select e.*, p.region, p.slug as actual_slug, p.group_id, p.currency, p.unit_price,
           p.active, p.category, p.product_type, p.publication_status, p.availability,
           p.subscription_months, p.subscription_bonus_months
    from expected e left join public.products p on p.product_id=e.product_id
  )
  select string_agg(product_id, ', ' order by product_id) into v_conflicts
  from actual
  where region is distinct from ''
     or actual_slug is distinct from slug
     or currency is distinct from 'RUB'
     or unit_price is distinct from retail::numeric
     or active is distinct from false
     or category is distinct from 'xbox'
     or product_type is distinct from 'subscription'
     or publication_status is distinct from 'draft'
     or availability is distinct from 'unavailable'
     or (subscription_months is not null and subscription_months is distinct from months::smallint)
     or (subscription_bonus_months is not null and subscription_bonus_months is distinct from bonus_months::smallint);
  if v_conflicts is not null then
    raise exception 'Existing Xbox variants are missing or conflict with expected IDs/prices/statuses: %', v_conflicts;
  end if;

  if (select count(*) from public.products where product_id in (
    'xbox-game-pass-ultimate-1-month','xbox-game-pass-ultimate-2-months',
    'xbox-game-pass-ultimate-3-months','xbox-game-pass-ultimate-4-months',
    'xbox-game-pass-ultimate-5-months','xbox-game-pass-ultimate-6-months',
    'xbox-game-pass-ultimate-7-months','xbox-game-pass-ultimate-11-months',
    'xbox-game-pass-ultimate-12-months-bonus-1','xbox-game-pass-premium-1-month',
    'xbox-game-pass-essential-3-months','pc-game-pass-3-months',
    'pc-game-pass-6-months','pc-game-pass-9-months','pc-game-pass-12-months'
  )) <> 15 then
    raise exception 'All 15 existing Xbox product variants must be present before migration';
  end if;

  if exists (
    select family from (values
      ('ultimate','xbox-game-pass-ultimate-1-month'),('ultimate','xbox-game-pass-ultimate-2-months'),
      ('ultimate','xbox-game-pass-ultimate-3-months'),('ultimate','xbox-game-pass-ultimate-4-months'),
      ('ultimate','xbox-game-pass-ultimate-5-months'),('ultimate','xbox-game-pass-ultimate-6-months'),
      ('ultimate','xbox-game-pass-ultimate-7-months'),('ultimate','xbox-game-pass-ultimate-11-months'),
      ('ultimate','xbox-game-pass-ultimate-12-months-bonus-1'),('premium','xbox-game-pass-premium-1-month'),
      ('essential','xbox-game-pass-essential-3-months'),('pc','pc-game-pass-3-months'),
      ('pc','pc-game-pass-6-months'),('pc','pc-game-pass-9-months'),('pc','pc-game-pass-12-months')
    ) as v(family,product_id) join public.products p using(product_id)
    group by family having count(distinct p.group_id) <> 1 or bool_or(p.group_id is null)
  ) then
    raise exception 'Existing Xbox product family group_ids are inconsistent';
  end if;
end;
$$;

-- Update only the two new structured-term fields on the existing variants.
-- Existing titles, descriptions, imagery, instructions, restrictions, groups,
-- prices, and publication states are never rewritten.
with terms(product_id, months, bonus_months) as (values
  ('xbox-game-pass-ultimate-1-month',1,0),('xbox-game-pass-ultimate-2-months',2,0),
  ('xbox-game-pass-ultimate-3-months',3,0),('xbox-game-pass-ultimate-4-months',4,0),
  ('xbox-game-pass-ultimate-5-months',5,0),('xbox-game-pass-ultimate-6-months',6,0),
  ('xbox-game-pass-ultimate-7-months',7,0),('xbox-game-pass-ultimate-11-months',11,0),
  ('xbox-game-pass-ultimate-12-months-bonus-1',12,1),('xbox-game-pass-premium-1-month',1,0),
  ('xbox-game-pass-essential-3-months',3,0),('pc-game-pass-3-months',3,0),
  ('pc-game-pass-6-months',6,0),('pc-game-pass-9-months',9,0),('pc-game-pass-12-months',12,0)
)
update public.products p
set subscription_months=t.months::smallint,
    subscription_bonus_months=t.bonus_months::smallint
from terms t
where p.product_id=t.product_id and p.region='';

-- The four stated preliminary values are estimates; the other eleven values are confirmed.
with costs(product_id, months, bonus_months, retail_price, cost, cost_status) as (
  values
    ('xbox-game-pass-ultimate-1-month',1,0,1490,1199,'confirmed'),
    ('xbox-game-pass-ultimate-2-months',2,0,2790,2300,'confirmed'),
    ('xbox-game-pass-ultimate-3-months',3,0,3490,2900,'confirmed'),
    ('xbox-game-pass-ultimate-4-months',4,0,4990,4500,'confirmed'),
    ('xbox-game-pass-ultimate-5-months',5,0,6310,5044,'estimate'),
    ('xbox-game-pass-ultimate-6-months',6,0,6990,5589,'estimate'),
    ('xbox-game-pass-ultimate-7-months',7,0,7670,6133,'estimate'),
    ('xbox-game-pass-ultimate-11-months',11,0,10390,8311,'estimate'),
    ('xbox-game-pass-ultimate-12-months-bonus-1',12,1,10990,9400,'confirmed'),
    ('xbox-game-pass-premium-1-month',1,0,1290,1000,'confirmed'),
    ('xbox-game-pass-essential-3-months',3,0,1790,1400,'confirmed'),
    ('pc-game-pass-3-months',3,0,1990,1600,'confirmed'),
    ('pc-game-pass-6-months',6,0,3790,3200,'confirmed'),
    ('pc-game-pass-9-months',9,0,4990,4300,'confirmed'),
    ('pc-game-pass-12-months',12,0,5990,5300,'confirmed')
)
insert into public.internal_purchase_costs (
  product_id, region, purchase_cost, purchase_currency, purchase_cost_status,
  internal_notes
)
select c.product_id, '', c.cost, 'RUB', c.cost_status,
       case when c.cost_status = 'estimate' then 'Предварительная оценка закупочной стоимости; не считать подтверждённой.' else 'Подтверждённая закупочная стоимость; поставщик не привязан.' end
from costs c
join public.products p on p.product_id = c.product_id and p.region = ''
  and p.product_type = 'subscription' and p.category = 'xbox'
  and p.subscription_months = c.months and p.subscription_bonus_months = c.bonus_months
  and p.unit_price = c.retail_price
on conflict (product_id, region) do nothing;

-- Classify the owner-supplied values explicitly. Amount or currency conflicts
-- have already failed above; status changes also refresh the internal timestamp.
with costs(product_id, cost, cost_status) as (values
  ('xbox-game-pass-ultimate-1-month',1199,'confirmed'),('xbox-game-pass-ultimate-2-months',2300,'confirmed'),
  ('xbox-game-pass-ultimate-3-months',2900,'confirmed'),('xbox-game-pass-ultimate-4-months',4500,'confirmed'),
  ('xbox-game-pass-ultimate-5-months',5044,'estimate'),('xbox-game-pass-ultimate-6-months',5589,'estimate'),
  ('xbox-game-pass-ultimate-7-months',6133,'estimate'),('xbox-game-pass-ultimate-11-months',8311,'estimate'),
  ('xbox-game-pass-ultimate-12-months-bonus-1',9400,'confirmed'),('xbox-game-pass-premium-1-month',1000,'confirmed'),
  ('xbox-game-pass-essential-3-months',1400,'confirmed'),('pc-game-pass-3-months',1600,'confirmed'),
  ('pc-game-pass-6-months',3200,'confirmed'),('pc-game-pass-9-months',4300,'confirmed'),
  ('pc-game-pass-12-months',5300,'confirmed')
)
update public.internal_purchase_costs i
set purchase_cost_status=c.cost_status,
    cost_updated_at=case when i.purchase_cost_status is distinct from c.cost_status then now() else i.cost_updated_at end
from costs c
join public.products p on p.product_id=c.product_id and p.region=''
where i.product_id=c.product_id and i.region=p.region
  and i.purchase_cost=c.cost::numeric and i.purchase_currency='RUB';

do $$
declare
  v_conflict text;
begin
  with costs(product_id, cost, cost_status) as (
    values
      ('xbox-game-pass-ultimate-1-month',1199,'confirmed'),('xbox-game-pass-ultimate-2-months',2300,'confirmed'),
      ('xbox-game-pass-ultimate-3-months',2900,'confirmed'),('xbox-game-pass-ultimate-4-months',4500,'confirmed'),
      ('xbox-game-pass-ultimate-5-months',5044,'estimate'),('xbox-game-pass-ultimate-6-months',5589,'estimate'),
      ('xbox-game-pass-ultimate-7-months',6133,'estimate'),('xbox-game-pass-ultimate-11-months',8311,'estimate'),
      ('xbox-game-pass-ultimate-12-months-bonus-1',9400,'confirmed'),('xbox-game-pass-premium-1-month',1000,'confirmed'),
      ('xbox-game-pass-essential-3-months',1400,'confirmed'),('pc-game-pass-3-months',1600,'confirmed'),
      ('pc-game-pass-6-months',3200,'confirmed'),('pc-game-pass-9-months',4300,'confirmed'),('pc-game-pass-12-months',5300,'confirmed')
  )
  select string_agg(c.product_id, ', ' order by c.product_id) into v_conflict
  from costs c left join public.internal_purchase_costs i
    on i.product_id=c.product_id and i.region=''
  where i.product_id is null or i.purchase_cost is distinct from c.cost::numeric
     or i.purchase_currency is distinct from 'RUB'
     or i.purchase_cost_status is distinct from c.cost_status;
  if v_conflict is not null then
    raise exception 'Xbox internal purchase cost seed is incomplete or mismatched: %', v_conflict;
  end if;
end;
$$;

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
  if p_consent is distinct from true then
    raise exception 'Consent is required';
  end if;

  if p_customer_name is null or length(btrim(p_customer_name)) not between 2 and 100 then
    raise exception 'Invalid customer name';
  end if;

  if p_customer_phone is null or length(btrim(p_customer_phone)) not between 5 and 40 then
    raise exception 'Invalid phone';
  end if;

  if p_customer_email is null
    or length(btrim(p_customer_email)) > 254
    or p_customer_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$'
  then
    raise exception 'Invalid email';
  end if;

  if nullif(btrim(coalesce(p_delivery_address, '')), '') is not null
    and length(btrim(p_delivery_address)) not between 3 and 500
  then
    raise exception 'Invalid delivery details';
  end if;

  if p_customer_comment is not null and length(p_customer_comment) > 1000 then
    raise exception 'Comment is too long';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Items must be an array';
  end if;

  v_count := jsonb_array_length(p_items);

  if v_count < 1 or v_count > 20 then
    raise exception 'Order must contain 1 to 20 lines';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Invalid item';
    end if;

    v_product_id := v_item->>'product_id';
    v_region := coalesce(v_item->>'region', '');

    if v_product_id is null or length(v_product_id) > 120 or length(v_region) > 100 then
      raise exception 'Invalid product variant';
    end if;

    if (v_item->>'quantity') is null or (v_item->>'quantity') !~ '^[0-9]{1,2}$' then
      raise exception 'Invalid quantity';
    end if;

    v_qty := (v_item->>'quantity')::integer;

    if v_qty not between 1 and 10 then
      raise exception 'Quantity must be between 1 and 10';
    end if;

    select *
      into v_product
      from public.products p
     where p.product_id = v_product_id
       and p.region = v_region
       and p.active = true
       and p.publication_status = 'published'
       and p.availability = 'in_stock'
     for share;

    if not found then
      raise exception 'A product or region is unavailable: %', v_product_id;
    end if;

    if (v_item->>'expected_price') is null
      or (v_item->>'expected_price') !~ '^[0-9]+([.][0-9]{1,2})?$'
      or (v_item->>'expected_price')::numeric <> v_product.unit_price
    then
      raise exception 'The displayed price for product % is outdated. Refresh the catalog before ordering.', v_product_id;
    end if;

    v_total := v_total + v_product.unit_price * v_qty;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.product_id,
      'product_name', v_product.title,
      'platform', v_product.platform,
      'region', nullif(v_product.region, ''),
      'denomination', v_product.denomination,
      'denomination_currency', v_product.denomination_currency,
      'subscription_months', v_product.subscription_months,
      'subscription_bonus_months', v_product.subscription_bonus_months,
      'quantity', v_qty,
      'unit_price', v_product.unit_price
    ));
  end loop;

  insert into public.orders (
    customer_name,
    customer_phone,
    customer_email,
    delivery_address,
    customer_comment,
    consent_at,
    status,
    total_amount
  )
  values (
    btrim(p_customer_name),
    btrim(p_customer_phone),
    lower(btrim(p_customer_email)),
    nullif(btrim(coalesce(p_delivery_address, '')), ''),
    nullif(btrim(coalesce(p_customer_comment, '')), ''),
    now(),
    'new',
    v_total
  )
  returning * into v_order;

  insert into public.order_items (
    order_id,
    product_id,
    product_name,
    platform,
    region,
    denomination,
    denomination_currency,
    subscription_months,
    subscription_bonus_months,
    quantity,
    unit_price
  )
  select
    v_order.id,
    x->>'product_id',
    x->>'product_name',
    x->>'platform',
    x->>'region',
    (x->>'denomination')::numeric,
    x->>'denomination_currency',
    (x->>'subscription_months')::smallint,
    (x->>'subscription_bonus_months')::smallint,
    (x->>'quantity')::integer,
    (x->>'unit_price')::numeric
  from jsonb_array_elements(v_lines) x;

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'created_at', v_order.created_at,
    'consent_at', v_order.consent_at,
    'total_amount', v_order.total_amount,
    'items', v_lines
  );
end;
$$;

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
    select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'product_name',product_name,'platform',platform,'region',region,'denomination',denomination,'denomination_currency',denomination_currency,'subscription_months',subscription_months,'subscription_bonus_months',subscription_bonus_months,'quantity',quantity,'unit_price',unit_price)),'[]'::jsonb)
      into v_lines from public.order_items where order_id=v_existing;
    return jsonb_build_object('id',v_order.id,'order_number',v_order.order_number,'created_at',v_order.created_at,'consent_at',v_order.consent_at,'total_amount',v_order.total_amount,'items',v_lines);
  end if;
  if p_consent is distinct from true then raise exception 'Consent is required'; end if;
  if p_customer_name is null or length(btrim(p_customer_name)) not between 2 and 100 then raise exception 'Invalid customer name'; end if;
  if p_customer_phone is null or length(btrim(p_customer_phone)) not between 5 and 40 then raise exception 'Invalid phone'; end if;
  if nullif(btrim(coalesce(p_delivery_address, '')), '') is not null
    and length(btrim(p_delivery_address)) not between 3 and 500 then raise exception 'Invalid delivery details'; end if;
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
      'subscription_months',v_product.subscription_months,'subscription_bonus_months',v_product.subscription_bonus_months,
      'quantity',v_qty,'unit_price',v_product.unit_price));
  end loop;
  insert into public.orders(customer_name,customer_phone,customer_email,delivery_address,customer_comment,consent_at,status,total_amount,customer_user_id,payment_status,fulfillment_status)
    values(btrim(p_customer_name),btrim(p_customer_phone),lower(btrim(p_customer_email)),nullif(btrim(coalesce(p_delivery_address,'')),''),nullif(btrim(coalesce(p_customer_comment,'')),''),now(),'new',v_total,v_user_id,'unpaid','new') returning * into v_order;
  insert into public.order_items(order_id,product_id,product_name,platform,region,denomination,denomination_currency,subscription_months,subscription_bonus_months,quantity,unit_price)
    select v_order.id,x->>'product_id',x->>'product_name',x->>'platform',x->>'region',(x->>'denomination')::numeric,x->>'denomination_currency',(x->>'subscription_months')::smallint,(x->>'subscription_bonus_months')::smallint,(x->>'quantity')::integer,(x->>'unit_price')::numeric from jsonb_array_elements(v_lines) x;
  update public.order_idempotency set order_id=v_order.id where customer_user_id=v_user_id and idempotency_key=p_idempotency_key;
  perform public.log_order_action(v_order.id,'order_created','{}'::jsonb);
  return jsonb_build_object('id',v_order.id,'order_number',v_order.order_number,'created_at',v_order.created_at,'consent_at',v_order.consent_at,'total_amount',v_order.total_amount,'items',v_lines);
end;
$$;

-- Preserve intended customer checkout roles without exposing admin helpers.
revoke all on function public.place_public_order(text,text,text,text,text,boolean,jsonb)
  from public, anon, authenticated;
grant execute on function public.place_public_order(text,text,text,text,text,boolean,jsonb)
  to anon, authenticated;
revoke all on function public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)
  from public, anon, authenticated;
grant execute on function public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)
  to authenticated;

commit;
