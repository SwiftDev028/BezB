-- Read-only preflight for the internal-cost and Call of Duty migrations.
-- Run each numbered section separately in Supabase SQL Editor.
-- Run section 7's data query only after its prerequisites and the required
-- checks in sections 1-6 have all passed. Section 5 always requires manual
-- review; no query in this file certifies that access is safe.
-- This file contains catalog and data reads only; it does not change database state.

-- 1. Required relations and object kinds.
select
  expected.object_name,
  coalesce(c.relkind::text, 'missing') as relation_kind,
  case
    when c.oid is null then 'MISSING'
    when expected.expected_kind is null or c.relkind = expected.expected_kind then 'OK'
    else 'UNEXPECTED KIND'
  end as result
from (values
  ('public.products', 'r'::"char"),
  ('public.catalog_public', 'v'::"char"),
  ('public.internal_purchase_costs', 'r'::"char")
) as expected(object_name, expected_kind)
left join pg_catalog.pg_class c
  on c.oid = to_regclass(expected.object_name)
order by expected.object_name;

-- 2. Required columns, exact SQL types, NOT NULL flags, and defaults.
-- A NULL expected_default means the column must have no default.
with expected(table_name, column_name, expected_type, expected_not_null, expected_default) as (
  values
    ('products', 'product_id', 'text', true, null::text),
    ('products', 'region', 'text', true, $$''$$),
    ('internal_purchase_costs', 'product_id', 'text', true, null::text),
    ('internal_purchase_costs', 'region', 'text', true, $$''$$),
    ('internal_purchase_costs', 'purchase_cost', 'numeric(12,2)', true, null::text),
    ('internal_purchase_costs', 'purchase_currency', 'text', true, $$'RUB'$$),
    ('internal_purchase_costs', 'purchase_cost_status', 'text', true, $$'unverified'$$),
    ('internal_purchase_costs', 'cost_updated_at', 'timestamp with time zone', true, 'now'),
    ('internal_purchase_costs', 'internal_notes', 'text', true, $$''$$)
),
actual as (
  select
    e.*,
    a.attnum,
    pg_catalog.format_type(a.atttypid, a.atttypmod) as actual_type,
    a.attnotnull as actual_not_null,
    d.oid is not null as has_default,
    case when d.oid is not null then
      regexp_replace(
        regexp_replace(
          regexp_replace(
            pg_catalog.pg_get_expr(d.adbin, d.adrelid),
            '::(pg_catalog\.)?(numeric(\([0-9,[:space:]]+\))?|text(\[\])?|boolean)',
            '',
            'g'
          ),
          '[[:space:]]',
          '',
          'g'
        ),
        '[()]',
        '',
        'g'
      )
    end as actual_default
  from expected e
  left join pg_catalog.pg_attribute a
    on a.attrelid = to_regclass('public.' || e.table_name)
   and a.attname = e.column_name
   and a.attnum > 0
   and not a.attisdropped
  left join pg_catalog.pg_attrdef d
    on d.adrelid = a.attrelid
   and d.adnum = a.attnum
)
select
  table_name,
  column_name,
  expected_type,
  actual_type,
  expected_not_null,
  actual_not_null,
  expected_default,
  actual_default,
  case
    when attnum is null then 'MISSING'
    when actual_type is distinct from expected_type
      or actual_not_null is distinct from expected_not_null
      or (expected_default is null and has_default)
      or (expected_default is not null and actual_default is distinct from expected_default)
      then 'MISMATCH'
    else 'OK'
  end as result
from actual
order by table_name, column_name;

