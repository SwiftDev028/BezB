-- Read-only live-schema preflight for the Xbox migration chain 003–005.
-- Run this file only in the Supabase SQL Editor before considering those migrations.
-- Every executable statement is a SELECT over schema/catalog metadata or the
-- specific Xbox product/cost rows relevant to the migration. This file does
-- not change data or schema and does not invoke application RPCs.
--
-- Save/export every result set, especially columns, constraints, indexes,
-- view definition/columns, owners/grants, RLS policies, RPC definitions, and
-- the Xbox conflict checks. Send those results for review before migration.

-- 1. Relation existence, relation kind, owner and RLS flags for all objects
-- migration 004 depends on. Missing rows mean the relation is absent.
select n.nspname as schema_name,
       c.relname as relation_name,
       c.relkind,
       pg_catalog.pg_get_userbyid(c.relowner) as owner_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('products','order_items','internal_purchase_costs',
                    'catalog_public','supplier_products','suppliers')
order by c.relname;

-- 2. Actual columns, exact PostgreSQL types, nullability, defaults, identity
-- and generated status. internal_purchase_costs can be absent before apply.
select c.table_name, c.ordinal_position, c.column_name,
       c.data_type, c.udt_schema, c.udt_name, c.character_maximum_length,
       c.numeric_precision, c.numeric_scale, c.is_nullable, c.column_default,
       c.is_identity, c.identity_generation, c.is_generated, c.generation_expression
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in ('products','order_items','internal_purchase_costs',
                       'supplier_products','suppliers')
order by c.table_name, c.ordinal_position;

-- 3. Primary, unique, foreign-key, check, exclusion and not-null constraint
-- definitions and validation state, including all existing order constraints.
select n.nspname as schema_name, r.relname as relation_name,
       con.conname as constraint_name, con.contype as constraint_type,
       con.convalidated as validated, con.condeferrable as deferrable,
       con.condeferred as initially_deferred,
       pg_catalog.pg_get_constraintdef(con.oid, true) as definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class r on r.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = r.relnamespace
where n.nspname = 'public'
  and r.relname in ('products','order_items','internal_purchase_costs',
                    'supplier_products','suppliers')
order by r.relname, con.contype, con.conname;

-- 4. Index definitions and validity/uniqueness. Review products variant and
-- slug uniqueness, plus the internal cost table key if that table exists.
select t.relname as table_name, i.relname as index_name,
       x.indisprimary as is_primary, x.indisunique as is_unique,
       x.indisvalid as is_valid, x.indisready as is_ready,
       pg_catalog.pg_get_indexdef(i.oid) as definition
from pg_catalog.pg_index x
join pg_catalog.pg_class i on i.oid = x.indexrelid
join pg_catalog.pg_class t on t.oid = x.indrelid
join pg_catalog.pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname in ('products','order_items','internal_purchase_costs',
                    'supplier_products')
order by t.relname, i.relname;

-- 5. Complete catalog_public SQL definition. This confirms its current source
-- and filters; the separate column query below preserves output order/types.
select c.oid::regclass as view_name,
       pg_catalog.pg_get_userbyid(c.relowner) as owner_name,
       c.reloptions,
       pg_catalog.pg_get_viewdef(c.oid, true) as complete_view_definition
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'catalog_public' and c.relkind = 'v';

-- 6. catalog_public output column order and exact type metadata. Migration 003
-- appends only the two structured subscription-term fields; migration 004 leaves
-- the view unchanged. Compare the live output layout with both accepted states.
select c.ordinal_position, c.column_name, c.data_type, c.udt_schema,
       c.udt_name, c.character_maximum_length, c.numeric_precision,
       c.numeric_scale, c.is_nullable
from information_schema.columns c
where c.table_schema = 'public' and c.table_name = 'catalog_public'
order by c.ordinal_position;

-- 7. Explicit ACL entries on catalog_public, products, order_items and
-- internal_purchase_costs. A NULL ACL means default privileges; effective
-- privilege results are included separately rather than inferred here.
select c.relname as object_name,
       case when a.grantee = 0 then 'PUBLIC' else grantee.rolname end as grantee,
       a.privilege_type, a.is_grantable
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
cross join lateral pg_catalog.aclexplode(c.relacl) a
left join pg_catalog.pg_roles grantee on grantee.oid = a.grantee
where n.nspname = 'public'
  and c.relname in ('catalog_public','products','order_items','internal_purchase_costs')
