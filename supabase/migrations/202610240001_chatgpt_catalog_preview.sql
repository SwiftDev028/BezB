-- Publish only the two verified ChatGPT variants as unavailable catalog
-- previews. Checkout RPCs and the public catalog projection remain unchanged.
begin;

do $$
declare
  v_conflicts text;
  v_purchasable_pro text;
  v_view_columns text[];
  v_updated integer;
begin
  if to_regclass('public.products') is null
     or to_regclass('public.catalog_public') is null then
    raise exception 'Expected public.products and public.catalog_public';
  end if;

  if (select c.relkind
      from pg_catalog.pg_class c
      where c.oid = 'public.catalog_public'::regclass) <> 'v' then
    raise exception 'Expected public.catalog_public to remain a view';
  end if;

  select string_agg(p.product_id, ', ' order by p.product_id)
    into v_purchasable_pro
  from public.products p
  where (p.product_id in (
      'chatgpt-pro-100-1-month',
      'chatgpt-pro-200-1-month',
      'chatgpt-pro-500-1-month'
    )
    or p.slug in (
      'chatgpt-pro-100-1-month',
      'chatgpt-pro-200-1-month',
      'chatgpt-pro-500-1-month'
    ))
    and p.publication_status = 'published'
    and p.active = true
    and p.availability = 'in_stock';

  if v_purchasable_pro is not null then
    raise exception 'ChatGPT Pro variants are already purchasable; inspect before preview: %', v_purchasable_pro;
  end if;

  select array_agg(a.attname::text order by a.attnum)
    into v_view_columns
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.catalog_public'::regclass
    and a.attnum > 0
    and not a.attisdropped;

  if v_view_columns is distinct from array[
    'product_id','group_id','slug','title','platform','currency','unit_price','region','description',
    'category','brand','product_type','denomination','denomination_currency','image_url',
    'activation_instructions','restrictions','popularity','availability','created_at','updated_at',
    'subscription_months','subscription_bonus_months'
  ]::text[] then
    raise exception 'Unexpected public.catalog_public columns/order: %', v_view_columns;
  end if;

  with expected(product_id, slug, region, unit_price, subscription_months, subscription_bonus_months) as (
    values
      ('chatgpt-go-1-month', 'chatgpt-go-1-month', '', 1100::numeric, 1::smallint, 0::smallint),
      ('chatgpt-plus-1-month', 'chatgpt-plus-1-month', '', 2440::numeric, 1::smallint, 0::smallint)
  ),
  matched as (
    select
      e.*,
      count(p.product_id) as matched_count,
      count(p.product_id) filter (where
        p.product_id = e.product_id
        and p.slug = e.slug
        and p.region = e.region
        and p.unit_price = e.unit_price
        and p.subscription_months = e.subscription_months
        and p.subscription_bonus_months = e.subscription_bonus_months
        and p.platform = 'ChatGPT'
        and p.currency = 'RUB'
        and p.category = 'ai'
        and p.brand = 'ChatGPT'
        and p.product_type = 'subscription'
        and p.active = false
        and p.availability = 'unavailable'
        and p.publication_status in ('draft', 'published')
      ) as valid_count
    from expected e
    left join public.products p
      on p.slug = e.slug
      or (p.product_id = e.product_id and p.region = e.region)
    group by
      e.product_id, e.slug, e.region, e.unit_price,
      e.subscription_months, e.subscription_bonus_months
  )
  select string_agg(slug, ', ' order by slug)
    into v_conflicts
  from matched
  where matched_count <> 1 or valid_count <> 1;

  if v_conflicts is not null then
    raise exception 'ChatGPT preview migration found missing or conflicting product variants: %', v_conflicts;
  end if;

  with expected(product_id, slug, region, unit_price, subscription_months, subscription_bonus_months) as (
    values
      ('chatgpt-go-1-month', 'chatgpt-go-1-month', '', 1100::numeric, 1::smallint, 0::smallint),
      ('chatgpt-plus-1-month', 'chatgpt-plus-1-month', '', 2440::numeric, 1::smallint, 0::smallint)
  )
  update public.products p
  set publication_status = 'published',
      active = false
  from expected e
  where p.product_id = e.product_id
    and p.slug = e.slug
    and p.region = e.region
    and p.unit_price = e.unit_price
    and p.subscription_months = e.subscription_months
    and p.subscription_bonus_months = e.subscription_bonus_months
    and p.active = false
    and p.availability = 'unavailable'
    and p.publication_status in ('draft', 'published');

  get diagnostics v_updated = row_count;
  if v_updated <> 2 then
    raise exception 'Expected to publish exactly two unavailable ChatGPT variants; updated %', v_updated;
  end if;
end;
$$;

-- Keep the established public projection and normal in-stock filter. Only the
-- only Go and Plus are exposed as unavailable previews. Pro variants remain
-- untouched; a preflight above aborts if any are currently purchasable.
create or replace view public.catalog_public
with (security_barrier = true) as
select
  product_id,
  group_id,
  slug,
  title,
  platform,
  currency,
  unit_price,
  region,
  description,
  category,
  brand,
  product_type,
  denomination,
  denomination_currency,
  image_url,
  activation_instructions,
  restrictions,
  popularity,
  availability,
  created_at,
  updated_at,
  subscription_months,
  subscription_bonus_months
from public.products
where publication_status = 'published'
  and (
    (active = true and availability = 'in_stock')
    or (
      product_id = slug
      and region = ''
      and slug in (
        'chatgpt-go-1-month',
        'chatgpt-plus-1-month'
      )
      and active = false
      and availability = 'unavailable'
    )
  );

commit;
