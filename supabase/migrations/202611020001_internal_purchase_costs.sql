-- Ensure the private internal-cost model is present before catalog
-- seeds that depend on it. This migration never inserts or changes cost rows.
begin;

do $$
begin
  perform pg_catalog.pg_advisory_xact_lock(20261102, 1);

  if to_regclass('public.products') is null then
    raise exception 'Internal purchase costs require public.products';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.products'::regclass
      and c.contype in ('p', 'u')
      and c.conkey = array[
        (
          select a.attnum
          from pg_catalog.pg_attribute a
          where a.attrelid = 'public.products'::regclass
            and a.attname = 'product_id'
            and a.attnum > 0
            and not a.attisdropped
        ),
        (
          select a.attnum
          from pg_catalog.pg_attribute a
          where a.attrelid = 'public.products'::regclass
            and a.attname = 'region'
            and a.attnum > 0
            and not a.attisdropped
        )
      ]::smallint[]
  ) then
    raise exception 'Internal purchase costs require a unique products(product_id, region) key';
  end if;

  if to_regprocedure('public.is_admin()') is null
    or not (
      select p.prosecdef
      from pg_catalog.pg_proc p
      where p.oid = to_regprocedure('public.is_admin()')
    )
    or not (
      select coalesce(p.proconfig, array[]::text[]) @> array['search_path=""']::text[]
      from pg_catalog.pg_proc p
      where p.oid = to_regprocedure('public.is_admin()')
    )
    or position('admin_users' in lower(pg_catalog.pg_get_functiondef(to_regprocedure('public.is_admin()')))) = 0
    or position('auth.uid' in lower(pg_catalog.pg_get_functiondef(to_regprocedure('public.is_admin()')))) = 0
    or has_function_privilege('anon', 'public.is_admin()', 'execute')
    or not has_function_privilege('authenticated', 'public.is_admin()', 'execute') then
    raise exception 'Internal purchase costs require the existing secure administrator check';
  end if;
end;
$$;

create table if not exists public.internal_purchase_costs (
  product_id text not null,
  region text not null default '',
  purchase_cost numeric(12,2) not null check (purchase_cost >= 0),
  purchase_currency text not null default 'RUB' check (purchase_currency = 'RUB'),
  purchase_cost_status text not null default 'unverified'
    check (purchase_cost_status in ('confirmed', 'estimated', 'estimate', 'unverified')),
  cost_updated_at timestamptz not null default now(),
  internal_notes text not null default '',
  primary key (product_id, region),
  constraint internal_purchase_costs_variant_fk
    foreign key (product_id, region)
    references public.products(product_id, region)
    on update cascade
    on delete cascade
);

do $$
declare
  v_missing text;
  v_type_mismatches text;
  v_default_mismatches text;
  v_check_expression text;
