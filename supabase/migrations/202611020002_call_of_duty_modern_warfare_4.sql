-- Add the supplied Call of Duty: Modern Warfare 4 PS5 editions to the live
-- catalog and store their confirmed purchase costs in the private cost table.
-- No supplier mapping, digital key, or fulfillment record is created.
begin;

create temporary table cod_mw4_expected (
  product_id text primary key,
  slug text not null unique,
  title text not null,
  region text not null,
  unit_price numeric(12,2) not null,
  purchase_cost numeric(12,2) not null,
  description text not null,
  restrictions jsonb not null
) on commit drop;

insert into cod_mw4_expected (
  product_id, slug, title, region, unit_price, purchase_cost, description, restrictions
)
values
  (
    'call-of-duty-modern-warfare-4-ps5-standard',
    'call-of-duty-modern-warfare-4-ps5-standard',
    'Call of Duty: Modern Warfare 4 — Standard Edition',
    'Южная Корея',
    8400,
    7015,
    $standard$Call of Duty: Modern Warfare 4 — новая часть популярной серии военных шутеров от первого лица.

## Информация об издании
- Платформа: PlayStation 5
- Издание: Standard Edition
- Тип товара: цифровой ключ активации
- Регион активации: Южная Корея
- Дата выхода: 23 октября 2026 года
- Жанр: шутер от первого лица, мультиплеер

## Региональные ограничения
Ключ предназначен для аккаунтов PlayStation региона Южная Корея. Перед покупкой убедитесь, что ваш аккаунт соответствует региону активации.

## Получение товара
Фактическую закупку ключа и выдачу выполняет администратор вручную. Информация о выдаче появится в чате заказа.$standard$,
    '["Ключ предназначен для аккаунтов PlayStation региона Южная Корея."]'::jsonb
  ),
  (
    'call-of-duty-modern-warfare-4-ps5-vault',
    'call-of-duty-modern-warfare-4-ps5-vault',
    'Call of Duty: Modern Warfare 4 — Vault Edition',
    'США',
    8990,
    7550,
    $vault$Vault Edition — расширенное издание Call of Duty: Modern Warfare 4 с дополнительными игровыми материалами, наборами оперативников, оружием и сезонным контентом.

## Информация об издании
- Платформа: PlayStation 5
- Издание: Vault Edition
- Тип товара: цифровой ключ активации
- Регион активации: США
- Дата выхода: 23 октября 2026 года

## Дополнительный контент
- Hunter Killer — специальный облик.
- Hostile Alliance — набор оперативников: Прайс, Валерия, Гоуст и Бликс.
- Special Forces — дополнительные облики оперативников.
- Signature Weapon Collection — коллекция оружия, включающая Kastov-762 Voltspine и нож Sombra Besada.
- Gilded Pearl — дополнительный косметический контент.
- Black Sector Season 1 — сезонный контент с 20 пропусками уровней.

## Региональные ограничения
Ключ предназначен для аккаунтов PlayStation региона США. Перед покупкой убедитесь, что ваш аккаунт соответствует региону активации.

## Получение товара
Фактическую закупку ключа и выдачу выполняет администратор вручную. Информация о выдаче появится в чате заказа.$vault$,
    '["Ключ предназначен для аккаунтов PlayStation региона США."]'::jsonb
  );

do $$
declare
  v_missing text;
  v_conflicts text;
  v_constraint_expression text;
