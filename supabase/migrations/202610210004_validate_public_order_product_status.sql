begin;

create or replace function public.place_public_order(
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_delivery_address text,
  p_customer_comment text,
  p_consent boolean,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id text;
  v_region text;
  v_qty integer;
  v_total numeric(12,2) := 0;
  v_lines jsonb := '[]'::jsonb;
  v_count integer;
begin
  if p_consent is distinct from true then
    raise exception 'Consent is required';
  end if;

  if p_customer_name is null or length(btrim(p_customer_name)) not between 2 and 100 then
    raise exception 'Invalid customer name';
  end if;

  if p_customer_phone is null or length(btrim(p_customer_phone)) not between 5 and 40 then
    raise exception 'Invalid phone';
  end if;

  if p_customer_email is null
    or length(btrim(p_customer_email)) > 254
    or p_customer_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]{2,}$'
  then
    raise exception 'Invalid email';
  end if;

  if p_delivery_address is null or length(btrim(p_delivery_address)) not between 3 and 500 then
    raise exception 'Invalid delivery details';
  end if;

  if p_customer_comment is not null and length(p_customer_comment) > 1000 then
    raise exception 'Comment is too long';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Items must be an array';
  end if;

  v_count := jsonb_array_length(p_items);

  if v_count < 1 or v_count > 20 then
    raise exception 'Order must contain 1 to 20 lines';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Invalid item';
    end if;

    v_product_id := v_item->>'product_id';
    v_region := coalesce(v_item->>'region', '');

    if v_product_id is null or length(v_product_id) > 120 or length(v_region) > 100 then
      raise exception 'Invalid product variant';
    end if;

    if (v_item->>'quantity') is null or (v_item->>'quantity') !~ '^[0-9]{1,2}$' then
      raise exception 'Invalid quantity';
    end if;

    v_qty := (v_item->>'quantity')::integer;

    if v_qty not between 1 and 10 then
      raise exception 'Quantity must be between 1 and 10';
    end if;

    select *
      into v_product
      from public.products p
     where p.product_id = v_product_id
       and p.region = v_region
       and p.active = true
       and p.publication_status = 'published'
       and p.availability = 'in_stock'
     for share;

    if not found then
      raise exception 'A product or region is unavailable: %', v_product_id;
    end if;

    if (v_item->>'expected_price') is null
      or (v_item->>'expected_price') !~ '^[0-9]+([.][0-9]{1,2})?$'
      or (v_item->>'expected_price')::numeric <> v_product.unit_price
    then
      raise exception 'The displayed price for product % is outdated. Refresh the catalog before ordering.', v_product_id;
    end if;

    v_total := v_total + v_product.unit_price * v_qty;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.product_id,
      'product_name', v_product.title,
      'platform', v_product.platform,
      'region', nullif(v_product.region, ''),
      'denomination', v_product.denomination,
      'denomination_currency', v_product.denomination_currency,
      'quantity', v_qty,
      'unit_price', v_product.unit_price
    ));
  end loop;

  insert into public.orders (
    customer_name,
    customer_phone,
    customer_email,
    delivery_address,
    customer_comment,
    consent_at,
    status,
    total_amount
  )
  values (
    btrim(p_customer_name),
    btrim(p_customer_phone),
    lower(btrim(p_customer_email)),
    btrim(p_delivery_address),
    nullif(btrim(coalesce(p_customer_comment, '')), ''),
    now(),
    'new',
    v_total
  )
  returning * into v_order;

  insert into public.order_items (
    order_id,
    product_id,
    product_name,
    platform,
    region,
    denomination,
    denomination_currency,
    quantity,
    unit_price
  )
  select
    v_order.id,
    x->>'product_id',
    x->>'product_name',
    x->>'platform',
    x->>'region',
    (x->>'denomination')::numeric,
    x->>'denomination_currency',
    (x->>'quantity')::integer,
    (x->>'unit_price')::numeric
  from jsonb_array_elements(v_lines) x;

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'created_at', v_order.created_at,
    'consent_at', v_order.consent_at,
    'total_amount', v_order.total_amount,
    'items', v_lines
  );
end;
$$;

revoke all on function public.place_public_order(
  text, text, text, text, text, boolean, jsonb
) from public, anon, authenticated;

grant execute on function public.place_public_order(
  text, text, text, text, text, boolean, jsonb
) to anon, authenticated;

commit;
