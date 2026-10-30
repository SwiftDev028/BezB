-- Preserve the 15 Xbox Game Pass products already maintained in public.products.
-- This migration does not create or update products, catalog_public, order_items,
-- checkout RPCs, supplier mappings, publication states, or product group IDs.
-- It only verifies internal cost storage protections, checks existing products/view,
-- and adds missing cost records with their intended status. Apply manually only
-- after reviewing the live-schema preflight.
begin;

-- Validate the existing catalog contract and every pre-existing Xbox variant.
-- Existing titles, descriptions, activation instructions, restrictions, image
-- URLs, group_ids and status fields are deliberately not rewritten.
do $$
declare
  v_missing text;
  v_conflicts text;
  v_view_columns text[];
  v_view_definition text;
begin
  if to_regclass('public.products') is null or to_regclass('public.catalog_public') is null then
    raise exception 'Expected existing public.products and public.catalog_public';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Expected existing public.is_admin() for administrator-only cost access';
  end if;
  if (select p.prorettype from pg_catalog.pg_proc p where p.oid=to_regprocedure('public.is_admin()')) <> 'boolean'::regtype
     or not (select p.prosecdef from pg_catalog.pg_proc p where p.oid=to_regprocedure('public.is_admin()'))
     or not has_function_privilege('authenticated','public.is_admin()','execute')
     or has_function_privilege('anon','public.is_admin()','execute') then
    raise exception 'Expected SECURITY DEFINER public.is_admin() callable only by authenticated client role';
  end if;

  select string_agg(req.column_name, ', ' order by req.column_name)
    into v_missing
  from (values
    ('product_id'),('region'),('group_id'),('slug'),('title'),('currency'),
    ('unit_price'),('active'),('category'),('product_type'),
    ('publication_status'),('availability')
  ) as req(column_name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name='products'
      and c.column_name=req.column_name
  );
  if v_missing is not null then
    raise exception 'Expected existing products columns are missing: %', v_missing;
  end if;
  if exists (
    select 1 from (values
      ('product_id','text'),('region','text'),('slug','text'),('title','text'),
      ('currency','text'),('unit_price','numeric'),('active','boolean'),
      ('category','text'),('product_type','text'),('publication_status','text'),('availability','text')
    ) req(column_name,data_type)
    join information_schema.columns c
      on c.table_schema='public' and c.table_name='products' and c.column_name=req.column_name
    where c.data_type is distinct from req.data_type
  ) then
    raise exception 'Existing products columns have incompatible types';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid='public.products'::regclass and c.contype='p'
      and c.conkey=array[
        (select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.products'::regclass and a.attname='product_id' and not a.attisdropped),
        (select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.products'::regclass and a.attname='region' and not a.attisdropped)
      ]::smallint[]
  ) then
    raise exception 'Expected products primary key (product_id, region) for internal cost FK';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_index i
    where i.indrelid='public.products'::regclass and i.indisunique and i.indisvalid
      and i.indpred is null and i.indexprs is null and i.indnkeyatts=1
      and i.indkey[0]=(select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.products'::regclass and a.attname='slug' and not a.attisdropped)
  ) then
    raise exception 'Expected a valid unique index on products.slug';
  end if;

  if (select c.relkind from pg_catalog.pg_class c where c.oid='public.catalog_public'::regclass) <> 'v' then
    raise exception 'Expected public.catalog_public to remain a view';
  end if;
  select array_agg(a.attname::text order by a.attnum) into v_view_columns
  from pg_catalog.pg_attribute a
  where a.attrelid='public.catalog_public'::regclass and a.attnum>0 and not a.attisdropped;
  if v_view_columns is distinct from array[
    'product_id','group_id','slug','title','platform','currency','unit_price','region','description',
    'category','brand','product_type','denomination','denomination_currency','image_url',
    'activation_instructions','restrictions','popularity','availability','created_at','updated_at'
  ]::text[] and v_view_columns is distinct from array[
    'product_id','group_id','slug','title','platform','currency','unit_price','region','description',
    'category','brand','product_type','denomination','denomination_currency','image_url',
    'activation_instructions','restrictions','popularity','availability','created_at','updated_at',
    'subscription_months','subscription_bonus_months'
  ]::text[] then
    raise exception 'Unexpected catalog_public output columns/order: %', v_view_columns;
  end if;
  v_view_definition := lower(pg_catalog.pg_get_viewdef('public.catalog_public'::regclass, true));
  if position('internal_purchase_costs' in v_view_definition) > 0
     or position('supplier_products' in v_view_definition) > 0 then
    raise exception 'catalog_public must not expose internal or supplier cost data';
  end if;
  if not has_table_privilege('anon','public.catalog_public','select')
     or not has_table_privilege('authenticated','public.catalog_public','select') then
    raise exception 'Existing catalog_public SELECT access for anon/authenticated is required';
  end if;

  with expected(product_id,slug,family,retail) as (values
    ('xbox-game-pass-ultimate-1-month','xbox-game-pass-ultimate-1-month','ultimate',1490),
    ('xbox-game-pass-ultimate-2-months','xbox-game-pass-ultimate-2-months','ultimate',2790),
    ('xbox-game-pass-ultimate-3-months','xbox-game-pass-ultimate-3-months','ultimate',3490),
    ('xbox-game-pass-ultimate-4-months','xbox-game-pass-ultimate-4-months','ultimate',4990),
    ('xbox-game-pass-ultimate-5-months','xbox-game-pass-ultimate-5-months','ultimate',6310),
    ('xbox-game-pass-ultimate-6-months','xbox-game-pass-ultimate-6-months','ultimate',6990),
    ('xbox-game-pass-ultimate-7-months','xbox-game-pass-ultimate-7-months','ultimate',7670),
    ('xbox-game-pass-ultimate-11-months','xbox-game-pass-ultimate-11-months','ultimate',10390),
    ('xbox-game-pass-ultimate-12-months-bonus-1','xbox-game-pass-ultimate-12-months-bonus-1','ultimate',10990),
    ('xbox-game-pass-premium-1-month','xbox-game-pass-premium-1-month','premium',1290),
    ('xbox-game-pass-essential-3-months','xbox-game-pass-essential-3-months','essential',1790),
    ('pc-game-pass-3-months','pc-game-pass-3-months','pc',1990),
    ('pc-game-pass-6-months','pc-game-pass-6-months','pc',3790),
    ('pc-game-pass-9-months','pc-game-pass-9-months','pc',4990),
    ('pc-game-pass-12-months','pc-game-pass-12-months','pc',5990)
  ), actual as (
    select e.*, p.region, p.group_id, p.slug as actual_slug, p.currency,
           p.unit_price, p.active, p.category, p.product_type,
           p.publication_status, p.availability,
           count(*) over (partition by e.product_id) as product_id_count
    from expected e left join public.products p on p.product_id=e.product_id
  )
  select string_agg(product_id, ', ' order by product_id) into v_conflicts
  from actual
  where region is null
     or product_id_count <> 1
     or actual_slug is distinct from slug
     or currency is distinct from 'RUB'
     or unit_price is distinct from retail::numeric
     or active is distinct from false
     or category is distinct from 'xbox'
     or product_type is distinct from 'subscription'
     or publication_status is distinct from 'draft'
     or availability is distinct from 'unavailable';
  if v_conflicts is not null then
    raise exception 'Existing Xbox products are missing or differ from expected IDs/slugs/prices/statuses: %', v_conflicts;
  end if;

  -- Every variant in a family must already share its existing group_id; families
  -- must remain distinct. No group_id is generated or assigned by this migration.
  with expected(product_id,family) as (values
    ('xbox-game-pass-ultimate-1-month','ultimate'),('xbox-game-pass-ultimate-2-months','ultimate'),
    ('xbox-game-pass-ultimate-3-months','ultimate'),('xbox-game-pass-ultimate-4-months','ultimate'),
    ('xbox-game-pass-ultimate-5-months','ultimate'),('xbox-game-pass-ultimate-6-months','ultimate'),
    ('xbox-game-pass-ultimate-7-months','ultimate'),('xbox-game-pass-ultimate-11-months','ultimate'),
    ('xbox-game-pass-ultimate-12-months-bonus-1','ultimate'),('xbox-game-pass-premium-1-month','premium'),
    ('xbox-game-pass-essential-3-months','essential'),('pc-game-pass-3-months','pc'),
    ('pc-game-pass-6-months','pc'),('pc-game-pass-9-months','pc'),('pc-game-pass-12-months','pc')
  ), family_ids as (
    select e.family, count(distinct p.group_id) as group_count,
           bool_or(p.group_id is null) as has_null_group_id,
           min(p.group_id::text) as group_id
    from expected e join public.products p on p.product_id=e.product_id
    group by e.family
  )
  select string_agg(family, ', ' order by family) into v_conflicts
  from family_ids where group_count <> 1 or has_null_group_id;
  if v_conflicts is not null then
    raise exception 'Existing Xbox family group_ids are missing or inconsistent: %', v_conflicts;
  end if;

  with expected(product_id,family) as (values
    ('xbox-game-pass-ultimate-1-month','ultimate'),('xbox-game-pass-ultimate-2-months','ultimate'),
    ('xbox-game-pass-ultimate-3-months','ultimate'),('xbox-game-pass-ultimate-4-months','ultimate'),
    ('xbox-game-pass-ultimate-5-months','ultimate'),('xbox-game-pass-ultimate-6-months','ultimate'),
    ('xbox-game-pass-ultimate-7-months','ultimate'),('xbox-game-pass-ultimate-11-months','ultimate'),
    ('xbox-game-pass-ultimate-12-months-bonus-1','ultimate'),('xbox-game-pass-premium-1-month','premium'),
    ('xbox-game-pass-essential-3-months','essential'),('pc-game-pass-3-months','pc'),
    ('pc-game-pass-6-months','pc'),('pc-game-pass-9-months','pc'),('pc-game-pass-12-months','pc')
  ), family_ids as (
    select e.family, min(p.group_id::text) as group_id
    from expected e join public.products p on p.product_id=e.product_id
    group by e.family
  )
  select string_agg(a.family || '/' || b.family, ', ' order by a.family,b.family) into v_conflicts
  from family_ids a join family_ids b on a.family < b.family and a.group_id=b.group_id;
  if v_conflicts is not null then
    raise exception 'Existing Xbox product families share group_ids: %', v_conflicts;
  end if;
end;
$$;

-- Migration 003 owns the table and its administrator-only RLS/grants. This
-- migration verifies those protections without resetting policies or ACLs.

-- Reject an existing cost value mismatch rather than silently accepting it or
-- overwriting it. A pre-existing status, including confirmed, is left intact.
do $$
declare
  v_conflicts text;
  v_missing text;
begin
  select string_agg(required.column_name, ', ' order by required.column_name)
    into v_missing
  from (values
    ('product_id'),('region'),('purchase_cost'),('purchase_currency'),
    ('purchase_cost_status'),('cost_updated_at'),('internal_notes')
  ) required(column_name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name='internal_purchase_costs'
      and c.column_name=required.column_name
  );
  if v_missing is not null then
    raise exception 'internal_purchase_costs lacks required columns: %', v_missing;
  end if;
  if exists (
    select 1 from (values
      ('product_id','text'),('region','text'),('purchase_cost','numeric'),
      ('purchase_currency','text'),('purchase_cost_status','text'),
      ('cost_updated_at','timestamp with time zone'),('internal_notes','text')
    ) req(column_name,data_type)
    join information_schema.columns c
      on c.table_schema='public' and c.table_name='internal_purchase_costs'
     and c.column_name=req.column_name
    where c.data_type is distinct from req.data_type or c.is_nullable <> 'NO'
  ) then
    raise exception 'internal_purchase_costs has incompatible column types or nullability';
  end if;
  if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid='public.internal_purchase_costs'::regclass) then
    raise exception 'RLS is not enabled on internal_purchase_costs';
  end if;
  if has_table_privilege('anon','public.internal_purchase_costs','select')
     or has_table_privilege('anon','public.internal_purchase_costs','insert')
     or has_table_privilege('anon','public.internal_purchase_costs','update')
     or has_table_privilege('anon','public.internal_purchase_costs','delete')
     or not has_table_privilege('authenticated','public.internal_purchase_costs','select')
     or not has_table_privilege('authenticated','public.internal_purchase_costs','insert')
     or not has_table_privilege('authenticated','public.internal_purchase_costs','update')
     or not has_table_privilege('authenticated','public.internal_purchase_costs','delete') then
    raise exception 'Unexpected internal_purchase_costs grants';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_policy p
    where p.polrelid='public.internal_purchase_costs'::regclass
      and p.polname='Admins manage internal purchase costs'
      and p.polcmd='*' and p.polpermissive
      and pg_catalog.pg_get_expr(p.polqual,p.polrelid) like '%is_admin%'
      and pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) like '%is_admin%'
  ) or not exists (
    select 1 from pg_catalog.pg_policy p
    where p.polrelid='public.internal_purchase_costs'::regclass
      and p.polname='BezB internal purchase costs admin boundary'
      and p.polcmd='*' and not p.polpermissive
      and pg_catalog.pg_get_expr(p.polqual,p.polrelid) like '%is_admin%'
      and pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) like '%is_admin%'
  ) then
    raise exception 'internal_purchase_costs is missing administrator-only policies';
  end if;
  with expected(product_id) as (values
    ('xbox-game-pass-ultimate-1-month'),('xbox-game-pass-ultimate-2-months'),
    ('xbox-game-pass-ultimate-3-months'),('xbox-game-pass-ultimate-4-months'),
    ('xbox-game-pass-ultimate-5-months'),('xbox-game-pass-ultimate-6-months'),
    ('xbox-game-pass-ultimate-7-months'),('xbox-game-pass-ultimate-11-months'),
    ('xbox-game-pass-ultimate-12-months-bonus-1'),('xbox-game-pass-premium-1-month'),
    ('xbox-game-pass-essential-3-months'),('pc-game-pass-3-months'),
    ('pc-game-pass-6-months'),('pc-game-pass-9-months'),('pc-game-pass-12-months')
  )
  select string_agg(c.product_id, ', ' order by c.product_id) into v_conflicts
  from expected e
  join public.internal_purchase_costs c on c.product_id=e.product_id
  join public.products p on p.product_id=e.product_id
  where c.region is distinct from p.region;
  if v_conflicts is not null then
    raise exception 'Existing Xbox costs are attached to a different region variant: %', v_conflicts;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid='public.internal_purchase_costs'::regclass
      and c.contype='p' and c.convalidated
      and c.conkey=array[
        (select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.internal_purchase_costs'::regclass and a.attname='product_id' and not a.attisdropped),
        (select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.internal_purchase_costs'::regclass and a.attname='region' and not a.attisdropped)
      ]::smallint[]
  ) or not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid='public.internal_purchase_costs'::regclass
      and c.conname='internal_purchase_costs_variant_fk' and c.contype='f'
      and c.convalidated and c.confrelid='public.products'::regclass
      and c.conkey=array[
        (select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.internal_purchase_costs'::regclass and a.attname='product_id' and not a.attisdropped),
        (select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.internal_purchase_costs'::regclass and a.attname='region' and not a.attisdropped)
      ]::smallint[]
      and c.confkey=array[
        (select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.products'::regclass and a.attname='product_id' and not a.attisdropped),
        (select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.products'::regclass and a.attname='region' and not a.attisdropped)
      ]::smallint[]
  ) then
    raise exception 'internal_purchase_costs requires its variant PK and product FK';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid='public.internal_purchase_costs'::regclass
      and c.conname='internal_purchase_costs_purchase_cost_check' and c.contype='c'
      and c.convalidated and pg_catalog.pg_get_constraintdef(c.oid) like '%purchase_cost%0%'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid='public.internal_purchase_costs'::regclass
      and c.conname='internal_purchase_costs_purchase_currency_check' and c.contype='c'
      and c.convalidated and pg_catalog.pg_get_constraintdef(c.oid) like '%RUB%'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid='public.internal_purchase_costs'::regclass
      and c.conname='internal_purchase_costs_purchase_cost_status_check' and c.contype='c'
      and c.convalidated and pg_catalog.pg_get_constraintdef(c.oid) like '%confirmed%estimate%unverified%'
  ) then
    raise exception 'internal_purchase_costs is missing validated cost/currency/status checks';
  end if;

  with expected(product_id,cost,cost_status) as (values
    ('xbox-game-pass-ultimate-1-month',1199,'confirmed'),('xbox-game-pass-ultimate-2-months',2300,'confirmed'),
    ('xbox-game-pass-ultimate-3-months',2900,'confirmed'),('xbox-game-pass-ultimate-4-months',4500,'confirmed'),
    ('xbox-game-pass-ultimate-5-months',5044,'estimate'),('xbox-game-pass-ultimate-6-months',5589,'estimate'),
    ('xbox-game-pass-ultimate-7-months',6133,'estimate'),('xbox-game-pass-ultimate-11-months',8311,'estimate'),
    ('xbox-game-pass-ultimate-12-months-bonus-1',9400,'confirmed'),('xbox-game-pass-premium-1-month',1000,'confirmed'),
    ('xbox-game-pass-essential-3-months',1400,'confirmed'),('pc-game-pass-3-months',1600,'confirmed'),
    ('pc-game-pass-6-months',3200,'confirmed'),('pc-game-pass-9-months',4300,'confirmed'),('pc-game-pass-12-months',5300,'confirmed')
  )
  select string_agg(e.product_id, ', ' order by e.product_id) into v_conflicts
  from expected e
  join public.products p on p.product_id=e.product_id
  join public.internal_purchase_costs c on c.product_id=p.product_id and c.region=p.region
  where c.purchase_cost is distinct from e.cost::numeric
     or c.purchase_currency is distinct from 'RUB';
  if v_conflicts is not null then
    raise exception 'Existing Xbox cost rows conflict with configured amounts/currency: %', v_conflicts;
  end if;
end;
$$;

-- Add only missing cost rows, using each existing product's actual region.
-- Statuses distinguish estimates from confirmed purchase values.
with costs(product_id,purchase_cost,purchase_cost_status) as (values
  ('xbox-game-pass-ultimate-1-month',1199,'confirmed'),('xbox-game-pass-ultimate-2-months',2300,'confirmed'),
  ('xbox-game-pass-ultimate-3-months',2900,'confirmed'),('xbox-game-pass-ultimate-4-months',4500,'confirmed'),
  ('xbox-game-pass-ultimate-5-months',5044,'estimate'),('xbox-game-pass-ultimate-6-months',5589,'estimate'),
  ('xbox-game-pass-ultimate-7-months',6133,'estimate'),('xbox-game-pass-ultimate-11-months',8311,'estimate'),
  ('xbox-game-pass-ultimate-12-months-bonus-1',9400,'confirmed'),('xbox-game-pass-premium-1-month',1000,'confirmed'),
  ('xbox-game-pass-essential-3-months',1400,'confirmed'),('pc-game-pass-3-months',1600,'confirmed'),
  ('pc-game-pass-6-months',3200,'confirmed'),('pc-game-pass-9-months',4300,'confirmed'),('pc-game-pass-12-months',5300,'confirmed')
)
insert into public.internal_purchase_costs
  (product_id,region,purchase_cost,purchase_currency,purchase_cost_status,cost_updated_at,internal_notes)
select c.product_id,p.region,c.purchase_cost,'RUB',c.purchase_cost_status,now(),
       case when c.purchase_cost_status='estimate' then 'Предварительная оценка; не считать подтверждённой.'
            else 'Подтверждённая закупочная стоимость; поставщик не привязан.' end
from costs c
join public.products p on p.product_id=c.product_id
on conflict (product_id,region) do nothing;

-- Confirm that all expected cost values are present without changing product
-- records or existing cost confirmation statuses.
do $$
declare
  v_missing text;
begin
  with expected(product_id,cost,cost_status) as (values
    ('xbox-game-pass-ultimate-1-month',1199,'confirmed'),('xbox-game-pass-ultimate-2-months',2300,'confirmed'),
    ('xbox-game-pass-ultimate-3-months',2900,'confirmed'),('xbox-game-pass-ultimate-4-months',4500,'confirmed'),
    ('xbox-game-pass-ultimate-5-months',5044,'estimate'),('xbox-game-pass-ultimate-6-months',5589,'estimate'),
    ('xbox-game-pass-ultimate-7-months',6133,'estimate'),('xbox-game-pass-ultimate-11-months',8311,'estimate'),
    ('xbox-game-pass-ultimate-12-months-bonus-1',9400,'confirmed'),('xbox-game-pass-premium-1-month',1000,'confirmed'),
    ('xbox-game-pass-essential-3-months',1400,'confirmed'),('pc-game-pass-3-months',1600,'confirmed'),
    ('pc-game-pass-6-months',3200,'confirmed'),('pc-game-pass-9-months',4300,'confirmed'),('pc-game-pass-12-months',5300,'confirmed')
  )
  select string_agg(e.product_id, ', ' order by e.product_id) into v_missing
  from expected e
  left join public.products p on p.product_id=e.product_id
  left join public.internal_purchase_costs c on c.product_id=p.product_id and c.region=p.region
  where p.product_id is null or c.product_id is null
     or c.purchase_cost is distinct from e.cost::numeric
     or c.purchase_currency is distinct from 'RUB'
     or c.purchase_cost_status is distinct from e.cost_status;
  if v_missing is not null then
    raise exception 'Xbox cost verification failed for products: %', v_missing;
  end if;
  if has_table_privilege('anon','public.internal_purchase_costs','select')
     or has_table_privilege('anon','public.internal_purchase_costs','insert') then
    raise exception 'internal_purchase_costs is accessible to anon';
  end if;
end;
$$;

commit;