order by c.relname, grantee, a.privilege_type;

-- 8. Effective access for anon, authenticated and every other existing role
-- for the view and internal-cost table. The latter should not be readable or
-- writable by client roles; inspect any unexpected role access carefully.
select c.relname as object_name, r.rolname as role_name,
       has_table_privilege(r.oid, c.oid, 'SELECT') as can_select,
       has_table_privilege(r.oid, c.oid, 'INSERT') as can_insert,
       has_table_privilege(r.oid, c.oid, 'UPDATE') as can_update,
       has_table_privilege(r.oid, c.oid, 'DELETE') as can_delete
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
cross join pg_catalog.pg_roles r
where n.nspname = 'public'
  and c.relname in ('catalog_public','internal_purchase_costs')
order by c.relname, r.rolname;

-- 9. Policies and RLS state relevant to catalog/order access and the proposed
-- admin-only cost table. pg_policies returns expressions, not table contents.
select p.schemaname, p.tablename, p.policyname, p.permissive,
       p.roles, p.cmd, p.qual, p.with_check,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_catalog.pg_policies p
join pg_catalog.pg_class c on c.oid = (quote_ident(p.schemaname) || '.' || quote_ident(p.tablename))::regclass
where p.schemaname = 'public'
  and p.tablename in ('products','order_items','supplier_products','internal_purchase_costs')
order by p.tablename, p.policyname;

-- 10. public.is_admin() definition and its execution properties, if present.
select p.oid::regprocedure as signature, p.prosecdef as security_definer,
       p.proconfig as function_settings,
       pg_catalog.pg_get_userbyid(p.proowner) as owner_name,
       p.proacl::text as direct_acl,
       pg_catalog.pg_get_functiondef(p.oid) as function_definition
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'is_admin'
order by p.oid::regprocedure::text;

-- 11. Target checkout RPC overloads, exact signatures, current bodies,
-- SECURITY DEFINER settings, owner and direct ACLs. No function is invoked.
select p.oid::regprocedure as signature, p.prosecdef as security_definer,
       p.proconfig as function_settings,
       pg_catalog.pg_get_userbyid(p.proowner) as owner_name,
       p.proacl::text as direct_acl,
       pg_catalog.pg_get_functiondef(p.oid) as function_definition
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('place_public_order','place_buyer_order')
order by p.oid::regprocedure::text;

-- 12. Effective EXECUTE privileges on each checkout overload for anon,
-- authenticated and PUBLIC. Also includes unexpected overloads found above.
with execution_rights as (
  select p.oid::regprocedure::text as signature, r.rolname as role_name,
         has_function_privilege(r.oid, p.oid, 'EXECUTE') as can_execute
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join pg_catalog.pg_roles r
  where n.nspname = 'public'
    and p.proname in ('place_public_order','place_buyer_order')
    and r.rolname in ('anon','authenticated')
  union all
  select p.oid::regprocedure::text, 'PUBLIC',
         coalesce((select bool_or(a.privilege_type = 'EXECUTE')
                   from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f'::"char", p.proowner))) a
                   where a.grantee = 0), false)
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('place_public_order','place_buyer_order')
)
select signature, role_name, can_execute
from execution_rights
order by signature, role_name;

-- 13. Potential relation-name conflicts for the internal cost table, including
-- any same-named relation outside public. No product/order-item columns are assumed.
select n.nspname as schema_name, c.relname as relation_name, c.relkind,
       pg_catalog.pg_get_userbyid(c.relowner) as owner_name
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where (c.relname = 'internal_purchase_costs')
order by n.nspname, c.relname;

