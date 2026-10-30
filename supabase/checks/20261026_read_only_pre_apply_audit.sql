-- Read-only pre-apply audit for the BezB migration sequence and
-- 202610260001_optional_checkout_phone_and_guest_claim.sql.
--
-- Run each SELECT section in the intended Supabase project before any change.
-- This file does not invoke application RPCs, read customer/order rows, or
-- change schema, data, grants, policies, settings, or migration history.
-- Do not apply migrations based on this report alone; compare every result
-- with the local migration sources and stop on any unexplained difference.

-- 1. Discover the migration-history relation and its actual columns.
select
  table_schema,
  table_name,
  column_name,
  data_type,
  udt_name
from information_schema.columns
where (table_schema, table_name) in (
  ('supabase_migrations', 'schema_migrations'),
  ('supabase', 'migrations')
)
order by table_schema, table_name, ordinal_position;

-- 1a. Optional: run only if section 1 confirms that
-- supabase_migrations.schema_migrations has a "version" column.
-- Use the displayed version list to apply only genuinely pending migrations.
select version, name
from supabase_migrations.schema_migrations
where version in (
  '202610210001',
  '202610210002',
  '202610210003',
  '202610210004',
  '202610220001',
  '202610220002',
  '202610220003',
  '202610220004',
  '202610220005',
  '202610230001',
  '202610240001',
  '202610250001',
  '202610260001'
)
order by version;

-- If the migration tracker is absent or uses another structure, do not assume
-- these migrations are pending. Resolve the authoritative migration history
-- with the project owner before proceeding.

-- 2. Relevant columns, including phone nullability/default, order ownership,
-- checkout snapshots, and catalog fields used by the RPCs.
select
  c.table_schema,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_schema,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.character_maximum_length,
  c.numeric_precision,
  c.numeric_scale
from information_schema.columns c
where (c.table_schema, c.table_name) in (
  ('public', 'orders'),
  ('public', 'order_items'),
  ('public', 'products'),
  ('public', 'order_idempotency'),
  ('public', 'admin_users'),
  ('auth', 'users')
)
order by c.table_schema, c.table_name, c.ordinal_position;

-- 3. Constraints on relevant tables. Review every orders constraint, not only
-- CHECK constraints mentioning customer_phone.
select
  n.nspname as schema_name,
  r.relname as table_name,
  con.conname as constraint_name,
  con.contype as constraint_type,
  con.convalidated as validated,
  pg_catalog.pg_get_constraintdef(con.oid, true) as definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class r on r.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = r.relnamespace
where n.nspname = 'public'
  and r.relname in ('orders', 'order_items', 'products', 'order_idempotency')
order by r.relname, con.conname;

-- 4. Index definitions on orders. This includes expression and partial
-- indexes whose definition may reference customer_phone.
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename = 'orders'
order by indexname;

-- 5. User-defined triggers on orders and their function definitions.
select
  t.tgname as trigger_name,
  pg_catalog.pg_get_triggerdef(t.oid, true) as trigger_definition,
  p.oid::regprocedure as trigger_function,
  p.prosecdef as trigger_function_security_definer,
  p.proconfig as trigger_function_settings,
  pg_catalog.pg_get_userbyid(p.proowner) as trigger_function_owner,
  pg_catalog.pg_get_functiondef(p.oid) as trigger_function_definition
from pg_catalog.pg_trigger t
join pg_catalog.pg_class r on r.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = r.relnamespace
join pg_catalog.pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public'
  and r.relname = 'orders'
  and not t.tgisinternal
order by t.tgname;