begin
  select string_agg(required.column_name, ', ' order by required.column_name)
    into v_missing
  from (values
    ('product_id'), ('region'), ('purchase_cost'), ('purchase_currency'),
    ('purchase_cost_status'), ('cost_updated_at'), ('internal_notes')
  ) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'internal_purchase_costs'
      and c.column_name = required.column_name
  );
  if v_missing is not null then
    raise exception 'internal_purchase_costs is missing required columns: %', v_missing;
  end if;

  select string_agg(
      required.column_name || '=' || pg_catalog.format_type(a.atttypid, a.atttypmod),
      ', ' order by required.column_name
    )
    into v_type_mismatches
  from (values
    ('product_id', 'text'),
    ('region', 'text'),
    ('purchase_cost', 'numeric(12,2)'),
    ('purchase_currency', 'text'),
    ('purchase_cost_status', 'text'),
    ('cost_updated_at', 'timestamp with time zone'),
    ('internal_notes', 'text')
  ) as required(column_name, expected_type)
  join pg_catalog.pg_attribute a
    on a.attrelid = 'public.internal_purchase_costs'::regclass
   and a.attname = required.column_name
   and a.attnum > 0
   and not a.attisdropped
  where pg_catalog.format_type(a.atttypid, a.atttypmod) is distinct from required.expected_type;
  if v_type_mismatches is not null then
    raise exception 'internal_purchase_costs has incompatible column types: %', v_type_mismatches;
  end if;

  select string_agg(required.column_name, ', ' order by required.column_name)
    into v_default_mismatches
  from (values
    ('product_id', null::text),
    ('region', ''''''),
    ('purchase_cost', null::text),
    ('purchase_currency', '''rub'''),
    ('purchase_cost_status', '''unverified'''),
    ('cost_updated_at', 'now()'),
    ('internal_notes', '''''')
  ) as required(column_name, expected_expression)
  join pg_catalog.pg_attribute a
    on a.attrelid = 'public.internal_purchase_costs'::regclass
   and a.attname = required.column_name
   and a.attnum > 0
   and not a.attisdropped
  left join pg_catalog.pg_attrdef d
    on d.adrelid = a.attrelid
   and d.adnum = a.attnum
  where (
    required.expected_expression is null
    and d.oid is not null
  ) or (
    required.expected_expression is not null
    and (
      d.oid is null
      or regexp_replace(
        regexp_replace(
          lower(pg_catalog.pg_get_expr(d.adbin, d.adrelid)),
          '::(pg_catalog\.)?(numeric(\([0-9, ]+\))?|text(\[\])?|boolean)',
          '',
          'g'
        ),
        '[[:space:]()]',
        '',
        'g'
      ) is distinct from required.expected_expression
    )
  );
  if v_default_mismatches is not null then
    raise exception 'internal_purchase_costs has incompatible column defaults: %', v_default_mismatches;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.internal_purchase_costs'::regclass
      and c.contype = 'p'
      and c.conkey = array[
        (
          select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = 'public.internal_purchase_costs'::regclass
            and a.attname = 'product_id' and not a.attisdropped
        ),
        (
          select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = 'public.internal_purchase_costs'::regclass
            and a.attname = 'region' and not a.attisdropped
        )
      ]::smallint[]
  ) then
    raise exception 'internal_purchase_costs requires a primary key on (product_id, region)';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.internal_purchase_costs'::regclass
      and c.conname = 'internal_purchase_costs_variant_fk'
      and c.contype = 'f'
      and c.convalidated
      and c.confrelid = 'public.products'::regclass
      and c.conkey = array[
        (
          select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = 'public.internal_purchase_costs'::regclass
            and a.attname = 'product_id' and not a.attisdropped
        ),
        (
          select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = 'public.internal_purchase_costs'::regclass
            and a.attname = 'region' and not a.attisdropped
        )
      ]::smallint[]
      and c.confkey = array[
        (
          select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = 'public.products'::regclass
            and a.attname = 'product_id' and not a.attisdropped
        ),
        (
          select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid = 'public.products'::regclass
            and a.attname = 'region' and not a.attisdropped
        )
      ]::smallint[]
      and c.confupdtype = 'c'
      and c.confdeltype = 'c'
  ) then
    raise exception 'internal_purchase_costs requires a validated product variant foreign key';
  end if;

  if exists (
    select 1
    from (values
      ('product_id'), ('region'), ('purchase_cost'), ('purchase_currency'),
      ('purchase_cost_status'), ('cost_updated_at'), ('internal_notes')
    ) as required(column_name)
    join pg_catalog.pg_attribute a
      on a.attrelid = 'public.internal_purchase_costs'::regclass
     and a.attname = required.column_name
     and a.attnum > 0
     and not a.attisdropped
    where not a.attnotnull
  ) then
    raise exception 'internal_purchase_costs required columns must be NOT NULL';
  end if;

  select regexp_replace(
      regexp_replace(
        lower(pg_catalog.pg_get_expr(c.conbin, c.conrelid)),
        '::(pg_catalog\.)?(numeric(\([0-9, ]+\))?|text(\[\])?|boolean)',
        '',
        'g'
      ),
      '[[:space:]()]',
      '',
      'g'
    )
    into v_check_expression
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.internal_purchase_costs'::regclass
    and c.conname = 'internal_purchase_costs_purchase_cost_check'
    and c.contype = 'c'
    and c.convalidated
    and c.conkey = array[
      (
        select a.attnum from pg_catalog.pg_attribute a
        where a.attrelid = 'public.internal_purchase_costs'::regclass
          and a.attname = 'purchase_cost' and not a.attisdropped
      )
    ]::smallint[];
  if v_check_expression is distinct from 'purchase_cost>=0' then
    raise exception 'internal_purchase_costs requires the validated purchase_cost >= 0 constraint';
  end if;

  select regexp_replace(
      regexp_replace(
        lower(pg_catalog.pg_get_expr(c.conbin, c.conrelid)),
        '::(pg_catalog\.)?(numeric(\([0-9, ]+\))?|text(\[\])?|boolean)',
        '',
        'g'
      ),
      '[[:space:]()]',
      '',
      'g'
    )
    into v_check_expression
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.internal_purchase_costs'::regclass
    and c.conname = 'internal_purchase_costs_purchase_currency_check'
    and c.contype = 'c'
    and c.convalidated
    and c.conkey = array[
      (
        select a.attnum from pg_catalog.pg_attribute a
        where a.attrelid = 'public.internal_purchase_costs'::regclass
          and a.attname = 'purchase_currency' and not a.attisdropped
      )
    ]::smallint[];
  if v_check_expression is distinct from 'purchase_currency=''rub''' then
    raise exception 'internal_purchase_costs requires the validated purchase_currency = RUB constraint';
  end if;

  select regexp_replace(
      regexp_replace(
        lower(pg_catalog.pg_get_expr(c.conbin, c.conrelid)),
        '::(pg_catalog\.)?(numeric(\([0-9, ]+\))?|text(\[\])?|boolean)',
        '',
        'g'
      ),
      '[[:space:]()]',
      '',
      'g'
    )
    into v_check_expression
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.internal_purchase_costs'::regclass
    and c.conname = 'internal_purchase_costs_purchase_cost_status_check'
    and c.contype = 'c'
    and c.convalidated
    and c.conkey = array[
      (
        select a.attnum from pg_catalog.pg_attribute a
        where a.attrelid = 'public.internal_purchase_costs'::regclass
          and a.attname = 'purchase_cost_status' and not a.attisdropped
      )
    ]::smallint[];
  if v_check_expression is distinct from
    'purchase_cost_status=anyarray[''confirmed'',''estimated'',''estimate'',''unverified'']' then
    raise exception 'internal_purchase_costs requires the validated purchase_cost_status constraint';
  end if;

  if exists (
    select 1
    from public.internal_purchase_costs
    where purchase_cost_status not in ('confirmed', 'estimated', 'estimate', 'unverified')
       or purchase_cost < 0
       or purchase_currency <> 'RUB'
  ) then
    raise exception 'internal_purchase_costs contains values incompatible with the current BezB cost model';
  end if;