-- 14. Compare all 15 existing Xbox products with the planned stable IDs,
-- slugs, retail prices, currency, structured terms and publication states. Existing
-- names, descriptions, instructions and restrictions are shown but not required
-- to be empty or otherwise rewritten by the migration.
with expected(product_id, slug, group_family, retail_rub, months, bonus_months) as (
  values
    ('xbox-game-pass-ultimate-1-month','xbox-game-pass-ultimate-1-month','ultimate',1490,1,0),
    ('xbox-game-pass-ultimate-2-months','xbox-game-pass-ultimate-2-months','ultimate',2790,2,0),
    ('xbox-game-pass-ultimate-3-months','xbox-game-pass-ultimate-3-months','ultimate',3490,3,0),
    ('xbox-game-pass-ultimate-4-months','xbox-game-pass-ultimate-4-months','ultimate',4990,4,0),
    ('xbox-game-pass-ultimate-5-months','xbox-game-pass-ultimate-5-months','ultimate',6310,5,0),
    ('xbox-game-pass-ultimate-6-months','xbox-game-pass-ultimate-6-months','ultimate',6990,6,0),
    ('xbox-game-pass-ultimate-7-months','xbox-game-pass-ultimate-7-months','ultimate',7670,7,0),
    ('xbox-game-pass-ultimate-11-months','xbox-game-pass-ultimate-11-months','ultimate',10390,11,0),
    ('xbox-game-pass-ultimate-12-months-bonus-1','xbox-game-pass-ultimate-12-months-bonus-1','ultimate',10990,12,1),
    ('xbox-game-pass-premium-1-month','xbox-game-pass-premium-1-month','premium',1290,1,0),
    ('xbox-game-pass-essential-3-months','xbox-game-pass-essential-3-months','essential',1790,3,0),
    ('pc-game-pass-3-months','pc-game-pass-3-months','pc',1990,3,0),
    ('pc-game-pass-6-months','pc-game-pass-6-months','pc',3790,6,0),
    ('pc-game-pass-9-months','pc-game-pass-9-months','pc',4990,9,0),
    ('pc-game-pass-12-months','pc-game-pass-12-months','pc',5990,12,0)
)
select e.group_family, e.product_id as expected_product_id, e.slug as expected_slug,
       e.retail_rub as expected_retail_rub,
       p.product_id as existing_product_id, p.region as existing_region,
       p.group_id as existing_group_id, p.slug as existing_slug, p.title,
       p.description, p.activation_instructions, p.restrictions,
       p.unit_price as existing_retail_price, p.currency as existing_currency,
       p.category, p.product_type, p.active, p.publication_status, p.availability,
       to_jsonb(p)->>'subscription_months' as existing_subscription_months,
       to_jsonb(p)->>'subscription_bonus_months' as existing_subscription_bonus_months,
       e.months as expected_subscription_months,
       e.bonus_months as expected_subscription_bonus_months,
       (p.product_id = e.product_id) as product_id_matches,
       (p.slug = e.slug) as slug_matches,
       (p.unit_price = e.retail_rub) as retail_price_matches,
       (p.currency = 'RUB') as currency_matches,
       (p.active = false) as inactive_as_expected,
       (p.publication_status = 'draft') as draft_as_expected,
       (p.availability = 'unavailable') as unavailable_as_expected,
       (p.category = 'xbox') as category_as_expected,
       (p.product_type = 'subscription') as type_as_expected
from expected e
left join public.products p
  on (p.product_id = e.product_id)
  or (p.slug = e.slug)
order by e.group_family, e.product_id, p.region;

-- 15. Family grouping summary. Each family should have one existing group_id;
-- all four families should have different group_ids. No IDs are prescribed or
-- generated by migration 004.
with expected(product_id,family) as (values
  ('xbox-game-pass-ultimate-1-month','ultimate'),('xbox-game-pass-ultimate-2-months','ultimate'),
  ('xbox-game-pass-ultimate-3-months','ultimate'),('xbox-game-pass-ultimate-4-months','ultimate'),
  ('xbox-game-pass-ultimate-5-months','ultimate'),('xbox-game-pass-ultimate-6-months','ultimate'),
  ('xbox-game-pass-ultimate-7-months','ultimate'),('xbox-game-pass-ultimate-11-months','ultimate'),
  ('xbox-game-pass-ultimate-12-months-bonus-1','ultimate'),('xbox-game-pass-premium-1-month','premium'),
  ('xbox-game-pass-essential-3-months','essential'),('pc-game-pass-3-months','pc'),
  ('pc-game-pass-6-months','pc'),('pc-game-pass-9-months','pc'),('pc-game-pass-12-months','pc')
), family_ids as (
  select e.family, count(p.product_id) as products_found,
         count(distinct p.group_id) as distinct_group_ids,
         bool_or(p.group_id is null) as has_null_group_id,
         min(p.group_id::text) as existing_group_id
  from expected e
  left join public.products p on p.product_id=e.product_id
  group by e.family
)
select f.family, f.products_found, f.distinct_group_ids, f.has_null_group_id,
       f.existing_group_id,
       (select count(*) from family_ids other
        where other.existing_group_id=f.existing_group_id) > 1 as group_id_shared_across_families
from family_ids f
order by f.family;

