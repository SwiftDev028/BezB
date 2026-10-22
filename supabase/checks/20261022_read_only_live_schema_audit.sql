-- BezB live-schema preflight for addressless digital checkout.
-- Run manually in the Supabase SQL Editor before applying
-- 202610220002_digital_checkout_no_delivery_address.sql.
--
-- SAFETY: this file contains SELECT statements only. It does not call checkout
-- or admin RPCs, change schema/data/settings, or create temporary objects.
-- Review the result sets; do not apply the migration if expected objects,
-- column types, ACLs, policies, constraints, or trigger behavior are unclear.

-- 1. Relevant relations and column definitions, including nullability/defaults.
select
  c.table_name,
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
where c.table_schema = 'public'
  and c.table_name in (
    'orders', 'order_items', 'admin_users', 'products',
    'order_idempotency', 'order_audit_events', 'digital_codes', 'order_deliveries'
  )
order by c.table_name, c.ordinal_position;

-- 2. Relation existence and row-level-security flags.
select
  n.nspname as schema_name,
  c.relname as relation_name,
  c.relkind,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  pg_get_userbyid(c.relowner) as owner
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'orders', 'order_items', 'admin_users', 'products',
    'order_idempotency', 'order_audit_events', 'digital_codes', 'order_deliveries'
  )
order by c.relname;

-- 3. Constraints on order-related tables. Pay particular attention to any
-- CHECK/NOT NULL/foreign-key rule involving delivery_address or order status.
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
  and r.relname in ('orders', 'order_items', 'order_idempotency', 'order_audit_events')
order by r.relname, con.conname;

-- 4. User-defined triggers on orders. Inspect trigger functions for any rule
-- that still requires or rewrites delivery_address.
select
  t.tgname as trigger_name,
  pg_catalog.pg_get_triggerdef(t.oid, true) as trigger_definition,
  p.oid::regprocedure as trigger_function,
  p.prosecdef as trigger_function_security_definer,
  p.proconfig as trigger_function_settings,
  pg_catalog.pg_get_functiondef(p.oid) as trigger_function_definition
from pg_catalog.pg_trigger t
join pg_catalog.pg_class r on r.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = r.relnamespace
join pg_catalog.pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public'
  and r.relname = 'orders'
  and not t.tgisinternal
order by t.tgname;

-- 5. RLS policies for order, catalog, and fulfillment relations.
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
    'orders', 'order_items', 'products', 'digital_codes',
    'order_deliveries', 'order_audit_events', 'admin_users', 'order_idempotency'
  )
order by tablename, policyname;

-- 6. Required RPC signatures, SECURITY DEFINER setting, owner, and function
-- configuration (including search_path). A missing signature has a NULL oid.
with targets(signature) as (
  values
    ('public.place_public_order(text,text,text,text,text,boolean,jsonb)'),
    ('public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)'),
    ('public.is_admin()'),
    ('public.admin_confirm_payment(uuid)'),
    ('public.admin_assign_code(uuid,uuid,uuid)'),
    ('public.admin_deliver_order(uuid)'),
    ('public.log_order_action(uuid,text,jsonb)')
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
  p.proacl::text as acl
from resolved r
left join pg_catalog.pg_proc p on p.oid = r.function_oid
order by r.signature;

-- 7. Direct EXECUTE ACL entries for the order RPCs and payment/delivery admin
-- RPCs. PUBLIC appears as grantee_name = 'PUBLIC'.
with targets(signature) as (
  values
    ('public.place_public_order(text,text,text,text,text,boolean,jsonb)'),
    ('public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)'),
    ('public.admin_confirm_payment(uuid)'),
    ('public.admin_assign_code(uuid,uuid,uuid)'),
    ('public.admin_deliver_order(uuid)')
), resolved as (
  select signature, pg_catalog.to_regprocedure(signature) as function_oid
  from targets
)
select
  r.signature,
  case when a.grantee = 0 then 'PUBLIC' else grantee.rolname end as grantee_name,
  a.privilege_type,
  a.is_grantable
from resolved r
join pg_catalog.pg_proc p on p.oid = r.function_oid
cross join lateral pg_catalog.aclexplode(
  coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
) a
left join pg_catalog.pg_roles grantee on grantee.oid = a.grantee
where a.privilege_type = 'EXECUTE'
order by r.signature, grantee_name;

-- 8. Effective EXECUTE for API roles (includes inherited grants). Expected:
-- place_public_order: anon=true, authenticated=true;
-- place_buyer_order: anon=false, authenticated=true.
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

-- 9. Current definitions of the two checkout RPCs and critical admin helpers.
-- Compare these with the reviewed migration bodies; this only reads catalog
-- metadata and does not execute the functions.
with targets(signature) as (
  values
    ('public.place_public_order(text,text,text,text,text,boolean,jsonb)'),
    ('public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)'),
    ('public.is_admin()'),
    ('public.admin_confirm_payment(uuid)'),
    ('public.admin_assign_code(uuid,uuid,uuid)'),
    ('public.admin_deliver_order(uuid)'),
    ('public.log_order_action(uuid,text,jsonb)')
)
select
  signature,
  pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(signature)) as function_definition
from targets
where pg_catalog.to_regprocedure(signature) is not null
order by signature;

-- 10. Inventory every SECURITY DEFINER function in public, not only the
-- checkout RPCs above. Review these definitions and their ACLs for unexpected
-- privileged behavior or missing administrator checks.
select
  p.oid::regprocedure as function_signature,
  pg_catalog.pg_get_userbyid(p.proowner) as owner,
  p.proconfig as function_settings,
  p.proacl::text as acl,
  pg_catalog.pg_get_functiondef(p.oid) as function_definition
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.oid::regprocedure::text;
