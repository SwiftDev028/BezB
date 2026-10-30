-- Prepare Claude subscription variants as unpublished, unavailable drafts.
-- Owner-confirmed costs are stored separately from supplier mappings. No
-- checkout or public catalog definitions are changed.
begin;

do $$
declare
  v_missing text;
begin
  if to_regclass('public.products') is null
     or to_regclass('public.catalog_public') is null then
    raise exception 'Claude drafts require public.products and public.catalog_public';
  end if;

  select string_agg(required.column_name, ', ' order by required.column_name)
    into v_missing
  from (values
    ('product_id'),('region'),('group_id'),('slug'),('unit_price'),
    ('subscription_months'),('subscription_bonus_months')
  ) as required(column_name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'products'
      and c.column_name = required.column_name
  );
  if v_missing is not null then
    raise exception 'Claude drafts require public.products columns: %', v_missing;
  end if;

  if (select a.atttypid from pg_catalog.pg_attribute a
      where a.attrelid = 'public.products'::regclass and a.attname = 'product_id' and not a.attisdropped) <> 'text'::regtype
     or (select a.atttypid from pg_catalog.pg_attribute a
      where a.attrelid = 'public.products'::regclass and a.attname = 'region' and not a.attisdropped) <> 'text'::regtype
     or (select a.atttypid from pg_catalog.pg_attribute a
      where a.attrelid = 'public.products'::regclass and a.attname = 'group_id' and not a.attisdropped) <> 'uuid'::regtype
     or (select a.atttypid from pg_catalog.pg_attribute a
      where a.attrelid = 'public.products'::regclass and a.attname = 'unit_price' and not a.attisdropped) <> 'numeric'::regtype
     or (select a.atttypid from pg_catalog.pg_attribute a
      where a.attrelid = 'public.products'::regclass and a.attname = 'subscription_months' and not a.attisdropped) <> 'integer'::regtype
     or (select a.atttypid from pg_catalog.pg_attribute a
      where a.attrelid = 'public.products'::regclass and a.attname = 'subscription_bonus_months' and not a.attisdropped) <> 'integer'::regtype then
    raise exception 'Claude drafts require text product IDs/regions, UUID groups, numeric prices, and integer subscription terms';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.products'::regclass and c.contype in ('p','u')
      and c.conkey = array[
        (select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.products'::regclass and a.attname='product_id' and not a.attisdropped),
        (select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.products'::regclass and a.attname='region' and not a.attisdropped)
      ]::smallint[]
  ) then
    raise exception 'Claude internal costs require a unique products(product_id, region) key';
  end if;

  if to_regprocedure('public.is_admin()') is null
     or not (select p.prosecdef from pg_catalog.pg_proc p where p.oid=to_regprocedure('public.is_admin()'))
     or not (select coalesce(p.proconfig, array[]::text[]) @> array['search_path=""']::text[]
       from pg_catalog.pg_proc p where p.oid=to_regprocedure('public.is_admin()'))
     or position('admin_users' in lower(pg_catalog.pg_get_functiondef(to_regprocedure('public.is_admin()')))) = 0
     or position('auth.uid' in lower(pg_catalog.pg_get_functiondef(to_regprocedure('public.is_admin()')))) = 0
     or has_function_privilege('anon', 'public.is_admin()', 'execute')
     or not has_function_privilege('authenticated', 'public.is_admin()', 'execute') then
    raise exception 'Claude internal costs require the existing secure administrator check';
  end if;
end;
$$;

-- This table is absent from the audited live schema. Create the minimum
-- owner-maintained model without inventing a supplier relationship.
create table if not exists public.internal_purchase_costs (
  product_id text not null,
  region text not null default '',
  purchase_cost numeric(12,2) not null check (purchase_cost >= 0),
  purchase_currency text not null default 'RUB' check (purchase_currency = 'RUB'),
  purchase_cost_status text not null default 'unverified',
  cost_updated_at timestamptz not null default now(),
  internal_notes text not null default '',
  primary key (product_id, region),
  constraint internal_purchase_costs_variant_fk
    foreign key (product_id, region) references public.products(product_id, region)
    on update cascade on delete cascade
);

do $$
begin
  if exists (
    select 1 from public.internal_purchase_costs
    where purchase_cost_status is null
       or purchase_cost_status not in ('confirmed', 'estimated', 'estimate', 'unverified')
  ) then
    raise exception 'Unknown internal purchase-cost status found; inspect existing rows before migration';
  end if;
end;
$$;

alter table public.internal_purchase_costs
  drop constraint if exists internal_purchase_costs_purchase_cost_status_check;
alter table public.internal_purchase_costs
  add constraint internal_purchase_costs_purchase_cost_status_check
  check (purchase_cost_status in ('confirmed', 'estimated', 'estimate', 'unverified'));
alter table public.internal_purchase_costs enable row level security;
revoke all on public.internal_purchase_costs from public, anon, authenticated;
grant select, insert, update, delete on public.internal_purchase_costs to authenticated;
drop policy if exists "Admins manage internal purchase costs" on public.internal_purchase_costs;
create policy "Admins manage internal purchase costs" on public.internal_purchase_costs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "BezB internal purchase costs admin boundary" on public.internal_purchase_costs;
create policy "BezB internal purchase costs admin boundary" on public.internal_purchase_costs
  as restrictive for all to authenticated using (public.is_admin()) with check (public.is_admin());

do $$
declare
  v_missing text;
  v_conflicts text;
  v_view_definition text;
begin
  if to_regclass('public.products') is null
     or to_regclass('public.internal_purchase_costs') is null
     or to_regclass('public.catalog_public') is null then
    raise exception 'Claude drafts require products, internal_purchase_costs, and catalog_public';
  end if;

  select string_agg(required.table_name || '.' || required.column_name, ', ' order by required.table_name, required.column_name)
    into v_missing
  from (values
    ('products','product_id'),('products','region'),('products','group_id'),('products','slug'),
    ('products','title'),('products','platform'),('products','currency'),('products','unit_price'),
    ('products','active'),('products','description'),('products','category'),('products','brand'),
    ('products','product_type'),('products','subscription_months'),('products','subscription_bonus_months'),
    ('products','image_url'),('products','activation_instructions'),('products','restrictions'),
    ('products','availability'),('products','publication_status'),
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
    raise exception 'Claude drafts require missing columns: %', v_missing;
  end if;

  if (select a.atttypid from pg_catalog.pg_attribute a
      where a.attrelid = 'public.products'::regclass and a.attname = 'subscription_months' and not a.attisdropped) <> 'integer'::regtype
     or (select a.atttypid from pg_catalog.pg_attribute a
      where a.attrelid = 'public.products'::regclass and a.attname = 'subscription_bonus_months' and not a.attisdropped) <> 'integer'::regtype
     or (select a.atttypid from pg_catalog.pg_attribute a
      where a.attrelid = 'public.products'::regclass and a.attname = 'group_id' and not a.attisdropped) <> 'uuid'::regtype then
    raise exception 'Claude drafts require integer subscription terms and UUID product groups';
  end if;
  if (select a.atttypid
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.products'::regclass and a.attname = 'unit_price' and not a.attisdropped) <> 'numeric'::regtype
     or (select pg_catalog.format_type(a.atttypid, a.atttypmod)
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.internal_purchase_costs'::regclass and a.attname = 'purchase_cost' and not a.attisdropped) <> 'numeric(12,2)'
     or (select a.atttypid from pg_catalog.pg_attribute a
      where a.attrelid = 'public.internal_purchase_costs'::regclass and a.attname = 'purchase_currency' and not a.attisdropped) <> 'text'::regtype
     or (select a.atttypid from pg_catalog.pg_attribute a
      where a.attrelid = 'public.internal_purchase_costs'::regclass and a.attname = 'purchase_cost_status' and not a.attisdropped) <> 'text'::regtype then
    raise exception 'Claude drafts require numeric sale prices, numeric(12,2) costs, and text currency/status columns';
  end if;

  if not exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = 'public.products'::regclass and c.contype = 'c' and c.convalidated
        and c.conkey @> array[
          (select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.products'::regclass and a.attname='subscription_months' and not a.attisdropped)
        ]::smallint[]
    )
    or not exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = 'public.products'::regclass and c.contype = 'c' and c.convalidated
        and c.conkey @> array[
          (select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.products'::regclass and a.attname='subscription_bonus_months' and not a.attisdropped)
        ]::smallint[]
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
    raise exception 'Claude drafts require validated subscription-term and internal cost status constraints';
  end if;
  if not exists (
      select 1       from pg_catalog.pg_class c
      where c.oid = 'public.internal_purchase_costs'::regclass and c.relrowsecurity
    )
    or has_table_privilege('anon', 'public.internal_purchase_costs', 'select') then
    raise exception 'internal_purchase_costs must retain its RLS protection and deny anon SELECT';
  end if;
  if has_table_privilege('anon', 'public.internal_purchase_costs', 'insert')
     or has_table_privilege('anon', 'public.internal_purchase_costs', 'update')
     or has_table_privilege('anon', 'public.internal_purchase_costs', 'delete')
     or not has_table_privilege('authenticated', 'public.internal_purchase_costs', 'select')
     or not has_table_privilege('authenticated', 'public.internal_purchase_costs', 'insert')
     or not has_table_privilege('authenticated', 'public.internal_purchase_costs', 'update')
     or not has_table_privilege('authenticated', 'public.internal_purchase_costs', 'delete')
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
    raise exception 'internal_purchase_costs must grant access only through administrator RLS';
  end if;
  if not exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = 'public.internal_purchase_costs'::regclass
        and c.contype in ('p','u')
        and c.conkey = array[
          (select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.internal_purchase_costs'::regclass and a.attname='product_id' and not a.attisdropped),
          (select a.attnum from pg_catalog.pg_attribute a where a.attrelid='public.internal_purchase_costs'::regclass and a.attname='region' and not a.attisdropped)
        ]::smallint[]
    )
    or not exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = 'public.internal_purchase_costs'::regclass
        and c.contype = 'f' and c.convalidated
        and c.confrelid = 'public.products'::regclass
    )
    or not exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = 'public.internal_purchase_costs'::regclass
        and c.contype = 'c' and c.convalidated
        and pg_catalog.pg_get_constraintdef(c.oid) like '%purchase_cost%'
        and pg_catalog.pg_get_constraintdef(c.oid) like '%0%'
    )
    or not exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = 'public.internal_purchase_costs'::regclass
        and c.contype = 'c' and c.convalidated
        and pg_catalog.pg_get_constraintdef(c.oid) like '%purchase_currency%'
        and pg_catalog.pg_get_constraintdef(c.oid) like '%RUB%'
    ) then
    raise exception 'internal_purchase_costs is missing its variant key, product FK, or cost/currency constraints';
  end if;

  select pg_catalog.pg_get_viewdef('public.catalog_public'::regclass, true)
    into v_view_definition;
  if position('internal_purchase_costs' in v_view_definition) > 0
     or exists (
       select 1 from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'catalog_public'
         and c.column_name in ('purchase_cost', 'purchase_currency', 'purchase_cost_status', 'internal_notes', 'margin')
     ) then
    raise exception 'catalog_public must not expose internal purchase costs';
  end if;

  -- IDs match suggestIds(title, '', '', '', '1') in src/utils/adminCatalog.ts.
  -- Existing rows may already be published only if they match this exact seed.
  with expected(product_id, slug, title, unit_price, purchase_cost, description, restrictions) as (
    values
      (
        'claude-pro-1-months', 'claude-pro-1-months', 'Claude Pro', 2630, 2099,
        'Подписка Claude Pro сроком на 1 месяц. Способ и условия выполнения заказа уточняются до оплаты.',
        '[]'::jsonb
      ),
      (
        'claude-max-5x-1-months', 'claude-max-5x-1-months', 'Claude Max 5x', 18880, 15100,
        'Подписка Claude Max 5x сроком на 1 месяц. Способ и условия выполнения заказа уточняются до оплаты.',
        '[]'::jsonb
      ),
      (
        'claude-max-20x-1-months', 'claude-max-20x-1-months', 'Claude Max 20x', 31380, 25100,
        'Подписка Claude Max 20x сроком на 1 месяц. Способ и условия выполнения заказа уточняются до оплаты.',
        '[]'::jsonb
      )
  ),
  conflicts as (
    select e.product_id
    from expected e
    join public.products p
      on p.product_id = e.product_id or p.slug = e.slug
    where p.product_id is distinct from e.product_id
       or p.region is distinct from ''
       or p.slug is distinct from e.slug
       or p.title is distinct from e.title
       or p.platform is distinct from 'Claude'
       or p.currency is distinct from 'RUB'
       or p.unit_price is distinct from e.unit_price
       or p.description is distinct from e.description
       or p.category is distinct from 'ai'
       or p.brand is distinct from 'Claude'
       or p.product_type is distinct from 'subscription'
       or p.subscription_months is distinct from 1
       or p.subscription_bonus_months is distinct from 0
       or p.image_url is not null
       or p.activation_instructions is distinct from ''
       or p.restrictions is distinct from e.restrictions
       or not (
         (p.active is false and p.availability = 'unavailable' and p.publication_status = 'draft')
         or
         (p.active is true and p.availability = 'in_stock' and p.publication_status = 'published')
       )
  )
  select string_agg(product_id, ', ' order by product_id)
    into v_conflicts
  from conflicts;

  if v_conflicts is not null then
    raise exception 'Claude product IDs/slugs conflict with existing catalog data: %', v_conflicts;
  end if;

  if exists (
    select 1
    from public.products
    where region = ''
      and product_id in ('claude-pro-1-months','claude-max-5x-1-months','claude-max-20x-1-months')
    having count(distinct group_id) > 1 or bool_or(group_id is null)
  ) then
    raise exception 'Existing Claude variants must share one non-null product group';
  end if;

  with expected(product_id, purchase_cost) as (
    values
      ('claude-pro-1-months', 2099),
      ('claude-max-5x-1-months', 15100),
      ('claude-max-20x-1-months', 25100)
  )
  select string_agg(e.product_id, ', ' order by e.product_id)
    into v_conflicts
  from expected e
  join public.internal_purchase_costs c
    on c.product_id = e.product_id and c.region = ''
  where c.purchase_cost is distinct from e.purchase_cost
     or c.purchase_currency is distinct from 'RUB'
     or c.purchase_cost_status is null
     or c.purchase_cost_status not in ('confirmed', 'estimated', 'estimate', 'unverified');

  if v_conflicts is not null then
    raise exception 'Claude internal cost rows conflict with supplied amounts/currency: %', v_conflicts;
  end if;
end;
$$;

with new_group as (
  select coalesce(
    (select min(group_id::text)::uuid
     from public.products
     where region = ''
       and product_id in ('claude-pro-1-months','claude-max-5x-1-months','claude-max-20x-1-months')),
    gen_random_uuid()
  ) as group_id
), expected(product_id, slug, title, unit_price, description) as (
  values
    ('claude-pro-1-months', 'claude-pro-1-months', 'Claude Pro', 2630::numeric,
     'Подписка Claude Pro сроком на 1 месяц. Способ и условия выполнения заказа уточняются до оплаты.'),
    ('claude-max-5x-1-months', 'claude-max-5x-1-months', 'Claude Max 5x', 18880::numeric,
     'Подписка Claude Max 5x сроком на 1 месяц. Способ и условия выполнения заказа уточняются до оплаты.'),
    ('claude-max-20x-1-months', 'claude-max-20x-1-months', 'Claude Max 20x', 31380::numeric,
     'Подписка Claude Max 20x сроком на 1 месяц. Способ и условия выполнения заказа уточняются до оплаты.')
)
insert into public.products (
  product_id, region, group_id, title, platform, currency, unit_price, active,
  slug, description, category, brand, product_type,
  subscription_months, subscription_bonus_months,
  image_url, activation_instructions, restrictions,
  availability, publication_status
)
select
  e.product_id, '', g.group_id, e.title, 'Claude', 'RUB', e.unit_price, false,
  e.slug, e.description, 'ai', 'Claude', 'subscription',
  1, 0, null, '', '[]'::jsonb, 'unavailable', 'draft'
from expected e
cross join new_group g
on conflict (product_id, region) do nothing;

insert into public.internal_purchase_costs (
  product_id, region, purchase_cost, purchase_currency, purchase_cost_status, internal_notes
)
values
  ('claude-pro-1-months', '', 2099, 'RUB', 'confirmed', 'Закупочная цена подтверждена владельцем 2026-10-26; поставщик не подтверждён.'),
  ('claude-max-5x-1-months', '', 15100, 'RUB', 'confirmed', 'Закупочная цена подтверждена владельцем 2026-10-26; поставщик не подтверждён.'),
  ('claude-max-20x-1-months', '', 25100, 'RUB', 'confirmed', 'Закупочная цена подтверждена владельцем 2026-10-26; поставщик не подтверждён.')
on conflict (product_id, region) do nothing;

with approved(product_id, purchase_cost) as (values
  ('claude-pro-1-months', 2099::numeric),
  ('claude-max-5x-1-months', 15100::numeric),
  ('claude-max-20x-1-months', 25100::numeric)
)
update public.internal_purchase_costs c
set purchase_cost_status = 'confirmed',
    cost_updated_at = case when c.purchase_cost_status is distinct from 'confirmed' then now() else c.cost_updated_at end
from approved a
where c.product_id = a.product_id
  and c.region = ''
  and c.purchase_cost = a.purchase_cost
  and c.purchase_currency = 'RUB'
  and c.purchase_cost_status is distinct from 'confirmed';

commit;
