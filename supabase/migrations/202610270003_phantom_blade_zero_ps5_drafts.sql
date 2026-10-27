-- Add the supplied Phantom Blade Zero PS5 editions as non-purchasable drafts.
-- No supplier, purchase cost, image, publication, or fulfillment data is created.
begin;

create temporary table phantom_blade_zero_expected (
  product_id text not null,
  slug text not null,
  title text not null,
  unit_price numeric not null,
  description text not null
) on commit drop;

insert into phantom_blade_zero_expected (product_id, slug, title, unit_price, description)
values
  (
    'phantom-blade-zero-ps5-standard',
    'phantom-blade-zero-ps5-standard',
    'Phantom Blade Zero — Standard Edition',
    7200,
    $desc$## Об игре
Phantom Blade Zero — мрачный экшен-RPG в стилистике уся на Unreal Engine 5. Соула обвиняют в убийстве наставника. Получив смертельное ранение в сердце, он располагает всего 66 днями, чтобы раскрыть заговор в Улине.

Боевая система построена на ритме кунг-фу: синие приёмы Brutal необходимо парировать, а красные Killer — обходить с помощью Ghoststep, чтобы оказаться за спиной противника. В арсенале — более 30 видов оружия и около 20 призрачных орудий.

## Платформа и язык
Версия для PlayStation 5. В игре есть русские субтитры, но нет русской озвучки. Также доступны версии для Steam и Epic Games; товары этих платформ в BezB этим сценарием не создаются.

## Издание
Standard Edition.

## Инструкция по покупке
1. Выберите нужное издание игры и оформите заказ.
2. После оформления менеджер сообщит дальнейшие шаги для получения игры.
3. Не отправляйте пароль от аккаунта PlayStation, резервные коды двухэтапной аутентификации или другие секретные данные в чат.
4. Если для получения игры требуется вход в аккаунт или дополнительные действия на консоли, выполняйте их самостоятельно по безопасной инструкции.

Отдельная услуга создания аккаунта, если она понадобится и будет доступна, может стоить 300 RUB. Она не является частью этого товара и не включается в заказ автоматически.$desc$
  ),
  (
    'phantom-blade-zero-ps5-digital-deluxe',
    'phantom-blade-zero-ps5-digital-deluxe',
    'Phantom Blade Zero — Digital Deluxe Edition',
    12000,
    $desc$## Об игре
Phantom Blade Zero — мрачный экшен-RPG в стилистике уся на Unreal Engine 5. Соула обвиняют в убийстве наставника. Получив смертельное ранение в сердце, он располагает всего 66 днями, чтобы раскрыть заговор в Улине.

Боевая система построена на ритме кунг-фу: синие приёмы Brutal необходимо парировать, а красные Killer — обходить с помощью Ghoststep, чтобы оказаться за спиной противника. В арсенале — более 30 видов оружия и около 20 призрачных орудий.

## Платформа и язык
Версия для PlayStation 5. В игре есть русские субтитры, но нет русской озвучки. Также доступны версии для Steam и Epic Games; товары этих платформ в BezB этим сценарием не создаются.

## Издание
Digital Deluxe Edition включает дополнительные материалы. Их состав здесь не уточняется.

## Инструкция по покупке
1. Выберите нужное издание игры и оформите заказ.
2. После оформления менеджер сообщит дальнейшие шаги для получения игры.
3. Не отправляйте пароль от аккаунта PlayStation, резервные коды двухэтапной аутентификации или другие секретные данные в чат.
4. Если для получения игры требуется вход в аккаунт или дополнительные действия на консоли, выполняйте их самостоятельно по безопасной инструкции.

Отдельная услуга создания аккаунта, если она понадобится и будет доступна, может стоить 300 RUB. Она не является частью этого товара и не включается в заказ автоматически.$desc$
  );

do $$
declare
  v_missing text;
  v_type_mismatches text;
  v_conflicts text;
