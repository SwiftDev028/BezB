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
  'unrelated-product', '', 'gta-vi-xbox-series-xs-standard',
  'Unrelated product', 'Other', 'RUB', 100,
  'xbox', 'Other', 'game'
);
\endif

\ir ../migrations/202610270001_gta_vi_xbox_drafts.sql

\if :expect_slug_conflict
\else
\ir ../migrations/202610270001_gta_vi_xbox_drafts.sql
\ir ../migrations/202610270002_gta_vi_structured_descriptions.sql
\ir ../migrations/202610270002_gta_vi_structured_descriptions.sql

do $$
begin
  if (select count(*) from public.products
      where product_id in (
        'gta-vi-xbox-series-xs-standard',
        'gta-vi-xbox-series-xs-ultimate',
        'gta-vi-xbox-series-xs-ultimate-upgrade'
      ) and region = '') <> 3 then
    raise exception 'Expected exactly three GTA VI Xbox draft variants';
  end if;

  if (select count(*) from public.products
      where (product_id, unit_price) in (
        ('gta-vi-xbox-series-xs-standard', 6600::numeric),
        ('gta-vi-xbox-series-xs-ultimate', 8500::numeric),
        ('gta-vi-xbox-series-xs-ultimate-upgrade', 2415::numeric)
      )
        and region = ''
        and category = 'xbox'
        and product_type = 'game'
        and active = false
        and availability = 'unavailable'
        and publication_status = 'draft') <> 3 then
    raise exception 'GTA VI draft prices, classification, or non-purchasable status are incorrect';
  end if;

  if (select count(distinct group_id) from public.products
      where product_id in (
        'gta-vi-xbox-series-xs-standard',
        'gta-vi-xbox-series-xs-ultimate',
        'gta-vi-xbox-series-xs-ultimate-upgrade'
      ) and region = '') <> 1 then
    raise exception 'GTA VI edition variants must share one catalog group';
  end if;

  if exists (
    select 1 from public.products
    where product_id = 'gta-vi-xbox-series-xs-ultimate-upgrade'
      and not (
        description like '%требуется базовая Grand Theft Auto VI%'
        and restrictions @> '["Требуется базовая версия Grand Theft Auto VI на аккаунте."]'::jsonb
      )
  ) then
    raise exception 'Ultimate Edition Upgrade must clearly require the base game';
  end if;

  if exists (
    select 1 from public.catalog_public
    where product_id like 'gta-vi-xbox-series-xs-%'
  ) then
    raise exception 'GTA VI draft variants must not be visible in the public catalog';
  end if;

  if exists (
    select 1 from public.products
    where product_id in ('gta-vi-xbox-series-xs-standard', 'gta-vi-xbox-series-xs-ultimate')
      and (
        description not like '%## Покупка игры на ваш аккаунт Xbox%'
        or description not like '%## Бонусы за предзаказ%'
        or description not like '%## Языки%'
        or description not like '%## Важная информация%'
      )
  ) then
    raise exception 'Standard and Ultimate editions must retain all structured description sections';
  end if;

  if exists (
    select 1 from public.products
    where product_id = 'gta-vi-xbox-series-xs-ultimate'
      and (
        description not like '%Rideout Customs%'
        or description not like '%Sara’s Unisex Salon%'
        or description not like '%Stock 305%'
        or description not like '%Electric Fang Tattoo%'
        or description not like '%One-Eyed Willie’s%'
      )
  ) then
    raise exception 'Ultimate Edition must include all five special locations';
  end if;

  if exists (
    select 1 from public.products
    where product_id = 'gta-vi-xbox-series-xs-ultimate-upgrade'
      and (
        description not like '%> ⚠️ **Это дополнение%'
        or description not like '%не подтверждена%'
        or description like '%до 19 ноября 2026 года%'
      )
  ) then
    raise exception 'Upgrade must warn about the base game and avoid claiming unconfirmed preorder benefits';
  end if;

  if (select count(*) from public.products
      where product_id in (
        'gta-vi-xbox-series-xs-standard',
        'gta-vi-xbox-series-xs-ultimate',
        'gta-vi-xbox-series-xs-ultimate-upgrade'
      )
        and active = false
        and availability = 'unavailable'
        and publication_status = 'draft') <> 3 then
    raise exception 'Description update must not change catalog publication or availability state';
  end if;
end;
$$;
\endif