begin
  perform pg_catalog.pg_advisory_xact_lock(20261102, 2);

  if to_regclass('public.products') is null
    or to_regclass('public.catalog_public') is null
    or to_regclass('public.internal_purchase_costs') is null then
    raise exception 'Call of Duty: Modern Warfare 4 requires public.products, public.catalog_public, and public.internal_purchase_costs';
  end if;

  select string_agg(required.table_name || '.' || required.column_name, ', ' order by required.table_name, required.column_name)
    into v_missing
  from (values
    ('products','product_id'), ('products','region'), ('products','group_id'),
    ('products','slug'), ('products','title'), ('products','platform'),
    ('products','currency'), ('products','unit_price'), ('products','active'),
    ('products','description'), ('products','category'), ('products','brand'),
    ('products','product_type'), ('products','denomination'),
    ('products','denomination_currency'), ('products','image_url'),
    ('products','activation_instructions'), ('products','restrictions'),
    ('products','availability'), ('products','publication_status'),
    ('internal_purchase_costs','product_id'), ('internal_purchase_costs','region'),
    ('internal_purchase_costs','purchase_cost'), ('internal_purchase_costs','purchase_currency'),
    ('internal_purchase_costs','purchase_cost_status'), ('internal_purchase_costs','cost_updated_at'),
    ('internal_purchase_costs','internal_notes')
  ) as required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = required.table_name
      and c.column_name = required.column_name
  );
  if v_missing is not null then
    raise exception 'Call of Duty: Modern Warfare 4 requires missing columns: %', v_missing;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.products'::regclass
      and c.contype in ('p', 'u')
      and c.conkey = array[
        (select a.attnum from pg_catalog.pg_attribute a where a.attrelid = 'public.products'::regclass and a.attname = 'product_id' and not a.attisdropped),
        (select a.attnum from pg_catalog.pg_attribute a where a.attrelid = 'public.products'::regclass and a.attname = 'region' and not a.attisdropped)
      ]::smallint[]
  ) or not exists (
    select 1
    from pg_catalog.pg_index i
    where i.indrelid = 'public.products'::regclass
      and i.indisunique and i.indisvalid
      and i.indpred is null and i.indexprs is null and i.indnkeyatts = 1
      and i.indkey[0] = (
        select a.attnum
        from pg_catalog.pg_attribute a
        where a.attrelid = 'public.products'::regclass
          and a.attname = 'slug' and not a.attisdropped
      )
  ) then
    raise exception 'Call of Duty: Modern Warfare 4 requires unique product variants and slugs';
  end if;

  select regexp_replace(
      regexp_replace(
        lower(pg_catalog.pg_get_expr(c.conbin, c.conrelid)),
        '::(pg_catalog\.)?(numeric(\([0-9, ]+\))?|text(\[\])?|boolean)',
        '',
        'g'
      ),
      '[[:space:]()]',
      '',
      'g'
    )
    into v_constraint_expression
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.products'::regclass
    and c.conname = 'products_active_publication_check'
    and c.contype = 'c'
    and c.convalidated;
  if v_constraint_expression is distinct from
    'active=publication_status=''published''andavailability=''in_stock''' then
    raise exception 'Call of Duty: Modern Warfare 4 requires the existing validated product publication, type, and category constraints';
  end if;

  select regexp_replace(
      regexp_replace(
        lower(pg_catalog.pg_get_expr(c.conbin, c.conrelid)),
        '::(pg_catalog\.)?(numeric(\([0-9, ]+\))?|text(\[\])?|boolean)',
        '',
        'g'
      ),
      '[[:space:]()]',
      '',
      'g'
    )
    into v_constraint_expression
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.products'::regclass
    and c.conname = 'products_type_check'
    and c.contype = 'c'
    and c.convalidated;
  if v_constraint_expression is distinct from
    'product_type=anyarray[''gift-card'',''game'',''subscription'',''topup'']' then
    raise exception 'Call of Duty: Modern Warfare 4 requires the existing validated product type constraint';
  end if;

  select regexp_replace(
      regexp_replace(
        lower(pg_catalog.pg_get_expr(c.conbin, c.conrelid)),
        '::(pg_catalog\.)?(numeric(\([0-9, ]+\))?|text(\[\])?|boolean)',
        '',
        'g'
      ),
      '[[:space:]()]',
      '',
      'g'
    )
    into v_constraint_expression
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.products'::regclass
    and c.conname = 'products_category_check'
    and c.contype = 'c'
    and c.convalidated;
  if v_constraint_expression is distinct from
    'category=anyarray[''apple'',''xbox'',''playstation'',''steam'',''ai'']' then
    raise exception 'Call of Duty: Modern Warfare 4 requires the existing validated product category constraint';
  end if;

  if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.internal_purchase_costs'::regclass)
    or has_table_privilege('anon', 'public.internal_purchase_costs', 'select')
    or has_table_privilege('anon', 'public.internal_purchase_costs', 'insert')
    or has_table_privilege('anon', 'public.internal_purchase_costs', 'update')
    or has_table_privilege('anon', 'public.internal_purchase_costs', 'delete') then
    raise exception 'internal_purchase_costs must retain RLS and deny anon access';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    where c.oid = 'public.catalog_public'::regclass
      and c.relkind = 'v'
  ) then
    raise exception 'public.catalog_public must remain a view';
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'catalog_public'
      and c.column_name in ('purchase_cost', 'purchase_currency', 'purchase_cost_status', 'internal_notes', 'supplier_id')
  ) or position('internal_purchase_costs' in lower(pg_catalog.pg_get_viewdef('public.catalog_public'::regclass, true))) > 0 then
    raise exception 'catalog_public must not expose internal purchase costs';
  end if;

  with conflicts as (
    select e.product_id
    from cod_mw4_expected e
    left join public.products p
      on p.product_id = e.product_id or p.slug = e.slug
    group by e.product_id
    having count(p.product_id) > 0
      and count(p.product_id) filter (where
        p.product_id = e.product_id
        and p.region = e.region
        and p.slug = e.slug
        and p.title = e.title
        and p.platform = 'PlayStation 5'
        and p.currency = 'RUB'
        and p.unit_price = e.unit_price
        and p.active = true
        and p.description = e.description
        and p.category = 'playstation'
        and p.brand = 'Call of Duty'
        and p.product_type = 'game'
        and p.denomination is null
        and p.denomination_currency is null
        and p.image_url is null
        and p.activation_instructions = ''
        and p.restrictions = e.restrictions
        and p.availability = 'in_stock'
        and p.publication_status = 'published'
      ) <> count(p.product_id)
  )
  select string_agg(product_id, ', ' order by product_id)
    into v_conflicts
  from conflicts;
  if v_conflicts is not null then
    raise exception 'Call of Duty product IDs or slugs conflict with existing catalog rows: %', v_conflicts;
  end if;

  if exists (
    select 1
    from public.products p
    where p.product_id in (
      'call-of-duty-modern-warfare-4-ps5-standard',
      'call-of-duty-modern-warfare-4-ps5-vault'
    )
      and p.region in ('Южная Корея', 'США')
    having count(distinct p.group_id) > 1
       or bool_or(p.group_id is null)
  ) then
    raise exception 'Existing Call of Duty editions must share one non-null group_id';
  end if;

  if exists (
    select 1
    from public.products p
    where p.group_id in (
      select distinct group_id
      from public.products
      where product_id in (
        'call-of-duty-modern-warfare-4-ps5-standard',
        'call-of-duty-modern-warfare-4-ps5-vault'
      )
        and region in ('Южная Корея', 'США')
    )
      and p.product_id not in (
        'call-of-duty-modern-warfare-4-ps5-standard',
        'call-of-duty-modern-warfare-4-ps5-vault'
      )
  ) then
    raise exception 'Call of Duty editions must not reuse a group_id assigned to unrelated products';
  end if;

  select string_agg(e.product_id, ', ' order by e.product_id)
    into v_conflicts
  from cod_mw4_expected e
  join public.internal_purchase_costs c
    on c.product_id = e.product_id and c.region = e.region
  where c.purchase_cost is distinct from e.purchase_cost
    or c.purchase_currency is distinct from 'RUB'
    or c.purchase_cost_status is distinct from 'confirmed';
  if v_conflicts is not null then
    raise exception 'Existing internal purchase costs conflict with supplied values: %', v_conflicts;
  end if;
