-- Read-only preflight for
-- supabase/migrations/202610220003_xbox_game_pass_catalog_and_cost_status.sql.
-- Run in Supabase SQL Editor before applying that migration.
--
-- SAFETY: every statement below is a catalog SELECT. It does not read buyer
-- rows or secrets, call application RPCs, create objects, or modify data.
-- Review the results against the expected local schema/migration before use.

-- 1. Presence and definitions of relations and columns required by migration
-- 003. internal_purchase_costs is expected to be absent before first apply.
select
  c.table_name,
  c.column_name,
  c.data_type,
  c.udt_schema,
  c.udt_name,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in (
    'products', 'order_items', 'supplier_products', 'internal_purchase_costs',
    'orders', 'admin_users'
  )
order by c.table_name, c.ordinal_position;

-- 2. Relation kinds, owners, and RLS state. The new internal cost table is
-- expected not to exist before migration 003; after application it must have
-- RLS enabled.
select
  n.nspname as schema_name,
  c.relname as relation_name,
  c.relkind,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  pg_catalog.pg_get_userbyid(c.relowner) as owner
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'products', 'order_items', 'supplier_products', 'internal_purchase_costs',
    'orders', 'digital_codes', 'order_deliveries', 'admin_users', 'catalog_public'
  )
order by c.relname;

-- 3. Relevant constraints: variant keys/FKs, existing supplier requirements,
-- subscription term checks, and internal cost constraints after application.
select
  r.relname as relation_name,
  con.conname as constraint_name,
  con.contype as constraint_type,
  con.convalidated as validated,
  pg_catalog.pg_get_constraintdef(con.oid, true) as definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class r on r.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = r.relnamespace
where n.nspname = 'public'
  and r.relname in (
    'products', 'order_items', 'supplier_products', 'internal_purchase_costs'
  )
order by r.relname, con.conname;

-- 4. Indexes and unique keys that affect variant identity and internal-cost
-- upserts. Check products(product_id, region) and the new cost-table PK.
select
  t.relname as relation_name,
  i.relname as index_name,
  x.indisprimary as is_primary,
  x.indisunique as is_unique,
  x.indisvalid as is_valid,
  pg_catalog.pg_get_indexdef(i.oid) as definition
from pg_catalog.pg_index x
join pg_catalog.pg_class i on i.oid = x.indexrelid
join pg_catalog.pg_class t on t.oid = x.indrelid
join pg_catalog.pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname in ('products', 'order_items', 'supplier_products', 'internal_purchase_costs')
order by t.relname, i.relname;

-- 5. Current public catalog view definition and exposed column list. Confirm
-- it exposes neither internal_purchase_costs nor supplier cost columns.
select
  c.oid::regclass as view_name,
  pg_catalog.pg_get_viewdef(c.oid, true) as view_definition,
  c.relacl::text as view_acl
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'catalog_public' and c.relkind = 'v';

select
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name
from information_schema.columns c
where c.table_schema = 'public' and c.table_name = 'catalog_public'
order by c.ordinal_position;

-- 6. Policies for catalog, checkout, fulfillment, supplier and internal-cost
-- tables. No row contents are selected.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in (
    'products', 'orders', 'order_items', 'digital_codes', 'order_deliveries',
    'supplier_products', 'internal_purchase_costs'
  )
order by tablename, policyname;

-- 7. Table ACLs for internal cost storage and the public catalog view. Review
-- together with RLS/policies above; ACLs alone do not show row-level access.
select
  c.oid::regclass as object_name,
  case when a.grantee = 0 then 'PUBLIC' else r.rolname end as grantee_name,
  a.privilege_type,
  a.is_grantable
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
cross join lateral pg_catalog.aclexplode(
  coalesce(c.relacl, pg_catalog.acldefault('r'::"char", c.relowner))
) a
left join pg_catalog.pg_roles r on r.oid = a.grantee
where n.nspname = 'public'
  and c.relname in ('catalog_public', 'internal_purchase_costs')
order by c.relname, grantee_name, a.privilege_type;

-- 8. Checkout RPC signatures, SECURITY DEFINER settings, owner, and direct
-- ACLs. Missing signatures return exists=false rather than invoking anything.
with targets(signature) as (
  values
    ('public.place_public_order(text,text,text,text,text,boolean,jsonb)'),
    ('public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)')
), resolved as (
  select signature, pg_catalog.to_regprocedure(signature) as function_oid
  from targets
)
select
  r.signature,
  r.function_oid is not null as exists,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  pg_catalog.pg_get_userbyid(p.proowner) as owner,
  p.proacl::text as direct_acl,
  case when r.function_oid is null then null
       else pg_catalog.pg_get_functiondef(r.function_oid) end as function_definition
from resolved r
left join pg_catalog.pg_proc p on p.oid = r.function_oid
order by r.signature;

-- 9. Direct EXECUTE ACL entries and effective EXECUTE for anon/authenticated.
-- Expected: public_order anon/authenticated; buyer_order authenticated only.
with targets(signature) as (
  values
    ('public.place_public_order(text,text,text,text,text,boolean,jsonb)'),
    ('public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)')
), resolved as (
  select signature, pg_catalog.to_regprocedure(signature) as function_oid
  from targets
)
select
  r.signature,
  case when a.grantee = 0 then 'PUBLIC' else role_row.rolname end as grantee_name,
  a.privilege_type,
  a.is_grantable
from resolved r
join pg_catalog.pg_proc p on p.oid = r.function_oid
cross join lateral pg_catalog.aclexplode(
  coalesce(p.proacl, pg_catalog.acldefault('f'::"char", p.proowner))
) a
left join pg_catalog.pg_roles role_row on role_row.oid = a.grantee
where a.privilege_type = 'EXECUTE'
order by r.signature, grantee_name;

with targets(signature) as (
  values
    ('public.place_public_order(text,text,text,text,text,boolean,jsonb)'),
    ('public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)')
), resolved as (
  select signature, pg_catalog.to_regprocedure(signature) as function_oid
  from targets
), api_roles(role_name) as (values ('anon'), ('authenticated'))
select
  r.signature,
  a.role_name,
  case
    when r.function_oid is null or pg_catalog.to_regrole(a.role_name) is null then null
    else pg_catalog.has_function_privilege(
      pg_catalog.to_regrole(a.role_name), r.function_oid, 'EXECUTE'
    )
  end as effective_execute
from resolved r
cross join api_roles a
order by r.signature, a.role_name;

-- 10. The migration replaces catalog_public and both checkout RPC bodies.
-- Inspect exact live definitions before applying it; these are catalog reads.
select
  p.oid::regprocedure as function_signature,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  pg_catalog.pg_get_userbyid(p.proowner) as owner,
  p.proacl::text as acl,
  pg_catalog.pg_get_functiondef(p.oid) as function_definition
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('place_public_order', 'place_buyer_order')
order by p.oid::regprocedure::text;

-- 11. SECURITY DEFINER inventory narrowed to the two checkout functions plus
-- the admin predicate used by internal_purchase_costs RLS.
select
  p.oid::regprocedure as function_signature,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  pg_catalog.pg_get_userbyid(p.proowner) as owner,
  p.proacl::text as acl,
  pg_catalog.pg_get_functiondef(p.oid) as function_definition
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and p.proname in ('place_public_order', 'place_buyer_order', 'is_admin')
order by p.oid::regprocedure::text;
