-- Addressless checkout for digital products. Existing address data is preserved;
-- the legacy RPC parameter stays in place for already deployed clients and is ignored.
begin;

do $$
begin
  if to_regclass('public.orders') is null then
    raise exception 'Expected public.orders before enabling addressless checkout';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'orders'
       and column_name = 'delivery_address'
  ) then
    raise exception 'Expected public.orders.delivery_address; inspect the live schema before applying';
  end if;

  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'orders'
       and column_name = 'delivery_address'
       and is_nullable = 'NO'
  ) then
    alter table public.orders alter column delivery_address drop not null;
  end if;
end;
$$;

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
    null,
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

create or replace function public.place_buyer_order(
  p_customer_name text,p_customer_phone text,p_customer_email text,p_delivery_address text,
  p_customer_comment text,p_consent boolean,p_items jsonb,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid(); v_confirmed_email text; v_reservation uuid; v_existing uuid;
  v_order public.orders%rowtype; v_item jsonb; v_product public.products%rowtype;
  v_product_id text; v_region text; v_qty integer; v_total numeric(12,2):=0;
  v_lines jsonb:='[]'::jsonb; v_count integer;
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;
  select email into v_confirmed_email from auth.users where id=v_user_id and email_confirmed_at is not null;
  if v_confirmed_email is null or lower(btrim(v_confirmed_email))<>lower(btrim(coalesce(p_customer_email,''))) then raise exception 'Use the confirmed email address on your account'; end if;
  if p_idempotency_key is null then raise exception 'Checkout request key is required'; end if;
  insert into public.order_idempotency(idempotency_key,customer_user_id) values(p_idempotency_key,v_user_id)
    on conflict do nothing returning idempotency_key into v_reservation;
  if v_reservation is null then
    select order_id into v_existing from public.order_idempotency where idempotency_key=p_idempotency_key and customer_user_id=v_user_id;
    if v_existing is null then raise exception 'Previous checkout request is still processing'; end if;
    select * into v_order from public.orders where id=v_existing;
    select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'product_name',product_name,'platform',platform,'region',region,'denomination',denomination,'denomination_currency',denomination_currency,'quantity',quantity,'unit_price',unit_price)),'[]'::jsonb)
      into v_lines from public.order_items where order_id=v_existing;
    return jsonb_build_object('id',v_order.id,'order_number',v_order.order_number,'created_at',v_order.created_at,'consent_at',v_order.consent_at,'total_amount',v_order.total_amount,'items',v_lines);
  end if;
  if p_consent is distinct from true then raise exception 'Consent is required'; end if;
  if p_customer_name is null or length(btrim(p_customer_name)) not between 2 and 100 then raise exception 'Invalid customer name'; end if;
  if p_customer_phone is null or length(btrim(p_customer_phone)) not between 5 and 40 then raise exception 'Invalid phone'; end if;
  if p_customer_comment is not null and length(p_customer_comment)>1000 then raise exception 'Comment is too long'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Items must be an array'; end if;
  v_count:=jsonb_array_length(p_items);
  if v_count<1 or v_count>20 then raise exception 'Order must contain 1 to 20 lines'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'Invalid item'; end if;
    v_product_id:=v_item->>'product_id'; v_region:=coalesce(v_item->>'region','');
    if v_product_id is null or length(v_product_id)>120 or length(v_region)>100 then raise exception 'Invalid product variant'; end if;
    if (v_item->>'quantity') is null or (v_item->>'quantity') !~ '^[0-9]{1,2}$' then raise exception 'Invalid quantity'; end if;
    v_qty:=(v_item->>'quantity')::integer;
    if v_qty not between 1 and 10 then raise exception 'Quantity must be between 1 and 10'; end if;
    select * into v_product from public.products p where p.product_id=v_product_id and p.region=v_region
      and p.active=true and p.publication_status='published' and p.availability='in_stock' for share;
    if not found then raise exception 'A product or region is unavailable: %',v_product_id; end if;
    if (v_item->>'expected_price') is null or (v_item->>'expected_price') !~ '^[0-9]+([.][0-9]{1,2})?$'
      or (v_item->>'expected_price')::numeric<>v_product.unit_price then raise exception 'Displayed price is outdated for product %',v_product_id; end if;
    v_total:=v_total+v_product.unit_price*v_qty;
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object('product_id',v_product.product_id,'product_name',v_product.title,'platform',v_product.platform,
      'region',nullif(v_product.region,''),'denomination',v_product.denomination,'denomination_currency',v_product.denomination_currency,
      'quantity',v_qty,'unit_price',v_product.unit_price));
  end loop;
  insert into public.orders(customer_name,customer_phone,customer_email,delivery_address,customer_comment,consent_at,status,total_amount,customer_user_id,payment_status,fulfillment_status)
    values(btrim(p_customer_name),btrim(p_customer_phone),lower(btrim(p_customer_email)),null,nullif(btrim(coalesce(p_customer_comment,'')),''),now(),'new',v_total,v_user_id,'unpaid','new') returning * into v_order;
  insert into public.order_items(order_id,product_id,product_name,platform,region,denomination,denomination_currency,quantity,unit_price)
    select v_order.id,x->>'product_id',x->>'product_name',x->>'platform',x->>'region',(x->>'denomination')::numeric,x->>'denomination_currency',(x->>'quantity')::integer,(x->>'unit_price')::numeric from jsonb_array_elements(v_lines) x;
  update public.order_idempotency set order_id=v_order.id where customer_user_id=v_user_id and idempotency_key=p_idempotency_key;
  perform public.log_order_action(v_order.id,'order_created','{}'::jsonb);
  return jsonb_build_object('id',v_order.id,'order_number',v_order.order_number,'created_at',v_order.created_at,'consent_at',v_order.consent_at,'total_amount',v_order.total_amount,'items',v_lines);
end;
$$;

-- Set the intended RPC ACLs explicitly; CREATE OR REPLACE retains any prior grants.
revoke all on function public.place_public_order(text,text,text,text,text,boolean,jsonb)
  from public, anon, authenticated;
grant execute on function public.place_public_order(text,text,text,text,text,boolean,jsonb) to anon, authenticated;
revoke all on function public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)
  from public, anon, authenticated;
grant execute on function public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid) to authenticated;

commit;