-- 16. Separate collision report for product IDs/regions and slugs. Multiple
-- rows for one expected product_id mean it exists in more than one region;
-- a slug attached to a different product_id is also a conflict.
with expected(product_id,slug) as (values
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
), candidates as (
  select e.product_id as expected_product_id, e.slug as expected_slug,
         p.product_id as existing_product_id, p.region as existing_region,
         p.slug as existing_slug, p.group_id as existing_group_id,
         count(*) filter (where p.product_id=e.product_id)
           over (partition by e.product_id) as id_region_count
  from expected e
  left join public.products p on p.product_id=e.product_id or p.slug=e.slug
)
select expected_product_id, expected_slug, existing_product_id, existing_region,
       existing_slug, existing_group_id,
       case
         when existing_product_id is null then 'missing'
         when existing_product_id <> expected_product_id then 'slug_owned_by_other_product'
         when existing_slug <> expected_slug then 'product_id_has_different_slug'
         when id_region_count > 1 then 'product_id_exists_in_multiple_regions'
         else 'no_slug_or_region_conflict'
       end as diagnostic
from candidates
where existing_product_id is null
   or existing_product_id <> expected_product_id
   or existing_slug <> expected_slug
   or id_region_count > 1
order by expected_product_id, existing_region;

-- 17. OPTIONAL AFTER query 1 confirms the table exists: uncomment and run this
-- standalone SELECT to inspect matching existing cost rows. It remains commented
-- so the complete pre-migration preflight runs when the table is absent.
-- with expected(product_id, purchase_cost_rub) as (values
--   ('xbox-game-pass-ultimate-1-month',1199),('xbox-game-pass-ultimate-2-months',2300),
--   ('xbox-game-pass-ultimate-3-months',2900),('xbox-game-pass-ultimate-4-months',4500),
--   ('xbox-game-pass-ultimate-5-months',5044),('xbox-game-pass-ultimate-6-months',5589),
--   ('xbox-game-pass-ultimate-7-months',6133),('xbox-game-pass-ultimate-11-months',8311),
--   ('xbox-game-pass-ultimate-12-months-bonus-1',9400),('xbox-game-pass-premium-1-month',1000),
--   ('xbox-game-pass-essential-3-months',1400),('pc-game-pass-3-months',1600),
--   ('pc-game-pass-6-months',3200),('pc-game-pass-9-months',4300),('pc-game-pass-12-months',5300)
-- )
-- select e.product_id, p.region as expected_region, e.purchase_cost_rub as expected_cost_rub,
--        c.region as existing_region, c.purchase_cost, c.purchase_currency,
--        c.purchase_cost_status, c.cost_updated_at
-- from expected e
-- join public.products p on p.product_id=e.product_id
-- left join public.internal_purchase_costs c
--   on c.product_id = p.product_id and c.region = p.region
-- order by e.product_id;

-- 18. Dependencies of catalog_public and its source relation; migration 004
-- does not replace the view, but this documents its live dependencies.
select dependent_ns.nspname as dependent_schema,
       dependent.relname as dependent_object,
       dependent.relkind as dependent_kind,
       pg_catalog.pg_describe_object(dep.classid, dep.objid, dep.objsubid) as dependency_description
from pg_catalog.pg_depend dep
join pg_catalog.pg_rewrite rw on dep.classid = 'pg_rewrite'::regclass and rw.oid = dep.objid
join pg_catalog.pg_class dependent on dependent.oid = rw.ev_class
join pg_catalog.pg_namespace dependent_ns on dependent_ns.oid = dependent.relnamespace
where dep.refclassid = 'pg_class'::regclass
  and dep.refobjid = to_regclass('public.catalog_public')
  and dependent.oid <> to_regclass('public.catalog_public')
order by dependent_ns.nspname, dependent.relname;

-- 19. Triggers on products/internal costs and rules on catalog_public that may
-- affect catalog rows, cost inserts, or the public view's behavior.
select 'trigger'::text as object_type, n.nspname as schema_name,
       c.relname as relation_name, t.tgname as object_name,
       pg_catalog.pg_get_triggerdef(t.oid, true) as definition
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal and n.nspname = 'public'
  and c.relname in ('products','internal_purchase_costs')
union all
select 'rule', n.nspname, c.relname, r.rulename,
       pg_catalog.pg_get_ruledef(r.oid, true)
from pg_catalog.pg_rewrite r
join pg_catalog.pg_class c on c.oid = r.ev_class
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'catalog_public'
order by 2, 3, 4;
