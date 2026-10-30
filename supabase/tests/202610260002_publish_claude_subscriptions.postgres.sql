\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    execute 'create role anon';
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    execute 'create role authenticated';
  end if;
end;
$$;

create schema auth;
create function auth.uid()
returns uuid language sql stable as $$ select null::uuid $$;
create table public.admin_users (user_id uuid primary key);

create function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = (select auth.uid())
  )
$$;
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

create table public.products (
  product_id text not null,
  region text not null default '',
  group_id uuid not null default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  platform text not null,
  currency text not null default 'RUB',
  unit_price numeric(12,2) not null,
  active boolean not null default false,
  description text not null default '',
  category text not null,
  brand text not null default '',
  product_type text not null,
  subscription_months integer,
  subscription_bonus_months integer not null default 0,
  image_url text,
  activation_instructions text not null default '',
  restrictions jsonb not null default '[]'::jsonb,
  availability text not null default 'unavailable',
  publication_status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, region),
  constraint products_unit_price_check check (unit_price > 0),
  constraint products_currency_check check (currency = 'RUB'),
  constraint products_availability_check check (availability in ('in_stock','out_of_stock','unavailable')),
  constraint products_publication_status_check check (publication_status in ('draft','published','hidden')),
  constraint products_category_check check (category in ('apple','xbox','playstation','steam','ai')),
  constraint products_type_check check (product_type in ('gift-card','game','subscription','topup')),
  constraint products_active_publication_check
    check (active = (publication_status = 'published' and availability = 'in_stock')),
  constraint products_subscription_months_check
    check (subscription_months is null or subscription_months between 1 and 120),
  constraint products_subscription_bonus_months_check
    check (subscription_bonus_months between 0 and 12 and (subscription_bonus_months = 0 or subscription_months is not null))
);

create table public.order_items (
  order_id uuid not null,
  product_id text not null,
  product_name text not null,
  platform text not null,
  region text,
  denomination numeric,
  denomination_currency text,
  subscription_months integer,
  subscription_bonus_months integer not null default 0,
  quantity integer not null,
  unit_price numeric not null,
  constraint order_items_subscription_months_check
    check (subscription_months is null or subscription_months between 1 and 120),
  constraint order_items_subscription_bonus_months_check
    check (subscription_bonus_months between 0 and 12 and (subscription_bonus_months = 0 or subscription_months is not null))
);

create table public.internal_purchase_costs (
  product_id text not null,
  region text not null default '',
  purchase_cost numeric(12,2) not null check (purchase_cost >= 0),
  purchase_currency text not null default 'RUB' check (purchase_currency = 'RUB'),
  purchase_cost_status text not null default 'unverified'
    constraint internal_purchase_costs_purchase_cost_status_check
      check (purchase_cost_status in ('confirmed', 'estimate', 'unverified')),
  cost_updated_at timestamptz not null default now(),
  internal_notes text not null default '',
  primary key (product_id, region),
  constraint internal_purchase_costs_variant_fk
    foreign key (product_id, region) references public.products(product_id, region)
);
alter table public.internal_purchase_costs enable row level security;
grant select, insert, update, delete on public.internal_purchase_costs to authenticated;
create policy "Admins manage internal purchase costs" on public.internal_purchase_costs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "BezB internal purchase costs admin boundary" on public.internal_purchase_costs
  as restrictive for all to authenticated using (public.is_admin()) with check (public.is_admin());

create function public.sync_product_active()
returns trigger language plpgsql as $$
begin
  new.active := new.publication_status = 'published' and new.availability = 'in_stock';
  return new;
end;
$$;
create trigger products_sync_active
before insert or update of publication_status, availability on public.products
for each row execute function public.sync_product_active();

create view public.catalog_public with (security_barrier = true) as
select product_id, group_id, slug, title, platform, currency, unit_price, region, description,
       category, brand, product_type, denomination, denomination_currency, image_url,
       activation_instructions, restrictions, popularity, availability, created_at, updated_at,
       subscription_months, subscription_bonus_months
from (
  select p.*,
         null::numeric as denomination,
         null::text as denomination_currency,
         0::integer as popularity
  from public.products p
) products_view
where publication_status = 'published'
  and active = true
  and availability = 'in_stock';
grant select on public.catalog_public to anon, authenticated;

create table public.order_idempotency (
  idempotency_key uuid primary key,
  customer_user_id uuid not null
);