-- 3. Product variant key and internal-cost primary/foreign keys.
-- The product key check matches exact column order and counts all candidates.
-- Multiple matching PK/UNIQUE constraints are reported as AMBIGUOUS.
with expected(table_name, constraint_name, constraint_type) as (
  values
    ('products', 'products_variant_pk_or_unique', 'p/u'),
    ('internal_purchase_costs', 'internal_purchase_costs_pkey', 'p'),
    ('internal_purchase_costs', 'internal_purchase_costs_variant_fk', 'f')
),
columns_by_table as (
  select
    table_name,
    array_agg(attnum::smallint order by case column_name when 'product_id' then 1 else 2 end) as key_columns
  from (
    select 'products'::text as table_name, a.attname as column_name, a.attnum
    from pg_catalog.pg_attribute a
    where a.attrelid = to_regclass('public.products')
      and a.attname in ('product_id', 'region')
      and a.attnum > 0 and not a.attisdropped
    union all
    select 'internal_purchase_costs', a.attname, a.attnum
    from pg_catalog.pg_attribute a
    where a.attrelid = to_regclass('public.internal_purchase_costs')
      and a.attname in ('product_id', 'region')
      and a.attnum > 0 and not a.attisdropped
  ) columns_found
  group by table_name
),
matches as (
  select
    e.table_name,
    e.constraint_name,
    e.constraint_type,
    c.oid as constraint_oid,
    c.conname,
    c.contype,
    c.convalidated,
    c.conkey,
    c.confkey,
    c.confrelid,
    c.confupdtype,
    c.confdeltype,
    cb.key_columns
  from expected e
  left join columns_by_table cb on cb.table_name = e.table_name
  left join pg_catalog.pg_constraint c
    on c.conrelid = to_regclass('public.' || e.table_name)
   and (
     (e.table_name = 'products' and c.contype in ('p', 'u') and c.conkey = cb.key_columns)
     or (e.table_name = 'internal_purchase_costs' and c.conname = e.constraint_name)
   )
),
summarized as (
  select
    table_name,
    constraint_name,
    constraint_type,
    key_columns,
    count(conname) as candidate_count,
    bool_and(convalidated) as all_candidates_validated,
    bool_and(
      case
        when table_name = 'internal_purchase_costs' and constraint_type = 'p'
          then contype = 'p' and conkey = key_columns
        when table_name = 'internal_purchase_costs' and constraint_type = 'f'
          then contype = 'f'
            and convalidated
            and confrelid = to_regclass('public.products')
            and conkey = key_columns
            and confkey = (
              select array_agg(
                a.attnum::smallint
                order by case a.attname when 'product_id' then 1 else 2 end
              )
              from pg_catalog.pg_attribute a
              where a.attrelid = to_regclass('public.products')
                and a.attname in ('product_id', 'region')
                and a.attnum > 0 and not a.attisdropped
            )
            and confupdtype = 'c'
            and confdeltype = 'c'
        else true
      end
    ) as candidates_match_definition,
    string_agg(conname, ', ' order by conname) filter (where conname is not null) as candidate_names,
    string_agg(
      pg_catalog.pg_get_constraintdef(constraint_oid),
      ' | ' order by conname
    ) filter (where conname is not null) as definitions
  from matches
  group by table_name, constraint_name, constraint_type, key_columns
)
select
  table_name,
  constraint_name,
  case
    when key_columns is null or cardinality(key_columns) <> 2 then 'MISSING COLUMNS'
    when candidate_count = 0 then 'MISSING'
    when candidate_count > 1 then 'AMBIGUOUS'
    when not all_candidates_validated then 'NOT VALIDATED'
    when not candidates_match_definition then 'MISMATCH'
    else 'ONE CANDIDATE; INSPECT DEFINITION'
  end as result,
  candidate_count,
  candidate_names,
  all_candidates_validated,
  key_columns,
  definitions
from summarized
order by table_name, constraint_name;