begin
  if to_regclass('public.products') is null then
    raise exception 'Expected public.products before adding Phantom Blade Zero drafts';
  end if;

  select string_agg(required.column_name, ', ' order by required.column_name)
    into v_missing
  from (values
    ('product_id'), ('region'), ('group_id'), ('slug'), ('title'), ('platform'),
    ('currency'), ('unit_price'), ('active'), ('description'), ('category'),
    ('brand'), ('product_type'), ('denomination'), ('denomination_currency'),
    ('image_url'), ('activation_instructions'), ('restrictions'),
    ('availability'), ('publication_status')
  ) as required(column_name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'products'
      and c.column_name = required.column_name
  );
  if v_missing is not null then
    raise exception 'Phantom Blade Zero drafts require missing public.products columns: %', v_missing;
  end if;

  select string_agg(required.column_name || '=' ||
      pg_catalog.format_type(a.atttypid, a.atttypmod), ', ' order by required.column_name)
    into v_type_mismatches
  from (values
    ('product_id', 'text'), ('region', 'text'), ('group_id', 'uuid'), ('slug', 'text'),
    ('title', 'text'), ('platform', 'text'), ('currency', 'text'), ('unit_price', 'numeric'),
    ('active', 'boolean'), ('description', 'text'), ('category', 'text'), ('brand', 'text'),
    ('product_type', 'text'), ('denomination', 'numeric'), ('denomination_currency', 'text'),
    ('image_url', 'text'), ('activation_instructions', 'text'), ('restrictions', 'jsonb'),
    ('availability', 'text'), ('publication_status', 'text')
  ) as required(column_name, expected_type)
  join pg_catalog.pg_attribute a
    on a.attrelid = 'public.products'::regclass
   and a.attname = required.column_name
   and a.attnum > 0 and not a.attisdropped
  where case
    when required.expected_type = 'numeric' then a.atttypid is distinct from 'numeric'::regtype
    else pg_catalog.format_type(a.atttypid, a.atttypmod) is distinct from required.expected_type
  end;
  if v_type_mismatches is not null then
    raise exception 'Phantom Blade Zero drafts found incompatible public.products column types: %', v_type_mismatches;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.products'::regclass and c.contype = 'p'
      and c.conkey = array[
        (select a.attnum from pg_catalog.pg_attribute a where a.attrelid = 'public.products'::regclass and a.attname = 'product_id' and not a.attisdropped),
        (select a.attnum from pg_catalog.pg_attribute a where a.attrelid = 'public.products'::regclass and a.attname = 'region' and not a.attisdropped)
      ]::smallint[]
  ) or not exists (
    select 1 from pg_catalog.pg_index i
    where i.indrelid = 'public.products'::regclass and i.indisunique and i.indisvalid
      and i.indpred is null and i.indexprs is null and i.indnkeyatts = 1
      and i.indkey[0] = (
        select a.attnum from pg_catalog.pg_attribute a
        where a.attrelid = 'public.products'::regclass and a.attname = 'slug' and not a.attisdropped
      )
  ) then
    raise exception 'Phantom Blade Zero drafts require unique product variants and slugs';
  end if;

  if exists (
    select 1
    from (values
      ('products_unit_price_check', 'unit_price', '>', '0'),
      ('products_currency_check', 'currency', 'rub', ''),
      ('products_category_check', 'category', 'playstation', ''),
      ('products_type_check', 'product_type', 'game', ''),
      ('products_availability_check', 'availability', 'in_stock', ''),
      ('products_publication_status_check', 'publication_status', 'published', ''),
      ('products_active_publication_check', 'active', 'publication_status', 'availability')
    ) required(constraint_name, token_one, token_two, token_three)
    where not exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = 'public.products'::regclass
        and c.conname = required.constraint_name and c.contype = 'c' and c.convalidated
        and position(required.token_one in lower(pg_catalog.pg_get_constraintdef(c.oid))) > 0
        and position(required.token_two in lower(pg_catalog.pg_get_constraintdef(c.oid))) > 0
        and position(required.token_three in lower(pg_catalog.pg_get_constraintdef(c.oid))) > 0
    )
  ) then
    raise exception 'Phantom Blade Zero drafts require the existing validated catalog checks for price, currency, classification, and publication state';
  end if;

  with conflicts as (
    select e.product_id
    from phantom_blade_zero_expected e
    left join public.products p
      on p.product_id = e.product_id or p.slug = e.slug
    group by e.product_id
    having count(p.product_id) > 0
       and count(p.product_id) filter (where
         p.product_id = e.product_id
         and p.region = ''
         and p.slug = e.slug
         and p.title = e.title
         and p.platform = 'PlayStation 5'
         and p.currency = 'RUB'
         and p.unit_price = e.unit_price
         and p.active = false
         and p.description = e.description
         and p.category = 'playstation'
         and p.brand = ''
         and p.product_type = 'game'
         and p.denomination is null
         and p.denomination_currency is null
         and p.image_url is null
         and p.activation_instructions = ''
         and p.restrictions = '["Русской озвучки нет."]'::jsonb
         and p.availability = 'unavailable'
         and p.publication_status = 'draft'
       ) <> count(p.product_id)
  )
  select string_agg(product_id, ', ' order by product_id)
    into v_conflicts
  from conflicts;

  if v_conflicts is not null then
    raise exception 'Phantom Blade Zero product IDs/slugs conflict with existing catalog data: %', v_conflicts;
  end if;

  if exists (
    select 1
    from public.products
    where region = ''
      and product_id in (
        'phantom-blade-zero-ps5-standard',
        'phantom-blade-zero-ps5-digital-deluxe'
      )
    having count(distinct group_id) > 1 or bool_or(group_id is null)
  ) then
    raise exception 'Existing Phantom Blade Zero editions must share one non-null group_id';
  end if;

  if exists (
    select 1
    from public.products p
    where p.group_id in (
      select distinct group_id
      from public.products
      where region = ''
        and product_id in (
          'phantom-blade-zero-ps5-standard',
          'phantom-blade-zero-ps5-digital-deluxe'
        )
    )
      and p.product_id not in (
        'phantom-blade-zero-ps5-standard',
        'phantom-blade-zero-ps5-digital-deluxe'
      )
  ) then
    raise exception 'Phantom Blade Zero editions must not reuse a group_id assigned to unrelated products';
  end if;
end;
$$;

with new_group as (
  select coalesce(
    (select min(group_id::text)::uuid
     from public.products
     where region = ''
       and product_id in (
         'phantom-blade-zero-ps5-standard',
         'phantom-blade-zero-ps5-digital-deluxe'
       )),
    gen_random_uuid()
  ) as group_id
)
insert into public.products (
  product_id, region, group_id, title, platform, currency, unit_price, active,
  slug, description, category, brand, product_type,
  denomination, denomination_currency, image_url, activation_instructions, restrictions,
  availability, publication_status
)
select
  e.product_id, '', g.group_id, e.title, 'PlayStation 5', 'RUB', e.unit_price, false,
  e.slug, e.description, 'playstation', '', 'game',
  null, null, null, '', '["Русской озвучки нет."]'::jsonb, 'unavailable', 'draft'
from phantom_blade_zero_expected e
cross join new_group g
on conflict (product_id, region) do nothing;

commit;
