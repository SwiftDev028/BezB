-- Confirm owner-approved internal costs and publish only the three Claude
-- subscription variants prepared by 202610250001_claude_catalog_drafts.sql.
begin;

do $$
declare
  v_missing text;
  v_type_mismatches text;
  v_conflicts text;
  v_view_definition text;
  v_public_def text;
  v_buyer_def text;
begin
  if to_regclass('public.products') is null
     or to_regclass('public.internal_purchase_costs') is null
     or to_regclass('public.catalog_public') is null
     or to_regclass('public.order_items') is null then
    raise exception 'Claude publication requires products, internal costs, catalog_public, and order_items';
  end if;

  if (select c.relkind
      from pg_catalog.pg_class c
      where c.oid = 'public.catalog_public'::regclass) <> 'v' then
    raise exception 'Expected public.catalog_public to remain a view';
  end if;

  select string_agg(required.table_name || '.' || required.column_name, ', ' order by required.table_name, required.column_name)
    into v_missing
  from (values
    ('products','product_id'),('products','region'),('products','slug'),('products','title'),
    ('products','platform'),('products','currency'),('products','unit_price'),('products','active'),
    ('products','category'),('products','brand'),('products','product_type'),
    ('products','subscription_months'),('products','subscription_bonus_months'),
    ('products','availability'),('products','publication_status'),
    ('order_items','subscription_months'),('order_items','subscription_bonus_months'),
    ('internal_purchase_costs','product_id'),('internal_purchase_costs','region'),
    ('internal_purchase_costs','purchase_cost'),('internal_purchase_costs','purchase_currency'),
    ('internal_purchase_costs','purchase_cost_status'),('internal_purchase_costs','cost_updated_at'),
    ('internal_purchase_costs','internal_notes')
  ) as required(table_name, column_name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = required.table_name
      and c.column_name = required.column_name
  );
  if v_missing is not null then
    raise exception 'Claude publication requires missing columns: %', v_missing;
  end if;

  select string_agg(required.table_name || '.' || required.column_name || '=' ||
      pg_catalog.format_type(a.atttypid, a.atttypmod), ', ' order by required.table_name, required.column_name)
    into v_type_mismatches
  from (values
    ('products','product_id','text'),('products','region','text'),('products','slug','text'),
    ('products','title','text'),('products','platform','text'),('products','currency','text'),
    ('products','unit_price','numeric'),('products','active','boolean'),('products','category','text'),
    ('products','brand','text'),('products','product_type','text'),
    ('products','subscription_months','integer'),('products','subscription_bonus_months','integer'),
    ('products','availability','text'),('products','publication_status','text'),
    ('order_items','subscription_months','integer'),('order_items','subscription_bonus_months','integer'),
    ('internal_purchase_costs','product_id','text'),('internal_purchase_costs','region','text'),
    ('internal_purchase_costs','purchase_cost','numeric(12,2)'),
    ('internal_purchase_costs','purchase_currency','text'),
    ('internal_purchase_costs','purchase_cost_status','text'),
    ('internal_purchase_costs','cost_updated_at','timestamp with time zone'),
    ('internal_purchase_costs','internal_notes','text')
  ) as required(table_name, column_name, expected_type)
  join pg_catalog.pg_namespace n on n.nspname = 'public'
  join pg_catalog.pg_class r on r.relnamespace = n.oid and r.relname = required.table_name
  join pg_catalog.pg_attribute a
    on a.attrelid = r.oid and a.attname = required.column_name
   and a.attnum > 0 and not a.attisdropped
  where case
    when required.table_name = 'products' and required.column_name = 'unit_price'
      then a.atttypid is distinct from 'numeric'::regtype
    else pg_catalog.format_type(a.atttypid, a.atttypmod) is distinct from required.expected_type
  end;
  if v_type_mismatches is not null then
    raise exception 'Claude publication found incompatible column types: %', v_type_mismatches;
  end if;

  if not exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = 'public.products'::regclass
        and c.conname = 'products_subscription_months_check'
        and c.contype = 'c' and c.convalidated
    )
    or not exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = 'public.products'::regclass
        and c.conname = 'products_subscription_bonus_months_check'
        and c.contype = 'c' and c.convalidated
    )
    or not exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = 'public.internal_purchase_costs'::regclass
        and c.conname = 'internal_purchase_costs_purchase_cost_status_check'
        and c.contype = 'c' and c.convalidated
        and pg_catalog.pg_get_constraintdef(c.oid) like '%confirmed%'
        and pg_catalog.pg_get_constraintdef(c.oid) like '%estimated%'
        and pg_catalog.pg_get_constraintdef(c.oid) like '%unverified%'
    ) then
    raise exception 'Expected validated subscription-term and internal purchase-cost status constraints';
  end if;

  if not (select c.relrowsecurity
      from pg_catalog.pg_class c
      where c.oid = 'public.internal_purchase_costs'::regclass)
     or has_table_privilege('anon', 'public.internal_purchase_costs', 'select')
     or has_table_privilege('anon', 'public.internal_purchase_costs', 'insert')
     or has_table_privilege('anon', 'public.internal_purchase_costs', 'update')
     or has_table_privilege('anon', 'public.internal_purchase_costs', 'delete')
     or not has_table_privilege('authenticated', 'public.internal_purchase_costs', 'select')
     or not exists (
       select 1 from pg_catalog.pg_policy p
       where p.polrelid = 'public.internal_purchase_costs'::regclass
         and p.polname = 'Admins manage internal purchase costs'
         and p.polcmd = '*' and p.polpermissive
         and pg_catalog.pg_get_expr(p.polqual, p.polrelid) like '%is_admin%'
         and pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) like '%is_admin%'
     )
     or not exists (
       select 1 from pg_catalog.pg_policy p
       where p.polrelid = 'public.internal_purchase_costs'::regclass
         and p.polname = 'BezB internal purchase costs admin boundary'
         and p.polcmd = '*' and not p.polpermissive
         and pg_catalog.pg_get_expr(p.polqual, p.polrelid) like '%is_admin%'
         and pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) like '%is_admin%'
     ) then
    raise exception 'Internal purchase costs must remain protected by admin-only RLS and deny anon access';
  end if;

  select pg_catalog.pg_get_viewdef('public.catalog_public'::regclass, true)
    into v_view_definition;
  if position('internal_purchase_costs' in lower(v_view_definition)) > 0
     or position('supplier_products' in lower(v_view_definition)) > 0
     or exists (
       select 1 from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'catalog_public'
         and c.column_name in ('purchase_cost', 'purchase_currency', 'purchase_cost_status', 'internal_notes', 'margin')
     )
     or not has_table_privilege('anon', 'public.catalog_public', 'select')
     or not has_table_privilege('authenticated', 'public.catalog_public', 'select') then
    raise exception 'catalog_public must remain buyer-readable and exclude internal and supplier costs';
  end if;

  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'catalog_public'
      and c.column_name = 'subscription_months'
  ) or not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'catalog_public'
      and c.column_name = 'subscription_bonus_months'
  ) then
    raise exception 'catalog_public must expose the structured subscription term';
  end if;

  if exists (
    select 1 from (
      values
        ('place_public_order(text,text,text,text,text,boolean,jsonb)'::text),
        ('place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)'::text)
    ) expected(signature)
    where to_regprocedure(expected.signature) is null
  ) then
    raise exception 'Both established checkout RPC signatures must exist before Claude publication';
  end if;

  if not (
      select p.prosecdef and p.prorettype = 'jsonb'::regtype
        and coalesce(p.proconfig, array[]::text[]) @> array['search_path=""']::text[]
      from pg_catalog.pg_proc p
      where p.oid = to_regprocedure('public.place_public_order(text,text,text,text,text,boolean,jsonb)')
    )
    or not (
      select p.prosecdef and p.prorettype = 'jsonb'::regtype
        and coalesce(p.proconfig, array[]::text[]) @> array['search_path=""']::text[]
      from pg_catalog.pg_proc p
      where p.oid = to_regprocedure('public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)')
    )
    or not has_function_privilege('anon', 'public.place_public_order(text,text,text,text,text,boolean,jsonb)', 'execute')
    or not has_function_privilege('authenticated', 'public.place_public_order(text,text,text,text,text,boolean,jsonb)', 'execute')
    or has_function_privilege('anon', 'public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)', 'execute') then
    raise exception 'Checkout RPC SECURITY DEFINER, search_path, or EXECUTE grants are incompatible';
  end if;

  select lower(pg_catalog.pg_get_functiondef(
    to_regprocedure('public.place_public_order(text,text,text,text,text,boolean,jsonb)')))
    into v_public_def;
  select lower(pg_catalog.pg_get_functiondef(
    to_regprocedure('public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)')))
    into v_buyer_def;

  if exists (
       select 1 from unnest(array[
         'p_consent is distinct from true', 'expected_price', 'unit_price',
         'publication_status', 'availability', 'subscription_months',
         'subscription_bonus_months', 'v_total', 'v_qty'
       ]) required(token)
       where position(required.token in v_public_def) = 0
     )
     or exists (
       select 1 from unnest(array[
         'p_consent is distinct from true', 'expected_price', 'unit_price',
         'publication_status', 'availability', 'subscription_months',
         'subscription_bonus_months', 'v_total', 'v_qty', 'p_idempotency_key',
         'order_idempotency', 'on conflict'
       ]) required(token)
       where position(required.token in v_buyer_def) = 0
     )
     or position('::numeric<>v_product.unit_price' in regexp_replace(v_public_def, '\s', '', 'g')) = 0
     or position('::numeric<>v_product.unit_price' in regexp_replace(v_buyer_def, '\s', '', 'g')) = 0
     or position('v_total:=v_total+v_product.unit_price*v_qty' in regexp_replace(v_public_def, '\s', '', 'g')) = 0
     or position('v_total:=v_total+v_product.unit_price*v_qty' in regexp_replace(v_buyer_def, '\s', '', 'g')) = 0
     or position('purchase_cost' in v_public_def) > 0
     or position('purchase_cost' in v_buyer_def) > 0
     or position('purchase_currency' in v_public_def) > 0
     or position('purchase_currency' in v_buyer_def) > 0
     or position('margin' in v_public_def) > 0
     or position('margin' in v_buyer_def) > 0
     or position('internal_purchase_costs' in v_public_def) > 0
     or position('internal_purchase_costs' in v_buyer_def) > 0 then
    raise exception 'Checkout RPCs must preserve consent, server price/availability checks, term snapshots, and cost confidentiality';
  end if;

  with expected(product_id, title, unit_price, purchase_cost, description) as (
    values
      ('claude-pro-1-months', 'Claude Pro', 2630::numeric, 2099::numeric,
       'Подписка Claude Pro сроком на 1 месяц. Способ и условия выполнения заказа уточняются до оплаты.'),
      ('claude-max-5x-1-months', 'Claude Max 5x', 18880::numeric, 15100::numeric,
       'Подписка Claude Max 5x сроком на 1 месяц. Способ и условия выполнения заказа уточняются до оплаты.'),
      ('claude-max-20x-1-months', 'Claude Max 20x', 31380::numeric, 25100::numeric,
       'Подписка Claude Max 20x сроком на 1 месяц. Способ и условия выполнения заказа уточняются до оплаты.')
  ),
  product_matches as (
    select e.*, count(p.product_id) as match_count,
      count(p.product_id) filter (where
        p.product_id = e.product_id
        and p.region = ''
        and p.slug = e.product_id
        and p.title = e.title
        and p.platform = 'Claude'
        and p.currency = 'RUB'
        and p.unit_price = e.unit_price
        and p.category = 'ai'
        and p.brand = 'Claude'
        and p.product_type = 'subscription'
        and p.subscription_months = 1::integer
        and p.subscription_bonus_months = 0::integer
        and p.description = e.description
        and (
          (p.publication_status = 'draft' and p.availability = 'unavailable' and p.active = false)
          or
          (p.publication_status = 'published' and p.availability = 'in_stock' and p.active = true)
        )
      ) as valid_count
    from expected e
    left join public.products p
      on p.product_id = e.product_id or p.slug = e.product_id
    group by e.product_id, e.title, e.unit_price, e.purchase_cost, e.description
  )
  select string_agg(product_id, ', ' order by product_id)
    into v_conflicts
  from product_matches
  where match_count <> 1 or valid_count <> 1;
  if v_conflicts is not null then
    raise exception 'Claude products are missing or differ from the approved identity, price, term, or safe status: %', v_conflicts;
  end if;

  with expected(product_id, purchase_cost) as (
    values
      ('claude-pro-1-months', 2099::numeric),
      ('claude-max-5x-1-months', 15100::numeric),
      ('claude-max-20x-1-months', 25100::numeric)
  )
  select string_agg(e.product_id, ', ' order by e.product_id)
    into v_conflicts
  from expected e
  left join public.internal_purchase_costs c
    on c.product_id = e.product_id and c.region = ''
  where c.product_id is null
     or c.purchase_cost is distinct from e.purchase_cost
     or c.purchase_currency is distinct from 'RUB'
     or c.purchase_cost_status is null
     or c.purchase_cost_status is distinct from 'confirmed';
  if v_conflicts is not null then
    raise exception 'Claude internal cost rows are missing or conflict with owner-approved amounts: %', v_conflicts;
  end if;
