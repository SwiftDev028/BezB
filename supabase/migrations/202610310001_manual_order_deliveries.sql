begin;

create table if not exists bezb_private.manual_delivery_requests (
  request_key uuid primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  request_fingerprint_hash bytea not null check (octet_length(request_fingerprint_hash) = 32),
  delivery_ids uuid[] not null default '{}'::uuid[],
  message_id uuid references public.support_messages(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists bezb_private.manual_deliveries (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  request_key uuid not null references bezb_private.manual_delivery_requests(request_key) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 200),
  activation_code text not null default '' check (length(activation_code) <= 4000),
  login text not null default '' check (length(login) <= 500),
  password text not null default '' check (length(password) <= 1000),
  additional_data text not null default '' check (length(additional_data) <= 4000),
  instructions text not null default '' check (length(instructions) <= 4000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (activation_code <> '' or login <> '' or password <> '' or additional_data <> '')
);
create index if not exists manual_deliveries_order_created_idx
  on bezb_private.manual_deliveries(order_id, created_at, id);
create index if not exists manual_deliveries_item_idx
  on bezb_private.manual_deliveries(order_item_id);

create or replace function public.admin_assign_code(p_order_id uuid, p_order_item_id uuid, p_code_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_code public.digital_codes%rowtype;
  v_assigned integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.payment_status <> 'paid' or v_order.status in ('cancelled', 'completed') then
    raise exception 'Order must be paid and active';
  end if;
  if exists (select 1 from bezb_private.manual_deliveries d where d.order_id = p_order_id) then
    raise exception 'Manual delivery has already started for this order';
  end if;
  select * into v_item from public.order_items where id = p_order_item_id and order_id = p_order_id;
  if not found then raise exception 'Order line does not belong to order'; end if;
  select * into v_code from public.digital_codes where id = p_code_id for update;
  if not found or v_code.status <> 'available'
    or v_code.product_id::text <> v_item.product_id::text
    or v_code.region <> coalesce(v_item.region, '') then
    raise exception 'Code is unavailable or does not match this product variant';
  end if;
  select count(*) into v_assigned
  from public.order_deliveries
  where order_item_id = p_order_item_id and status = 'reserved';
  if v_assigned >= v_item.quantity then raise exception 'All units of this line already have codes'; end if;
  insert into public.order_deliveries(order_id, order_item_id, digital_code_id, assigned_by)
  values (p_order_id, p_order_item_id, p_code_id, auth.uid());
  update public.digital_codes
  set status = 'reserved', assigned_order_id = p_order_id, assigned_order_item_id = p_order_item_id
  where id = p_code_id;
  update public.orders
  set fulfillment_status = 'awaiting_supplier', version = version + 1, updated_at = now()
  where id = p_order_id;
  perform public.log_order_action(
    p_order_id,
    'code_assigned',
    jsonb_build_object('code_id', p_code_id, 'order_item_id', p_order_item_id)
  );
end;
$$;

alter table bezb_private.manual_delivery_requests enable row level security;
alter table bezb_private.manual_deliveries enable row level security;
revoke all on bezb_private.manual_delivery_requests, bezb_private.manual_deliveries
  from public, anon, authenticated;

create or replace function public.support_admin_list_manual_deliveries(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id, 'order_item_id', d.order_item_id, 'title', d.title,
      'activation_code', d.activation_code, 'login', d.login, 'password', d.password,
      'additional_data', d.additional_data, 'instructions', d.instructions, 'created_at', d.created_at
    ) order by d.created_at, d.id)
    from bezb_private.manual_deliveries d
    where d.order_id = p_order_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.support_customer_list_manual_deliveries(p_order_id uuid, p_guest_token text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_thread_id uuid;
begin
  select t.id into v_thread_id
  from public.support_threads t
  where t.order_id = p_order_id
    and bezb_private.can_access_support_thread(t.id, p_guest_token);
  if v_thread_id is null then raise exception 'Support conversation unavailable'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id, 'order_item_id', d.order_item_id, 'title', d.title,
      'activation_code', d.activation_code, 'login', d.login, 'password', d.password,
      'additional_data', d.additional_data, 'instructions', d.instructions, 'created_at', d.created_at
    ) order by d.created_at, d.id)
    from bezb_private.manual_deliveries d
    where d.order_id = p_order_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.support_admin_issue_manual_deliveries(
  p_order_id uuid,
  p_request_key uuid,
  p_deliveries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_thread public.support_threads%rowtype;
  v_request bezb_private.manual_delivery_requests%rowtype;
  v_item public.order_items%rowtype;
  v_delivery jsonb;
  v_delivery_item_id uuid;
  v_title text;
  v_code text;
  v_login text;
  v_password text;
  v_additional text;
  v_instructions text;
  v_existing_count bigint;
  v_requested_count bigint;
  v_expected_count bigint;
  v_delivered_count bigint;
  v_delivery_incomplete boolean;
  v_delivery_ids uuid[] := '{}'::uuid[];
  v_message public.support_messages%rowtype;
  v_fingerprint bytea;
  v_fulfillment_status text;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_request_key is null then raise exception 'A request key is required'; end if;
  if jsonb_typeof(p_deliveries) is distinct from 'array' then
    raise exception 'Delivered items must be an array';
  end if;
  if jsonb_array_length(p_deliveries) not between 1 and 50 then
    raise exception 'Provide between 1 and 50 delivered items';
  end if;

  v_fingerprint := extensions.digest(convert_to(jsonb_build_object(
    'order_id', p_order_id, 'deliveries', p_deliveries
  )::text, 'UTF8'), 'sha256');
  insert into bezb_private.manual_delivery_requests(request_key, order_id, request_fingerprint_hash)
  values (p_request_key, p_order_id, v_fingerprint)
  on conflict (request_key) do nothing;
  select * into v_request
  from bezb_private.manual_delivery_requests
  where request_key = p_request_key
  for update;
  if v_request.order_id <> p_order_id or v_request.request_fingerprint_hash <> v_fingerprint then
    raise exception 'Request key was already used with different delivery data';
  end if;
  if cardinality(v_request.delivery_ids) > 0 then
    select fulfillment_status into v_fulfillment_status from public.orders where id = p_order_id;
    return jsonb_build_object(
      'delivery_ids', to_jsonb(v_request.delivery_ids),
      'message_id', v_request.message_id,
      'fulfillment_status', v_fulfillment_status
    );
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.payment_status <> 'paid'
    or v_order.fulfillment_status in ('delivered', 'cancelled')
    or v_order.status in ('completed', 'cancelled', 'shipped') then
    raise exception 'Order must be paid and active before manual delivery';
  end if;
  select * into v_thread from public.support_threads where order_id = p_order_id for update;
  if not found or v_thread.status <> 'open' then
    raise exception 'An open support conversation is required for delivery';
  end if;
  if exists (
    select 1 from public.order_deliveries d
    where d.order_id = p_order_id and d.status = 'reserved'
  ) then
    raise exception 'Finish or release reserved inventory codes before manual delivery';
  end if;

  for v_delivery in select value from jsonb_array_elements(p_deliveries) as entries(value) loop
    if jsonb_typeof(v_delivery) <> 'object' then raise exception 'Invalid delivered item'; end if;
    v_delivery_item_id := (v_delivery->>'order_item_id')::uuid;
    select * into v_item from public.order_items
    where id = v_delivery_item_id and order_id = p_order_id;
    if not found then raise exception 'Delivered item does not belong to this order'; end if;

    v_title := nullif(btrim(v_delivery->>'title'), '');
    v_code := coalesce(v_delivery->>'activation_code', '');
    v_login := coalesce(v_delivery->>'login', '');
    v_password := coalesce(v_delivery->>'password', '');
    v_additional := coalesce(v_delivery->>'additional_data', '');
    v_instructions := coalesce(v_delivery->>'instructions', '');
    if v_title is null or length(v_title) > 200
      or length(v_code) > 4000 or length(v_login) > 500 or length(v_password) > 1000
      or length(v_additional) > 4000 or length(v_instructions) > 4000 then
      raise exception 'Delivered item contains invalid or oversized fields';
    end if;
    if v_code = '' and v_login = '' and v_password = '' and v_additional = '' then
      raise exception 'Provide a key, account credential, or additional delivered data';
    end if;

    select count(*) into v_existing_count
    from (
      select d.id
      from public.order_deliveries d
      join public.digital_codes c
        on c.id = d.digital_code_id
       and c.assigned_order_id = d.order_id
       and c.assigned_order_item_id = d.order_item_id
      where d.order_id = p_order_id
        and d.order_item_id = v_delivery_item_id
        and d.status = 'delivered'
        and c.status = 'delivered'
      union all
      select d.id from bezb_private.manual_deliveries d
      where d.order_id = p_order_id and d.order_item_id = v_delivery_item_id
    ) delivered;
    select count(*) into v_requested_count
    from jsonb_array_elements(p_deliveries) entries(value)
    where (entries.value->>'order_item_id')::uuid = v_delivery_item_id;
    if v_existing_count + v_requested_count > v_item.quantity then
      raise exception 'Manual delivery exceeds ordered quantity for item %', v_item.id;
    end if;
  end loop;

  for v_delivery in select value from jsonb_array_elements(p_deliveries) as entries(value) loop
    insert into bezb_private.manual_deliveries(
      order_id, order_item_id, request_key, title, activation_code, login,
      password, additional_data, instructions, created_by
    ) values (
      p_order_id, (v_delivery->>'order_item_id')::uuid, p_request_key,
      btrim(v_delivery->>'title'), coalesce(v_delivery->>'activation_code', ''),
      coalesce(v_delivery->>'login', ''), coalesce(v_delivery->>'password', ''),
      coalesce(v_delivery->>'additional_data', ''), coalesce(v_delivery->>'instructions', ''),
      auth.uid()
    ) returning id into v_delivery_item_id;
    v_delivery_ids := array_append(v_delivery_ids, v_delivery_item_id);
  end loop;

  insert into public.support_messages(thread_id, sender_role, sender_id, body)
  values (
    v_thread.id, 'manager', auth.uid(),
    'BEZB_MANUAL_DELIVERY:' || jsonb_build_object('delivery_ids', to_jsonb(v_delivery_ids))::text
  )
  returning * into v_message;
  update public.support_threads
  set updated_at = now(), last_message_at = v_message.created_at
  where id = v_thread.id;

  select coalesce(sum(i.quantity), 0)::bigint into v_expected_count
  from public.order_items i where i.order_id = p_order_id;
  select coalesce(sum(delivered.item_count), 0)::bigint into v_delivered_count
  from public.order_items i
  cross join lateral (
    select
      (select count(*) from bezb_private.manual_deliveries d
       where d.order_id = p_order_id and d.order_item_id = i.id)
      + (select count(*)
         from public.order_deliveries d
         join public.digital_codes c
           on c.id = d.digital_code_id
          and c.assigned_order_id = d.order_id
          and c.assigned_order_item_id = d.order_item_id
         where d.order_id = p_order_id and d.order_item_id = i.id
           and d.status = 'delivered' and c.status = 'delivered') as item_count
  ) delivered
  where i.order_id = p_order_id;
  select coalesce(bool_or(delivered.item_count <> i.quantity), true)
  into v_delivery_incomplete
  from public.order_items i
  cross join lateral (
    select
      (select count(*) from bezb_private.manual_deliveries d
       where d.order_id = p_order_id and d.order_item_id = i.id)
      + (select count(*)
         from public.order_deliveries d
         join public.digital_codes c
           on c.id = d.digital_code_id
          and c.assigned_order_id = d.order_id
          and c.assigned_order_item_id = d.order_item_id
         where d.order_id = p_order_id and d.order_item_id = i.id
           and d.status = 'delivered' and c.status = 'delivered') as item_count
  ) delivered
  where i.order_id = p_order_id;
  if v_expected_count > 0 and v_delivered_count = v_expected_count and not v_delivery_incomplete then
    v_fulfillment_status := 'delivered';
    update public.orders
    set status = 'completed', fulfillment_status = 'delivered',
        version = version + 1, updated_at = now()
    where id = p_order_id;
  else
    v_fulfillment_status := 'processing';
    update public.orders
    set status = 'processing', fulfillment_status = 'processing',
        version = version + 1, updated_at = now()
    where id = p_order_id;
  end if;
  perform public.log_order_action(
    p_order_id,
    case when v_fulfillment_status = 'delivered' then 'digital_goods_delivered' else 'manual_delivery_started' end,
    jsonb_build_object('delivery_ids', to_jsonb(v_delivery_ids))
  );
  update bezb_private.manual_delivery_requests
  set delivery_ids = v_delivery_ids, message_id = v_message.id
  where request_key = p_request_key;
  return jsonb_build_object(
    'delivery_ids', to_jsonb(v_delivery_ids),
    'message_id', v_message.id,
    'fulfillment_status', v_fulfillment_status
  );
end;
$$;

create or replace function public.support_admin_resend_manual_delivery(p_order_id uuid, p_delivery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public.support_threads%rowtype;
  v_message public.support_messages%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into v_thread from public.support_threads where order_id = p_order_id for update;
  if not found or v_thread.status <> 'open' then raise exception 'An open support conversation is required'; end if;
  if not exists (
    select 1 from bezb_private.manual_deliveries d
    where d.id = p_delivery_id and d.order_id = p_order_id
  ) then raise exception 'Delivered item is unavailable for this order'; end if;
  insert into public.support_messages(thread_id, sender_role, sender_id, body)
  values (
    v_thread.id, 'manager', auth.uid(),
    'BEZB_MANUAL_DELIVERY:' || jsonb_build_object('delivery_ids', jsonb_build_array(p_delivery_id))::text
  )
  returning * into v_message;
  update public.support_threads
  set updated_at = now(), last_message_at = v_message.created_at
  where id = v_thread.id;
  return jsonb_build_object(
    'id', v_message.id, 'sender_role', v_message.sender_role,
    'body', v_message.body, 'created_at', v_message.created_at
  );
end;
$$;

revoke all on function public.support_admin_list_manual_deliveries(uuid) from public, anon, authenticated;
revoke all on function public.support_customer_list_manual_deliveries(uuid, text) from public, anon, authenticated;
revoke all on function public.support_admin_issue_manual_deliveries(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.support_admin_resend_manual_delivery(uuid, uuid) from public, anon, authenticated;
grant execute on function public.support_admin_list_manual_deliveries(uuid) to authenticated;
grant execute on function public.support_customer_list_manual_deliveries(uuid, text) to anon, authenticated;
grant execute on function public.support_admin_issue_manual_deliveries(uuid, uuid, jsonb) to authenticated;
grant execute on function public.support_admin_resend_manual_delivery(uuid, uuid) to authenticated;

commit;