create function public.place_public_order(
  p_customer_name text, p_customer_phone text, p_customer_email text,
  p_delivery_address text, p_customer_comment text, p_consent boolean, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_product public.products%rowtype;
  v_qty integer;
  v_total numeric := 0;
  v_item jsonb := p_items->0;
begin
  if p_consent is distinct from true then raise exception 'Consent is required'; end if;
  if (v_item->>'expected_price') is null then raise exception 'Missing expected_price'; end if;
  select p.* into v_product from public.products p
   where p.product_id = v_item->>'product_id'
     and p.active = true and p.publication_status = 'published' and p.availability = 'in_stock';
  if v_product.product_id is null or (v_item->>'expected_price')::numeric <> v_product.unit_price then
    raise exception 'Displayed price is outdated';
  end if;
  v_qty := (v_item->>'quantity')::integer;
  v_total := v_total + v_product.unit_price * v_qty;
  return jsonb_build_object('unit_price', v_product.unit_price, 'total', v_total, 'subscription_months', 1, 'subscription_bonus_months', 0);
end;
$$;
create function public.place_buyer_order(
  p_customer_name text, p_customer_phone text, p_customer_email text,
  p_delivery_address text, p_customer_comment text, p_consent boolean,
  p_items jsonb, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_product public.products%rowtype;
  v_qty integer;
  v_total numeric := 0;
  v_existing uuid;
  v_item jsonb := p_items->0;
begin
  if p_consent is distinct from true then raise exception 'Consent is required'; end if;
  if p_idempotency_key is null then raise exception 'Checkout request key is required'; end if;
  insert into public.order_idempotency(idempotency_key, customer_user_id)
  values (p_idempotency_key, gen_random_uuid()) on conflict do nothing;
  select idempotency_key into v_existing from public.order_idempotency
  where idempotency_key = p_idempotency_key;
  if (v_item->>'expected_price') is null then raise exception 'Missing expected_price'; end if;
  select p.* into v_product from public.products p
   where p.product_id = v_item->>'product_id'
     and p.active = true and p.publication_status = 'published' and p.availability = 'in_stock';
  if v_product.product_id is null or (v_item->>'expected_price')::numeric <> v_product.unit_price then
    raise exception 'Displayed price is outdated';
  end if;
  v_qty := (v_item->>'quantity')::integer;
  v_total := v_total + v_product.unit_price * v_qty;
  return jsonb_build_object('unit_price', v_product.unit_price, 'total', v_total, 'subscription_months', 1, 'subscription_bonus_months', 0);
end;
$$;
revoke all on function public.place_public_order(text,text,text,text,text,boolean,jsonb) from public, anon, authenticated;
revoke all on function public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.place_public_order(text,text,text,text,text,boolean,jsonb) to anon, authenticated;
grant execute on function public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid) to authenticated;

\if :expect_slug_conflict
insert into public.products (
  product_id, region, slug, title, platform, currency, unit_price, active,
  category, brand, product_type, subscription_months, subscription_bonus_months,
  availability, publication_status
) values (
  'unrelated-existing-product', '', 'claude-pro-1-months', 'Existing unrelated product',
  'Other', 'RUB', 1, false, 'ai', 'Other', 'subscription', null, 0,
  'unavailable', 'draft'
);
\endif

\ir ../migrations/202610250001_claude_catalog_drafts.sql
\ir ../migrations/202610260002_publish_claude_subscriptions.sql

do $$
begin
  if (select count(*) from public.products
      where product_id in ('claude-pro-1-months', 'claude-max-5x-1-months', 'claude-max-20x-1-months')
        and region = '' and publication_status = 'published'
        and active = true and availability = 'in_stock') <> 3 then
    raise exception 'Expected all Claude subscriptions to be published and purchasable';
  end if;

  if (select count(*) from public.catalog_public
      where product_id in ('claude-pro-1-months', 'claude-max-5x-1-months', 'claude-max-20x-1-months')
        and currency = 'RUB' and unit_price in (2630, 18880, 31380)
        and subscription_months = 1 and subscription_bonus_months = 0) <> 3 then
    raise exception 'Expected all Claude subscriptions in the safe public catalog at approved prices and terms';
  end if;

  if (select count(*) from public.internal_purchase_costs
      where product_id in ('claude-pro-1-months', 'claude-max-5x-1-months', 'claude-max-20x-1-months')
        and purchase_cost_status = 'confirmed'
        and (product_id, purchase_cost) in (
          ('claude-pro-1-months', 2099),
          ('claude-max-5x-1-months', 15100),
          ('claude-max-20x-1-months', 25100)
        )) <> 3 then
    raise exception 'Expected all approved internal purchase costs to be confirmed';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'catalog_public'
      and column_name in ('purchase_cost', 'purchase_currency', 'purchase_cost_status', 'internal_notes')
  ) then
    raise exception 'Internal purchase cost fields must not appear in catalog_public';
  end if;
end;
$$;

set role authenticated;
do $$
begin
  if exists (select 1 from public.internal_purchase_costs) then
    raise exception 'Ordinary authenticated users must not read internal purchase costs';
  end if;
end;
$$;
reset role;

\if :expect_slug_conflict
\else
\ir ../migrations/202610250001_claude_catalog_drafts.sql
\ir ../migrations/202610260002_publish_claude_subscriptions.sql

do $$
begin
  if (select count(*) from public.products
      where product_id in ('claude-pro-1-months', 'claude-max-5x-1-months', 'claude-max-20x-1-months')
        and region = '') <> 3 then
    raise exception 'Replaying Claude migrations must not create duplicate products';
  end if;
  if (select count(*) from public.internal_purchase_costs
      where product_id in ('claude-pro-1-months', 'claude-max-5x-1-months', 'claude-max-20x-1-months')
        and region = '') <> 3 then
    raise exception 'Replaying Claude migrations must not create duplicate internal cost rows';
  end if;
end;
$$;
\endif