end;
$$;

with new_group as (
  select coalesce(
    (
      select min(group_id::text)::uuid
      from public.products
      where product_id in (
        'call-of-duty-modern-warfare-4-ps5-standard',
        'call-of-duty-modern-warfare-4-ps5-vault'
      )
        and region in ('Южная Корея', 'США')
    ),
    gen_random_uuid()
  ) as group_id
)
insert into public.products (
  product_id, region, group_id, slug, title, platform, currency, unit_price, active,
  description, category, brand, product_type, denomination, denomination_currency,
  image_url, activation_instructions, restrictions, availability, publication_status
)
select
  e.product_id, e.region, g.group_id, e.slug, e.title, 'PlayStation 5', 'RUB',
  e.unit_price, true, e.description, 'playstation', 'Call of Duty', 'game',
  null, null, null, '', e.restrictions, 'in_stock', 'published'
from cod_mw4_expected e
cross join new_group g
on conflict (product_id, region) do nothing;

insert into public.internal_purchase_costs (
  product_id, region, purchase_cost, purchase_currency, purchase_cost_status,
  cost_updated_at, internal_notes
)
select
  e.product_id, e.region, e.purchase_cost, 'RUB', 'confirmed', now(),
  'Подтверждённая закупочная себестоимость; поставщик не привязан.'
from cod_mw4_expected e
on conflict (product_id, region) do nothing;

do $$
declare
  v_missing text;
begin
  select string_agg(e.product_id, ', ' order by e.product_id)
    into v_missing
  from cod_mw4_expected e
  left join public.products p
    on p.product_id = e.product_id and p.region = e.region
  left join public.catalog_public c
    on c.product_id = e.product_id and c.region = e.region
  left join public.internal_purchase_costs cost
    on cost.product_id = e.product_id and cost.region = e.region
  where p.product_id is null
    or c.product_id is null
    or p.slug is distinct from e.slug
    or p.title is distinct from e.title
    or p.unit_price is distinct from e.unit_price
    or p.publication_status is distinct from 'published'
    or p.availability is distinct from 'in_stock'
    or cost.purchase_cost is distinct from e.purchase_cost
    or cost.purchase_currency is distinct from 'RUB'
    or cost.purchase_cost_status is distinct from 'confirmed';
  if v_missing is not null then
    raise exception 'Call of Duty catalog or internal cost verification failed for: %', v_missing;
  end if;
end;
$$;

commit;
