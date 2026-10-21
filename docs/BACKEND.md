# Supabase setup for BezB

The application uses Supabase Auth for buyer accounts and the existing `orders`, `order_items`, and `admin_users` tables. The public site reads a safe `catalog_public` view, and all order creation, payment confirmation, code assignment, delivery, and email-sent marking are performed through database functions or admin-only RLS-protected operations. No `service_role` key is used by the browser.

The migrations have **not** been run against the hosted project. The workspace has no Supabase database connection, so the current production schema, existing policies, constraints, grants, and administrator row cannot be independently confirmed. Review the checks below before applying either migration.

## 1. Check the live schema first

In the SQL Editor for project `itasmmduvafvpnytgzey`, inspect the real column names and types before applying migrations. In particular, migration 002 currently assumes:

- `orders.id` and `order_items.id` are UUIDs;
- `orders.order_number`, `customer_name`, `customer_phone`, `customer_email`, `delivery_address`, `customer_comment`, `consent_at`, `status`, `total_amount`, `created_at`, `updated_at`, and `version` exist after migration 001;
- `order_items.order_id` is UUID, `product_id` is text, and `product_name`, `platform`, `region`, `quantity`, and `unit_price` exist after migration 001;
- `admin_users.user_id` is the UUID referencing `auth.users.id`;
- `public.is_admin()` takes no parameters and returns boolean.

Useful read-only checks:

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('orders','order_items','admin_users')
order by table_name, ordinal_position;

select p.policyname, p.tablename, p.cmd, p.roles, p.qual
from pg_policies p
where p.schemaname = 'public'
  and p.tablename in ('orders','order_items','admin_users','products');

select pg_get_functiondef('public.is_admin()'::regprocedure);
select id, user_id from public.admin_users;
```

If any key type/name differs (especially `order_items.product_id`, order IDs, admin membership column), stop and adapt the migration to the live schema rather than applying it as-is. Keep a database backup/export first. No existing tables are dropped or recreated by these migrations, but migration 002 replaces `is_admin()` and changes product/order policies and grants.

## 2. Apply migrations in order

After reconciling the live schema above, run each complete file once, in order, in the Supabase SQL Editor:

1. [`supabase/migrations/202610210001_orders_integration.sql`](../supabase/migrations/202610210001_orders_integration.sql) — adds the initial product variant/pricing table and the legacy guest-order RPC.
2. [`supabase/migrations/202610210002_catalog_fulfillment_accounts.sql`](../supabase/migrations/202610210002_catalog_fulfillment_accounts.sql) — adds catalog metadata, safe public view, supplier data, protected codes, buyer ownership, idempotency, audit events, and manual fulfillment functions. It disables the guest-order RPC and requires a confirmed buyer account for all new orders.

Do not rerun migration 001 after 002: 001 grants anonymous access to the guest RPC, while 002 revokes it. Verify successful execution and inspect the final grants/policies before enabling site configuration. `is_admin()` is redefined as a `SECURITY DEFINER` check against `admin_users.user_id = auth.uid()`; this fixes the common RLS recursion/permission issue only if that column is indeed the live membership key. It does not create or promote an administrator. Confirm the existing administrator Auth UUID `57556b8a-b4df-46ed-b237-617fcc2e0fa7` is already linked in `admin_users`.

The catalog starts empty. No fictional products/prices are seeded. Only create and publish variants after confirming the product and sale price with the supplier. Supplier mappings hold cost and internal information; `catalog_public` exposes only customer-facing fields. Digital codes are never selected by the public catalog or buyer order list; buyers receive them from `my_delivered_codes()` only after payment and delivery.

## 3. Configure Auth and the site

For local builds, copy `.env.example` to `.env.local` and set:

```env
VITE_SUPABASE_URL=https://itasmmduvafvpnytgzey.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<public publishable key or legacy anon key>
```

Use only the publishable/anon key. All `VITE_*` values become public in the static bundle. Never put a `service_role` or secret key in the app, GitHub, `.env.example`, or chat.

In Supabase Auth URL settings, allow `https://swiftdev028.github.io/BezB/` and your local development URL. Buyers need email confirmation enabled because checkout requires the signed-in account's confirmed email. Configure sign-up policy deliberately for the store; admin access remains determined by `admin_users`, not by a client-side role or sign-up status.

In GitHub repository **Settings → Secrets and variables → Actions → Variables**, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The Vite base path and post-build fallback files support GitHub Pages routes. No backend server runs on GitHub Pages.

## 4. Configure catalog and admin operations

After migrations and Auth setup, sign in with an existing admin account and visit `/admin/catalog`. Create real product variants with distinct variant IDs and slugs; reuse the same group UUID for related region/denomination variants. Keep new rows as draft until verified, and publish only when the sale price and stock are correct. The customer catalog can show published out-of-stock variants, but checkout accepts only `in_stock` variants.

Use `/admin/suppliers` to record a supplier, SKU, purchase cost, and purchase currency. This is manual recordkeeping; no supplier API is implied. Use `/admin/inventory` to add purchased codes. The code is submitted directly to the admin-only table, displayed only in the admin order detail once assigned, and excluded from audit events. Confirm payment outside the website before assigning/delivering any code. The buyer can see their delivered code and activation instructions in `/my-orders`. Email remains manual: the admin page prepares a `mailto:` message and only records an email-sent timestamp after the administrator clicks that action.

## 5. Verification still required against Supabase

Local checks cannot establish live RLS or RPC behavior. After applying migrations in a staging project or controlled test environment, verify at least:

- anonymous and ordinary authenticated users can read only published customer-facing catalog fields, with no supplier costs or secret codes;
- confirmed buyer account can create an order; server price is authoritative, changed/missing items are rejected, and a repeated idempotency key returns the same order;
- new orders are `unpaid`/`new`, and codes cannot be reserved or delivered until an admin confirms payment;
- admin can manage variants, suppliers, and inventory; normal users cannot call admin functions or access secret tables;
- buyer A can read only buyer A's orders and delivered codes; buyer B cannot retrieve buyer A's code;
- one code cannot be assigned to multiple active deliveries;
- the existing admin passes `is_admin()` and the admin panel displays any RPC/schema error rather than bypassing the check.

Do not treat these checks as completed until they have actually been run against the project. If the current schema differs, capture the differences and update the migration first.