-- 4. Actual CHECK definitions and a normalized-text comparison.
-- Removing casts, whitespace, and parentheses is only a comparison heuristic;
-- a text match is NOT proof that two expressions are semantically equivalent.
with expected(table_name, constraint_name, expected_expression) as (
  values
    ('products', 'products_active_publication_check',
      'active=publication_status=''published''andavailability=''in_stock'''),
    ('products', 'products_type_check',
      'product_type=anyarray[''gift-card'',''game'',''subscription'',''topup'']'),
    ('products', 'products_category_check',
      'category=anyarray[''apple'',''xbox'',''playstation'',''steam'',''ai'']'),
    ('internal_purchase_costs', 'internal_purchase_costs_purchase_cost_check',
      'purchase_cost>=0'),
    ('internal_purchase_costs', 'internal_purchase_costs_purchase_currency_check',
      'purchase_currency=''RUB'''),
    ('internal_purchase_costs', 'internal_purchase_costs_purchase_cost_status_check',
      'purchase_cost_status=anyarray[''confirmed'',''estimated'',''estimate'',''unverified'']')
),
actual as (
  select
    e.*,
    c.oid as constraint_oid,
    c.convalidated,
    case when c.oid is not null then pg_catalog.pg_get_expr(c.conbin, c.conrelid) end as actual_definition,
    case when c.oid is not null then
      regexp_replace(
        regexp_replace(
          regexp_replace(
            pg_catalog.pg_get_expr(c.conbin, c.conrelid),
            '::(pg_catalog\.)?(numeric(\([0-9,[:space:]]+\))?|text(\[\])?|boolean)',
            '',
            'g'
          ),
          '[[:space:]]',
          '',
          'g'
        ),
        '[()]',
        '',
        'g'
      )
    end as normalized_expression
  from expected e
  left join pg_catalog.pg_constraint c
    on c.conrelid = to_regclass('public.' || e.table_name)
   and c.conname = e.constraint_name
   and c.contype = 'c'
)
select
  table_name,
  constraint_name,
  actual_definition,
  normalized_expression,
  expected_expression,
  case
    when constraint_oid is null then 'MISSING'
    when not convalidated then 'NOT VALIDATED'
    when normalized_expression is distinct from expected_expression then 'MISMATCH'
    else 'NORMALIZED TEXT MATCH ONLY; REVIEW DEFINITION'
  end as diagnostic_result
from actual
order by table_name, constraint_name;

-- 5. RLS flags, role grants, and policies on internal_purchase_costs.
-- These are diagnostic evidence, not an automatic security certification.
-- Direct ACL entries include PUBLIC (grantee_oid = 0). Effective privileges
-- below use has_table_privilege and therefore include inherited role grants.
select
  c.oid::regclass as relation_name,
  pg_catalog.pg_get_userbyid(c.relowner) as table_owner,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_row_level_security
from (values (to_regclass('public.internal_purchase_costs'))) as target(table_oid)
left join pg_catalog.pg_class c on c.oid = target.table_oid;

-- Owner, anon, and authenticated role attributes. Also list every superuser
-- or BYPASSRLS role in the database; these roles require separate review.
select
  r.rolname,
  r.rolsuper,
  r.rolbypassrls,
  r.rolinherit,
  r.rolcanlogin,
  case
    when r.oid = c.relowner then 'TABLE OWNER'
    when r.rolname in ('anon', 'authenticated') then 'API ROLE'
    else 'PRIVILEGED ROLE'
  end as role_context
from pg_catalog.pg_roles r
left join pg_catalog.pg_class c
  on c.oid = to_regclass('public.internal_purchase_costs')
where r.rolname in ('anon', 'authenticated')
   or r.oid = c.relowner
   or r.rolsuper
   or r.rolbypassrls
order by r.rolname;

select
  acl.grantee as grantee_oid,
  case when acl.grantee = 0::oid then 'PUBLIC'
    else pg_catalog.pg_get_userbyid(acl.grantee) end as grantee,
  pg_catalog.pg_get_userbyid(acl.grantor) as grantor,
  acl.privilege_type,
  acl.is_grantable
from pg_catalog.pg_class c
cross join lateral aclexplode(
  coalesce(c.relacl, acldefault('r', c.relowner))
) as acl
where c.oid = to_regclass('public.internal_purchase_costs')
order by grantee, acl.privilege_type;

-- Effective permissions of API roles include grants inherited through
-- membership and PUBLIC grants. This does not identify which ACL entry
-- supplied each effective permission; compare with the direct ACL query above.
select
  r.rolname as checked_role,
  r.rolsuper,
  r.rolbypassrls,
  r.rolinherit,
  has_table_privilege(r.oid, c.oid, 'select') as effective_select,
  has_table_privilege(r.oid, c.oid, 'insert') as effective_insert,
  has_table_privilege(r.oid, c.oid, 'update') as effective_update,
  has_table_privilege(r.oid, c.oid, 'delete') as effective_delete