end;
$$;

-- The product seed is validated above and only these explicit publication
-- fields are changed; sale prices and structured subscription terms stay intact.
update public.products
set publication_status = 'published',
    availability = 'in_stock',
    active = true
where (product_id, region) in (
  ('claude-pro-1-months', ''),
  ('claude-max-5x-1-months', ''),
  ('claude-max-20x-1-months', '')
);

do $$
declare
  v_public_count integer;
  v_product_count integer;
  v_cost_count integer;
begin
  select count(*) into v_product_count
  from public.products
  where (product_id, region) in (
    ('claude-pro-1-months', ''),
    ('claude-max-5x-1-months', ''),
    ('claude-max-20x-1-months', '')
  )
    and publication_status = 'published'
    and active = true
    and availability = 'in_stock';

  select count(*) into v_cost_count
  from public.internal_purchase_costs
  where (product_id, region, purchase_cost, purchase_currency, purchase_cost_status) in (
    ('claude-pro-1-months', '', 2099::numeric, 'RUB', 'confirmed'),
    ('claude-max-5x-1-months', '', 15100::numeric, 'RUB', 'confirmed'),
    ('claude-max-20x-1-months', '', 25100::numeric, 'RUB', 'confirmed')
  );

  select count(*) into v_public_count
  from public.catalog_public
  where product_id in (
    'claude-pro-1-months',
    'claude-max-5x-1-months',
    'claude-max-20x-1-months'
  )
    and region = ''
    and currency = 'RUB'
    and product_type = 'subscription'
    and subscription_months = 1
    and subscription_bonus_months = 0
    and availability = 'in_stock';

  if v_product_count <> 3 or v_cost_count <> 3 or v_public_count <> 3 then
    raise exception 'Claude publication verification failed: products %, confirmed costs %, public catalog rows %',
      v_product_count, v_cost_count, v_public_count;
  end if;
end;
$$;

commit;
