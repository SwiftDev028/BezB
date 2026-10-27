\set ON_ERROR_STOP on

create table public.products (
  product_id text not null,
  region text not null default '',
  group_id uuid not null default gen_random_uuid(),
  slug text not null,
  title text not null,
  platform text not null,
  currency text not null default 'RUB',
  unit_price numeric(12,2) not null,
  active boolean not null default false,
  description text not null default '',
  category text not null,
  brand text not null default '',
  product_type text not null,
  denomination numeric(12,2),
  denomination_currency text,
  image_url text,
  activation_instructions text not null default '',
  restrictions jsonb not null default '[]'::jsonb,
  availability text not null default 'unavailable',
  publication_status text not null default 'draft',
  primary key (product_id, region),
  constraint products_unit_price_check check (unit_price > 0),
  constraint products_currency_check check (currency = 'RUB'),
  constraint products_category_check check (category in ('apple','xbox','playstation','steam','ai')),
  constraint products_type_check check (product_type in ('gift-card','game','subscription','topup')),
  constraint products_availability_check check (availability in ('in_stock','out_of_stock','unavailable')),
  constraint products_publication_status_check check (publication_status in ('draft','published','hidden')),
  constraint products_active_publication_check
    check (active = (publication_status = 'published' and availability = 'in_stock'))
);
create unique index products_slug_uidx on public.products (slug);

create view public.catalog_public as
select product_id, slug, unit_price
from public.products
where publication_status = 'published'
  and active = true
  and availability = 'in_stock';

\if :expect_slug_conflict
insert into public.products (
  product_id, region, slug, title, platform, currency, unit_price,
  category, brand, product_type
) values (
  'unrelated-product', '', 'phantom-blade-zero-ps5-standard',
  'Unrelated product', 'Other', 'RUB', 100,
  'playstation', 'Other', 'game'
);
\endif

\ir ../migrations/202610270003_phantom_blade_zero_ps5_drafts.sql

\if :expect_slug_conflict
\else
\ir ../migrations/202610270003_phantom_blade_zero_ps5_drafts.sql

do $$
begin
  if (select count(*) from public.products
      where product_id in (
        'phantom-blade-zero-ps5-standard',
        'phantom-blade-zero-ps5-digital-deluxe'
      ) and region = '') <> 2 then
    raise exception 'Expected exactly two Phantom Blade Zero PS5 draft variants';
  end if;

  if (select count(*) from public.products
      where (product_id, unit_price) in (
        ('phantom-blade-zero-ps5-standard', 7200::numeric),
        ('phantom-blade-zero-ps5-digital-deluxe', 12000::numeric)
      )
        and region = ''
        and platform = 'PlayStation 5'
        and category = 'playstation'
        and product_type = 'game'
        and active = false
        and availability = 'unavailable'
        and publication_status = 'draft'
        and denomination is null
        and image_url is null) <> 2 then
    raise exception 'Phantom Blade Zero prices, platform, classification, or draft status are incorrect';
  end if;

  if (select count(distinct group_id) from public.products
      where product_id in (
        'phantom-blade-zero-ps5-standard',
        'phantom-blade-zero-ps5-digital-deluxe'
      ) and region = '') <> 1 then
    raise exception 'Phantom Blade Zero editions must share one catalog group';
  end if;

  if exists (
    select 1 from public.catalog_public
    where product_id like 'phantom-blade-zero-ps5-%'
  ) then
    raise exception 'Phantom Blade Zero draft variants must not be visible in the public catalog';
  end if;

  if exists (
    select 1 from public.products
    where product_id = 'phantom-blade-zero-ps5-standard'
      and (
        description not like '%## Инструкция по покупке%'
        or description not like '%пароль от аккаунта PlayStation%'
        or description not like '%резервные коды%'
      )
  ) then
    raise exception 'Standard edition must include the safe purchase instructions';
  end if;

  if exists (
    select 1 from public.products
    where product_id = 'phantom-blade-zero-ps5-digital-deluxe'
      and (
        description not like '%Digital Deluxe Edition включает дополнительные материалы%'
        or description not like '%Их состав здесь не уточняется%'
      )
  ) then
    raise exception 'Digital Deluxe description must not overstate the unspecified bonus contents';
  end if;
end;
$$;
\endif
