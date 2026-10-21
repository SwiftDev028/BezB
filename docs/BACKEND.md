# Supabase setup for BezB

The project now uses Supabase Auth and the existing order tables when its two public Vite settings are present. Checkout calls the PostgreSQL RPC `public.place_public_order`; the function checks the current server-side catalog price and creates the order and lines in one transaction. The browser never receives a `service_role` key. The catalog table deliberately starts empty: all current entries in `src/data/products.ts` are explicitly test data.

## 1. Review and apply the migration

Open the Supabase SQL Editor for project `itasmmduvafvpnytgzey` and inspect the current `orders`, `order_items`, `admin_users`, RLS policies, `is_admin()` function, and grants first. Then run the whole file [`supabase/migrations/202610210001_orders_integration.sql`](../supabase/migrations/202610210001_orders_integration.sql) once. It uses additive `IF NOT EXISTS` changes and does not drop or recreate existing orders. Check the result for SQL errors. It adds a product price table, consent timestamp, order version/metadata, line platform/region fields, and the public order RPC. It revokes direct table writes and limits order changes to authenticated administrators under the existing RLS policies.

The migration assumes the stated existing order columns (`customer_phone`, `delivery_address`, `customer_comment`, `status`, `total_amount`) and `public.is_admin()` with no arguments returning boolean. The `admin_users` table stays inaccessible to the browser; the UI calls the existing `is_admin()` function. Verify that it is executable by `authenticated` as described in the original project setup.

## 2. Add real products later

Do not seed from the current demo catalog. Until products exist, the RPC rejects every checkout. To list a real item later, the owner must first replace its placeholder entry in `src/data/products.ts` with verified data, retaining a stable `id`/slug, and add the matching server record in `public.products`. Required columns are `product_id`, `region` (empty string for no region), `title`, `platform`, `currency` (`RUB`), `unit_price`, and `active`. For region-priced variants, add one row for each region with its own authoritative price; the matching frontend product must expose those region labels. The server rejects inactive/missing IDs and rejects a checkout if the frontend's displayed price does not equal the current database price. This fail-closed check prevents an out-of-date static GitHub Pages build from placing a differently priced order.

Use the Supabase Table Editor while signed in as an administrator to add product rows; do not add activation codes, credentials, or supplier secrets. Keep demo records out of the products table. No product catalog migration import is needed because all current data is explicitly fictional/test content.

## 3. Configure local build and GitHub Pages

Copy `.env.example` to `.env.local` for local work and set:

```env
VITE_SUPABASE_URL=https://itasmmduvafvpnytgzey.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<public publishable key or legacy anon key>
```

Get the URL and publishable/anon key from Supabase **Project Settings → API**. Never use a `service_role` or secret key here. Anything named `VITE_*` is embedded in the public bundle; it is public configuration only.

The GitHub Actions workflow already builds the site. In the repository's **Settings → Secrets and variables → Actions → Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as repository variables (or set the workflow references to environment-specific variables if using GitHub Environments). Push to `main` or run **Actions → Deploy to GitHub Pages → Run workflow**. Ensure **Settings → Pages → Build and deployment → GitHub Actions** remains selected. Do not create a secret for a service-role key or add one to the workflow.

In the Supabase Auth URL configuration, allow the published GitHub Pages URL and the local development URL as redirect/site URLs. Turn off public user sign-up if the project is administrator-only. Existing administrator `57556b8a-b4df-46ed-b237-617fcc2e0fa7` must still exist in Auth and `admin_users`.

## 4. Verify setup

1. Before product setup, use `/checkout` with a cart item: it should fail with an unavailable product and keep the cart. This confirms no demo item becomes a real order.
2. Visit `/admin/orders` signed out: the page shows login and no orders. A normal authenticated account must be rejected. The designated admin should see the list (empty initially).
3. After the owner has entered one verified real product in both catalog sources, add it to cart and submit valid name, phone, email, delivery details, and consent. The confirmation must show the database order number; the admin list on another device/session should show it.
4. In SQL Editor, check `orders` and `order_items`: stored prices and total must match `products`, status must start at `new`, and `consent_at` must be non-null. Try changing the frontend displayed price and confirm checkout is rejected. Test reads/writes with anonymous and ordinary-user sessions; RLS must deny access.

No remote Supabase schema or auth state was inspected or changed from this workspace. Do not paste passwords or secret keys into chat.

## Status and remaining limits

Database statuses are mapped from the UI: `new`, `processing`, `delivered` → `shipped`, and `cancelled`. Existing `confirmed` and `completed` rows appear as `processing` and `delivered`. Payment is not configured; every order remains unpaid and the interface does not allow marking it paid. Consequently the existing rule that requires payment before delivery prevents marking orders as delivered until a real payment flow is added. Event history and delivery notes are stored in `admin_metadata`; concurrent admin edits use the order `version` and stale saves are rejected. Do not store activation codes, passwords, or keys in notes.

The website still serves a static, manually maintained catalog because the owner has no verified products yet. Product records must be kept in sync with that catalog; a mismatch blocks checkout rather than charging a stale displayed price. Email notifications, customer self-service, refunds, and online payment are not implemented. Buyers cannot read their order after submission; only administrators can read orders.