from pg_catalog.pg_roles r
cross join pg_catalog.pg_class c
where r.rolname in ('anon', 'authenticated')
  and c.oid = to_regclass('public.internal_purchase_costs')
order by r.rolname;

-- Direct role membership rows, before recursively listing reachable roles.
select
  member_role.rolname as member_role,
  granted_role.rolname as granted_role,
  grantor_role.rolname as grantor_role,
  membership.admin_option
from pg_catalog.pg_auth_members membership
join pg_catalog.pg_roles member_role on member_role.oid = membership.member
join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
join pg_catalog.pg_roles grantor_role on grantor_role.oid = membership.grantor
where member_role.rolname in ('anon', 'authenticated')
   or granted_role.rolname in ('anon', 'authenticated')
order by member_role.rolname, granted_role.rolname;

-- Role membership paths from anon/authenticated to granted roles. USAGE
-- reports whether PostgreSQL considers the membership usable for privileges;
-- inspect role INHERIT attributes and grants separately.
with recursive role_paths(principal_oid, effective_role_oid, depth, role_path) as (
  select r.oid, r.oid, 0, array[r.oid]::oid[]
  from pg_catalog.pg_roles r
  where r.rolname in ('anon', 'authenticated')
  union all
  select paths.principal_oid, memberships.roleid, paths.depth + 1,
         paths.role_path || memberships.roleid
  from role_paths paths
  join pg_catalog.pg_auth_members memberships
    on memberships.member = paths.effective_role_oid
  where not memberships.roleid = any(paths.role_path)
)
select
  pg_catalog.pg_get_userbyid(paths.principal_oid) as principal_role,
  pg_catalog.pg_get_userbyid(paths.effective_role_oid) as reachable_role,
  paths.depth,
  pg_has_role(paths.principal_oid, paths.effective_role_oid, 'USAGE') as membership_usable_for_privileges,
  reachable.rolsuper,
  reachable.rolbypassrls,
  paths.role_path
from role_paths paths
join pg_catalog.pg_roles reachable on reachable.oid = paths.effective_role_oid
order by principal_role, paths.depth, reachable_role;

-- Function-owner, SECURITY DEFINER, search_path and effective EXECUTE checks.
select
  p.oid is not null as function_exists,
  pg_catalog.pg_get_userbyid(p.proowner) as function_owner,
  owner_role.rolsuper as owner_is_superuser,
  owner_role.rolbypassrls as owner_bypasses_rls,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  coalesce(p.proconfig, array[]::text[]) @> array['search_path=""']::text[] as has_empty_search_path_setting,
  case when p.oid is not null then pg_catalog.pg_get_functiondef(p.oid) end
    as function_definition_for_manual_review
from (values (to_regprocedure('public.is_admin()'))) as target(function_oid)
left join pg_catalog.pg_proc p on p.oid = target.function_oid
left join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner;

select
  acl.grantee as grantee_oid,
  case when acl.grantee = 0::oid then 'PUBLIC'
    else pg_catalog.pg_get_userbyid(acl.grantee) end as grantee,
  pg_catalog.pg_get_userbyid(acl.grantor) as grantor,
  acl.privilege_type,
  acl.is_grantable
from pg_catalog.pg_proc p
cross join lateral aclexplode(
  coalesce(p.proacl, acldefault('f', p.proowner))
) as acl
where p.oid = to_regprocedure('public.is_admin()')
order by grantee, acl.privilege_type;

select
  r.rolname as checked_role,
  r.rolsuper,
  r.rolbypassrls,
  has_function_privilege(r.oid, p.oid, 'execute') as effective_execute
from pg_catalog.pg_roles r
cross join pg_catalog.pg_proc p
where r.rolname in ('anon', 'authenticated')
  and p.oid = to_regprocedure('public.is_admin()')
order by r.rolname;