-- 6. RPC existence, exact signatures, definitions, owners, SECURITY DEFINER,
-- search_path, and raw ACLs. claim_guest_orders may not exist until its
-- migration has actually been applied; absence before that is expected.
with targets(signature, expected_before_claim_migration) as (
  values
    ('public.place_public_order(text,text,text,text,text,boolean,jsonb)', true),
    ('public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)', true),
    ('public.claim_guest_orders()', false),
    ('public.is_admin()', true),
    ('public.my_delivered_codes()', true),
    ('public.admin_assign_code(uuid,uuid,uuid)', true),
    ('public.admin_deliver_order(uuid)', true),
    ('public.log_order_action(uuid,text,jsonb)', true)
), resolved as (
  select
    signature,
    expected_before_claim_migration,
    pg_catalog.to_regprocedure(signature) as function_oid
  from targets
)
select
  r.signature,
  r.expected_before_claim_migration,
  r.function_oid is not null as exists,
  l.lanname as language,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  pg_catalog.pg_get_userbyid(p.proowner) as owner,
  owner_role.rolsuper as owner_is_superuser,
  owner_role.rolbypassrls as owner_bypasses_rls,
  p.proacl::text as acl,
  case when p.oid is not null then pg_catalog.pg_get_functiondef(p.oid) end as definition
from resolved r
left join pg_catalog.pg_proc p on p.oid = r.function_oid
left join pg_catalog.pg_language l on l.oid = p.prolang
left join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
order by r.signature;

-- 7. Direct EXECUTE ACL entries and effective execute rights for API roles.
-- Expected checkout grants: public_order anon/authenticated; buyer_order
-- authenticated only. claim_guest_orders, when present, authenticated only.
with targets(signature) as (
  values
    ('public.place_public_order(text,text,text,text,text,boolean,jsonb)'),
    ('public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)'),
    ('public.claim_guest_orders()'),
    ('public.admin_assign_code(uuid,uuid,uuid)'),
    ('public.admin_deliver_order(uuid)')
), resolved as (
  select signature, pg_catalog.to_regprocedure(signature) as function_oid
  from targets
), api_roles(role_name) as (
  values ('anon'), ('authenticated')
)
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

with targets(signature) as (
  values
    ('public.place_public_order(text,text,text,text,text,boolean,jsonb)'),
    ('public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)'),
    ('public.claim_guest_orders()'),
    ('public.admin_assign_code(uuid,uuid,uuid)'),
    ('public.admin_deliver_order(uuid)')
), resolved as (
  select signature, pg_catalog.to_regprocedure(signature) as function_oid
  from targets
)
select
  r.signature,
  case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end as grantee,
  acl.privilege_type,
  acl.is_grantable
from resolved r
join pg_catalog.pg_proc p on p.oid = r.function_oid
cross join lateral pg_catalog.aclexplode(
  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
) acl
left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
where acl.privilege_type = 'EXECUTE'
order by r.signature, grantee;

-- 8. Table RLS state, policies, and direct grants for order/catalog relations.
select
  n.nspname as schema_name,
  c.relname as relation_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  pg_catalog.pg_get_userbyid(c.relowner) as owner
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'auth')
  and c.relname in (
    'orders', 'order_items', 'products', 'catalog_public',
    'order_idempotency', 'digital_codes', 'order_deliveries',
    'admin_users', 'users'
  )
order by n.nspname, c.relname;

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
where (schemaname = 'public' and tablename in (
         'orders', 'order_items', 'products', 'catalog_public',
         'order_idempotency', 'digital_codes', 'order_deliveries', 'admin_users'
       ))
   or (schemaname = 'auth' and tablename = 'users')
order by schemaname, tablename, policyname;

select
  table_schema,
  table_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where (table_schema = 'public' and table_name in (
         'orders', 'order_items', 'products', 'catalog_public',
         'order_idempotency', 'digital_codes', 'order_deliveries', 'admin_users'
       ))
   or (table_schema = 'auth' and table_name = 'users')
order by table_schema, table_name, grantee, privilege_type;

