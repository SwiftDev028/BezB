begin;

-- Public catalog must expose only published, active, in-stock products.
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
    updated_at
from public.products
where publication_status = 'published'
  and active = true
  and availability = 'in_stock';

commit;