-- Full policy inventory. The expression flags below only identify literal
-- normalized text; they do not prove policy semantics. Permissive policies
-- combine with OR, restrictive policies with AND, so inspect all rows,
-- roles, grants, memberships, owners and function behavior manually.
select
  p.polname,
  p.polroles,
  array(
    select case when role_info.role_oid = 0::oid then 'PUBLIC'
      else pg_catalog.pg_get_userbyid(role_info.role_oid) end
    from unnest(p.polroles) as role_info(role_oid)
  ) as policy_role_names,
  p.polcmd,
  p.polpermissive,
  pg_catalog.pg_get_expr(p.polqual, p.polrelid) as using_expression,
  pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) as with_check_expression,
  regexp_replace(
    regexp_replace(
      coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), ''),
      '[[:space:]]', '', 'g'
    ),
    '[()]', '', 'g'
  ) in ('is_admin', 'public.is_admin') as using_literal_text_match_only,
  regexp_replace(
    regexp_replace(
      coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''),
      '[[:space:]]', '', 'g'
    ),
    '[()]', '', 'g'
  ) in ('is_admin', 'public.is_admin') as check_literal_text_match_only
from pg_catalog.pg_policy p
where p.polrelid = to_regclass('public.internal_purchase_costs')
order by p.polname;

-- This inventory is not a SAFE/UNSAFE verdict. It highlights permissive
-- policies applying to PUBLIC/anon/authenticated for manual access analysis.
with recursive role_paths(principal_oid, effective_role_oid, role_path) as (
  select r.oid, r.oid, array[r.oid]::oid[]
  from pg_catalog.pg_roles r
  where r.rolname in ('anon', 'authenticated')
  union all
  select paths.principal_oid, memberships.roleid,
         paths.role_path || memberships.roleid
  from role_paths paths
  join pg_catalog.pg_auth_members memberships
    on memberships.member = paths.effective_role_oid
  where not memberships.roleid = any(paths.role_path)
)
select
  count(distinct p.oid) as permissive_policy_count_applicable_to_public_or_api_roles
from pg_catalog.pg_policy p
cross join lateral unnest(p.polroles) as role_info(role_oid)
left join pg_catalog.pg_roles r on r.oid = role_info.role_oid
left join role_paths paths on paths.effective_role_oid = role_info.role_oid
where p.polrelid = to_regclass('public.internal_purchase_costs')
  and p.polpermissive
  and (
    role_info.role_oid = 0::oid
    or (
      paths.principal_oid is not null
      and pg_has_role(paths.principal_oid, role_info.role_oid, 'USAGE')
    )
  );

-- 6. Limited direct-dependency check only. This confirms that an ordinary
-- VIEW named catalog_public does not directly reference internal_purchase_costs
-- and does not expose columns with the listed internal-cost names. It does
-- NOT rule out indirect disclosure through other views, functions, RPCs, or
-- dependent objects, and is not a complete leak/security audit.
select
  case when c.oid is null then 'MISSING VIEW'
    when c.relkind = 'v' then 'VIEW'
    else 'WRONG OBJECT KIND'
  end as object_status,
  c.relkind = 'v' as is_view,
  case
    when c.oid is null or c.relkind <> 'v' then false
    else position(
      'internal_purchase_costs'
      in lower(pg_catalog.pg_get_viewdef(c.oid, true))
    ) = 0
  end as definition_does_not_reference_cost_table,
  case
    when c.oid is null or c.relkind <> 'v' then false
    else not exists (
      select 1
      from information_schema.columns col
      where col.table_schema = 'public'
        and col.table_name = 'catalog_public'
        and col.column_name in (
          'purchase_cost', 'purchase_currency', 'purchase_cost_status',
          'cost_updated_at', 'internal_notes'
        )
    )
  end as has_no_internal_cost_columns,
  case when c.relkind = 'v'
    then pg_catalog.pg_get_viewdef(c.oid, true)
  end as view_definition
from (values (to_regclass('public.catalog_public'))) as target(view_oid)
left join pg_catalog.pg_class c on c.oid = target.view_oid;