-- 9. Can the owner of claim_guest_orders perform only the table operations it
-- needs? This returns NULL when the function is not yet installed.
with claim_function as (
  select p.proowner
  from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure('public.claim_guest_orders()')
)
select
  pg_catalog.pg_get_userbyid(f.proowner) as function_owner,
  pg_catalog.has_table_privilege(f.proowner, 'public.orders', 'SELECT') as can_select_orders,
  pg_catalog.has_table_privilege(f.proowner, 'public.orders', 'UPDATE') as can_update_orders,
  pg_catalog.has_column_privilege(f.proowner, 'public.orders', 'customer_user_id', 'UPDATE') as can_update_owner,
  pg_catalog.has_column_privilege(f.proowner, 'public.orders', 'version', 'UPDATE') as can_update_version,
  pg_catalog.has_column_privilege(f.proowner, 'public.orders', 'updated_at', 'UPDATE') as can_update_timestamp,
  pg_catalog.has_table_privilege(f.proowner, 'auth.users', 'SELECT') as can_select_auth_users_table,
  pg_catalog.has_column_privilege(f.proowner, 'auth.users', 'email', 'SELECT') as can_read_auth_email,
  pg_catalog.has_column_privilege(f.proowner, 'auth.users', 'email_confirmed_at', 'SELECT') as can_read_email_confirmation,
  pg_catalog.has_schema_privilege(f.proowner, 'auth', 'USAGE') as can_use_auth_schema,
  pg_catalog.has_function_privilege(f.proowner, 'auth.uid()', 'EXECUTE') as can_execute_auth_uid
from claim_function f;

-- 10. Checkout and order-item foreign-key relationships. An empty result is
-- not necessarily an error, but any missing relation/key required by the
-- local RPC sources must be resolved before applying migrations.
select
  n.nspname as schema_name,
  r.relname as table_name,
  con.conname as foreign_key_name,
  pg_catalog.pg_get_constraintdef(con.oid, true) as definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class r on r.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = r.relnamespace
where n.nspname = 'public'
  and r.relname in ('orders', 'order_items', 'order_idempotency', 'digital_codes', 'order_deliveries')
  and con.contype = 'f'
order by r.relname, con.conname;

-- 11. Catalog view definition and dependencies. This verifies the public view
-- exists and shows its underlying relations without reading catalog rows.
select
  c.oid::regclass as view_name,
  pg_catalog.pg_get_viewdef(c.oid, true) as view_definition
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'catalog_public'
  and c.relkind = 'v';

select distinct
  dependent_ns.nspname as dependent_schema,
  dependent.relname as dependent_object,
  dependent.relkind as dependent_kind,
  source_ns.nspname as referenced_schema,
  source.relname as referenced_object,
  source.relkind as referenced_kind
from pg_catalog.pg_depend d
join pg_catalog.pg_rewrite rw on rw.oid = d.objid
join pg_catalog.pg_class dependent on dependent.oid = rw.ev_class
join pg_catalog.pg_namespace dependent_ns on dependent_ns.oid = dependent.relnamespace
join pg_catalog.pg_class source on source.oid = d.refobjid
join pg_catalog.pg_namespace source_ns on source_ns.oid = source.relnamespace
where dependent_ns.nspname = 'public'
  and dependent.relname = 'catalog_public'
  and d.classid = 'pg_catalog.pg_rewrite'::regclass
  and d.refclassid = 'pg_catalog.pg_class'::regclass
  and source_ns.nspname in ('public', 'auth')
order by referenced_schema, referenced_object;

-- 12. Read-only pre-apply gates:
-- - Stop if the migration tracker is absent/ambiguous or any expected version
--   has an unexplained status.
-- - Stop if either checkout RPC is missing or differs in a way not accounted
--   for by the optional-phone migration's exact source pattern.
-- - Stop if checkout consent, server-side price/availability, or buyer
--   idempotency checks are absent.
-- - Stop if orders.customer_phone has a constraint, index, or trigger behavior
--   that rejects or rewrites ''.
-- - Stop if buyer order RLS is broader than owner/admin or RPC grants exceed
--   the intended anon/authenticated roles.
-- - Stop if products/catalog view, order_idempotency, required columns, or
--   claim function owner privileges do not match the migration dependencies.
-- - Do not run migration files from this read-only check script.
-- On any SQL error or unexpected result, stop and preserve the error/results.
-- If a later migration fails during a separate apply operation, do not retry
-- blindly: confirm transaction outcome, migration history, RPC definitions,
-- grants, and policies before deciding on recovery.
