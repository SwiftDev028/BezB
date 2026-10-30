-- Add ChatGPT subscription variants as unpublished, unavailable catalog drafts.
-- Existing product data, subscription constraints, public views, and checkout
-- RPCs are intentionally left unchanged.
begin;

do $$
declare
  v_conflicts text;
  v_months_type text;
  v_bonus_type text;
begin
  if to_regclass('public.products') is null then
    raise exception 'Expected public.products before adding ChatGPT catalog drafts';
  end if;

  select pg_catalog.format_type(a.atttypid, a.atttypmod)
    into v_months_type
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.products'::regclass
    and a.attname = 'subscription_months'
    and a.attnum > 0
    and not a.attisdropped;

  select pg_catalog.format_type(a.atttypid, a.atttypmod)
    into v_bonus_type
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.products'::regclass
    and a.attname = 'subscription_bonus_months'
    and a.attnum > 0
    and not a.attisdropped;

  if v_months_type is distinct from 'smallint'
     or v_bonus_type is distinct from 'smallint' then
    raise exception 'Expected products subscription term columns from migration 202610220003; found %, %',
      coalesce(v_months_type, '<missing>'),
      coalesce(v_bonus_type, '<missing>');
  end if;

  -- Permit reruns only when the previously seeded rows still match this seed.
  -- Any unrelated ID/slug collision aborts without changing existing products.
  with expected(product_id, slug, title, unit_price, subscription_months) as (
    values
      ('chatgpt-go-1-month', 'chatgpt-go-1-month', 'ChatGPT Go — 1 месяц', 1100, 1),
      ('chatgpt-plus-1-month', 'chatgpt-plus-1-month', 'ChatGPT Plus — 1 месяц', 2440, 1),
      ('chatgpt-pro-100-1-month', 'chatgpt-pro-100-1-month', 'ChatGPT Pro 100 — 1 месяц', 12320, 1),
      ('chatgpt-pro-200-1-month', 'chatgpt-pro-200-1-month', 'ChatGPT Pro 200 — 1 месяц', 21130, 1),
      ('chatgpt-pro-500-1-month', 'chatgpt-pro-500-1-month', 'ChatGPT Pro 500 — 1 месяц', 59880, 1)
  ),
  conflicts as (
    select e.product_id
    from expected e
    left join public.products p
      on p.product_id = e.product_id
      or p.slug = e.slug
    group by e.product_id
    having count(p.product_id) > 0
       and (
         count(p.product_id) > 1
         or count(p.product_id) filter (where
           p.product_id = e.product_id
           and p.region = ''
           and p.slug = e.slug
           and p.title = e.title
           and p.platform = 'ChatGPT'
           and p.currency = 'RUB'
           and p.unit_price = e.unit_price
           and p.active = false
           and p.description = case e.product_id
             when 'chatgpt-go-1-month' then 'Подписка ChatGPT Go на 1 месяц.'
             when 'chatgpt-plus-1-month' then 'Подписка ChatGPT Plus на 1 месяц.'
             when 'chatgpt-pro-100-1-month' then 'Вариант ChatGPT Pro 100 на 1 месяц.'
             when 'chatgpt-pro-200-1-month' then 'Вариант ChatGPT Pro 200 на 1 месяц.'
             else 'Вариант ChatGPT Pro 500 на 1 месяц.'
           end
           and p.category = 'ai'
           and p.brand = 'ChatGPT'
           and p.product_type = 'subscription'
           and p.subscription_months = e.subscription_months
           and p.subscription_bonus_months = 0
           and p.availability = 'unavailable'
           and p.publication_status = 'draft'
           and p.activation_instructions = ''
         ) <> count(p.product_id)
       )
  )
  select string_agg(product_id, ', ' order by product_id)
    into v_conflicts
  from conflicts;

  if v_conflicts is not null then
    raise exception 'ChatGPT catalog seed conflicts with existing products: %', v_conflicts;
  end if;
end;
$$;

insert into public.products (
  product_id, region, title, platform, currency, unit_price, active,
  slug, description, category, brand, product_type,
  subscription_months, subscription_bonus_months,
  availability, publication_status, activation_instructions
)
values
  (
    'chatgpt-go-1-month', '', 'ChatGPT Go — 1 месяц',
    'ChatGPT', 'RUB', 1100, false,
    'chatgpt-go-1-month',
    'Подписка ChatGPT Go на 1 месяц.',
    'ai', 'ChatGPT', 'subscription',
    1, 0, 'unavailable', 'draft', ''
  ),
  (
    'chatgpt-plus-1-month', '', 'ChatGPT Plus — 1 месяц',
    'ChatGPT', 'RUB', 2440, false,
    'chatgpt-plus-1-month',
    'Подписка ChatGPT Plus на 1 месяц.',
    'ai', 'ChatGPT', 'subscription',
    1, 0, 'unavailable', 'draft', ''
  ),
  (
    'chatgpt-pro-100-1-month', '', 'ChatGPT Pro 100 — 1 месяц',
    'ChatGPT', 'RUB', 12320, false,
    'chatgpt-pro-100-1-month',
    'Вариант ChatGPT Pro 100 на 1 месяц.',
    'ai', 'ChatGPT', 'subscription',
    1, 0, 'unavailable', 'draft', ''
  ),
  (
    'chatgpt-pro-200-1-month', '', 'ChatGPT Pro 200 — 1 месяц',
    'ChatGPT', 'RUB', 21130, false,
    'chatgpt-pro-200-1-month',
    'Вариант ChatGPT Pro 200 на 1 месяц.',
    'ai', 'ChatGPT', 'subscription',
    1, 0, 'unavailable', 'draft', ''
  ),
  (
    'chatgpt-pro-500-1-month', '', 'ChatGPT Pro 500 — 1 месяц',
    'ChatGPT', 'RUB', 59880, false,
    'chatgpt-pro-500-1-month',
    'Вариант ChatGPT Pro 500 на 1 месяц.',
    'ai', 'ChatGPT', 'subscription',
    1, 0, 'unavailable', 'draft', ''
  )
on conflict (product_id, region) do nothing;

commit;