-- 7. COD product/cost data check.
-- Step A: run this prerequisites query. Step B: run the COD data query below
-- only if EVERY row is OK, sections 1-4 match expected objects/schema/keys/
-- checks, section 5 was manually reviewed and confirms RLS, grants, and
-- policies are appropriately restrictive with no possible non-admin
-- permissive access, and section 6's limited direct-dependency checks pass.
-- Otherwise stop; do not run the COD data query.
select
  required.object_name,
  required.column_name,
  required.expected_type,
  pg_catalog.format_type(column_info.atttypid, column_info.atttypmod) as actual_type,
  case
    when relation.oid is null then 'MISSING RELATION'
    when required.object_name = 'public.products' and relation.relkind <> 'r' then 'WRONG RELATION KIND'
    when required.object_name = 'public.catalog_public' and relation.relkind <> 'v' then 'WRONG RELATION KIND'
    when required.object_name = 'public.internal_purchase_costs' and relation.relkind <> 'r' then 'WRONG RELATION KIND'
    when column_info.attnum is null then 'MISSING COLUMN'
    when pg_catalog.format_type(column_info.atttypid, column_info.atttypmod)
      is distinct from required.expected_type then 'WRONG COLUMN TYPE'
    else 'OK'
  end as result
from (values
  ('public.products', 'product_id', 'text'),
  ('public.products', 'region', 'text'),
  ('public.products', 'slug', 'text'),
  ('public.products', 'unit_price', 'numeric(12,2)'),
  ('public.products', 'availability', 'text'),
  ('public.products', 'publication_status', 'text'),
  ('public.catalog_public', 'product_id', 'text'),
  ('public.catalog_public', 'region', 'text'),
  ('public.internal_purchase_costs', 'product_id', 'text'),
  ('public.internal_purchase_costs', 'region', 'text'),
  ('public.internal_purchase_costs', 'purchase_cost', 'numeric(12,2)'),
  ('public.internal_purchase_costs', 'purchase_currency', 'text'),
  ('public.internal_purchase_costs', 'purchase_cost_status', 'text')
) as required(object_name, column_name, expected_type)
left join pg_catalog.pg_class relation
  on relation.oid = to_regclass(required.object_name)
left join pg_catalog.pg_attribute column_info
  on column_info.attrelid = relation.oid
 and column_info.attname = required.column_name
 and column_info.attnum > 0
 and not column_info.attisdropped
order by required.object_name, required.column_name;

-- This comparison uses 'RUB', matching the actual migration seed values and
-- the purchase_currency CHECK constraint. No actual cost values are printed.
with expected(product_id, slug, region, sale_price, purchase_cost) as (
  values
    ('call-of-duty-modern-warfare-4-ps5-standard',
      'call-of-duty-modern-warfare-4-ps5-standard', 'Южная Корея', 8400::numeric, 7015::numeric),
    ('call-of-duty-modern-warfare-4-ps5-vault',
      'call-of-duty-modern-warfare-4-ps5-vault', 'США', 8990::numeric, 7550::numeric)
)
select
  e.product_id,
  p.product_id is not null as product_exists,
  p.slug = e.slug as slug_matches,
  p.region = e.region as region_matches,
  p.unit_price = e.sale_price as sale_price_matches,
  p.availability = 'in_stock' and p.publication_status = 'published' as published_and_available,
  c.product_id is not null as present_in_catalog_public,
  cost.product_id is not null as cost_record_exists,
  cost.purchase_cost = e.purchase_cost
    and cost.purchase_currency = 'RUB'
    and cost.purchase_cost_status = 'confirmed' as purchase_cost_matches,
  case
    when p.product_id is null then 'MISSING PRODUCT'
    when p.slug is distinct from e.slug
      or p.region is distinct from e.region
      or p.unit_price is distinct from e.sale_price
      or p.availability is distinct from 'in_stock'
      or p.publication_status is distinct from 'published'
      or c.product_id is null then 'PRODUCT MISMATCH'
    when cost.product_id is null then 'MISSING COST'
    when cost.purchase_cost is distinct from e.purchase_cost
      or cost.purchase_currency is distinct from 'RUB'
      or cost.purchase_cost_status is distinct from 'confirmed' then 'COST MISMATCH'
    else 'OK'
  end as result
from expected e
left join public.products p
  on p.product_id = e.product_id and p.region = e.region
left join public.catalog_public c
  on c.product_id = e.product_id and c.region = e.region
left join public.internal_purchase_costs cost
  on cost.product_id = e.product_id and cost.region = e.region
order by e.product_id;