end;
$$;

alter table public.internal_purchase_costs enable row level security;
revoke all on public.internal_purchase_costs from public, anon, authenticated;
grant select, insert, update, delete on public.internal_purchase_costs to authenticated;

drop policy if exists "Admins manage internal purchase costs" on public.internal_purchase_costs;
create policy "Admins manage internal purchase costs" on public.internal_purchase_costs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "BezB internal purchase costs admin boundary" on public.internal_purchase_costs;
create policy "BezB internal purchase costs admin boundary" on public.internal_purchase_costs
  as restrictive for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

do $$
begin
  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid = 'public.internal_purchase_costs'::regclass
  )
    or has_table_privilege('anon', 'public.internal_purchase_costs', 'select')
    or has_table_privilege('anon', 'public.internal_purchase_costs', 'insert')
    or has_table_privilege('anon', 'public.internal_purchase_costs', 'update')
    or has_table_privilege('anon', 'public.internal_purchase_costs', 'delete')
    or not has_table_privilege('authenticated', 'public.internal_purchase_costs', 'select')
    or not has_table_privilege('authenticated', 'public.internal_purchase_costs', 'insert')
    or not has_table_privilege('authenticated', 'public.internal_purchase_costs', 'update')
    or not has_table_privilege('authenticated', 'public.internal_purchase_costs', 'delete')
    or not exists (
      select 1
      from pg_catalog.pg_policy p
      where p.polrelid = 'public.internal_purchase_costs'::regclass
        and p.polname = 'Admins manage internal purchase costs'
        and p.polcmd = '*'
        and p.polpermissive
        and pg_catalog.pg_get_expr(p.polqual, p.polrelid) like '%is_admin%'
        and pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) like '%is_admin%'
    )
    or not exists (
      select 1
      from pg_catalog.pg_policy p
      where p.polrelid = 'public.internal_purchase_costs'::regclass
        and p.polname = 'BezB internal purchase costs admin boundary'
        and p.polcmd = '*'
        and not p.polpermissive
        and pg_catalog.pg_get_expr(p.polqual, p.polrelid) like '%is_admin%'
        and pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) like '%is_admin%'
    ) then
    raise exception 'internal_purchase_costs must grant access only through administrator RLS';
  end if;

  if to_regclass('public.catalog_public') is null then
    raise exception 'public.catalog_public must exist';
  end if;

  if (
      select c.relkind
      from pg_catalog.pg_class c
      where c.oid = to_regclass('public.catalog_public')
    ) <> 'v'
    or exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'catalog_public'
        and c.column_name in (
          'purchase_cost', 'purchase_currency', 'purchase_cost_status',
          'cost_updated_at', 'internal_notes'
        )
    )
    or position(
      'internal_purchase_costs'
      in lower(pg_catalog.pg_get_viewdef('public.catalog_public'::regclass, true))
    ) > 0 then
    raise exception 'catalog_public must remain independent of internal purchase costs';
  end if;
end;
$$;

commit;
