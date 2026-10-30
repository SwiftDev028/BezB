-- Persistent per-order support conversations. Existing checkout RPC signatures
-- stay intact; support-aware wrappers call them in the same transaction.
begin;

create extension if not exists pgcrypto with schema extensions;
create schema if not exists bezb_private;
revoke all on schema bezb_private from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.place_public_order(text,text,text,text,text,boolean,jsonb)') is null
     or to_regprocedure('public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('extensions.digest(bytea,text)') is null
     or to_regprocedure('extensions.gen_random_bytes(integer)') is null then
    raise exception 'Support chat requires the existing checkout/admin RPCs and pgcrypto in schema extensions';
  end if;
  if not (select prosecdef from pg_proc where oid = to_regprocedure('public.place_public_order(text,text,text,text,text,boolean,jsonb)'))
     or not (select prosecdef from pg_proc where oid = to_regprocedure('public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)')) then
    raise exception 'Checkout RPCs must remain SECURITY DEFINER functions';
  end if;
end;
$$;

create table if not exists public.support_threads (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  status text not null default 'open' check (status in ('open', 'closed')),
  guest_token_hash bytea,
  guest_access_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);
create index if not exists support_threads_status_last_message_idx
  on public.support_threads(status, last_message_at desc nulls last, created_at desc);

create table if not exists public.support_messages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete restrict,
  sender_role text not null check (sender_role in ('customer', 'manager')),
  sender_id uuid references auth.users(id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  read_by_customer_at timestamptz,
  read_by_manager_at timestamptz
);
create table if not exists public.support_guest_checkout_requests (
  idempotency_key_hash bytea primary key check (octet_length(idempotency_key_hash) = 32),
  request_fingerprint_hash bytea not null check (octet_length(request_fingerprint_hash) = 32),
  order_id uuid unique references public.orders(id) on delete restrict,
  response_payload jsonb,
  created_at timestamptz not null default now(),
  constraint support_guest_checkout_request_result_consistency check (
    (order_id is null and response_payload is null)
    or (order_id is not null and response_payload is not null)
  )
);
create index if not exists support_messages_thread_created_idx
  on public.support_messages(thread_id, created_at, id);
create index if not exists support_messages_unread_manager_idx
  on public.support_messages(thread_id, created_at) where sender_role = 'customer' and read_by_manager_at is null;
create index if not exists support_messages_unread_customer_idx
  on public.support_messages(thread_id, created_at) where sender_role = 'manager' and read_by_customer_at is null;

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_guest_checkout_requests enable row level security;

drop policy if exists "Support thread owner or admin read" on public.support_threads;
create policy "Support thread owner or admin read" on public.support_threads
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = support_threads.order_id and o.customer_user_id = (select auth.uid())
    )
  );
drop policy if exists "Support message owner or admin read" on public.support_messages;
create policy "Support message owner or admin read" on public.support_messages
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1
      from public.support_threads t
      join public.orders o on o.id = t.order_id
      where t.id = support_messages.thread_id and o.customer_user_id = (select auth.uid())
    )
  );

revoke all on public.support_threads, public.support_messages, public.support_guest_checkout_requests from public, anon, authenticated;

create or replace function bezb_private.ensure_support_thread(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread_id uuid;
begin
  insert into public.support_threads(order_id)
  values (p_order_id)
  on conflict (order_id) do update set order_id = excluded.order_id
  returning id into v_thread_id;
  return v_thread_id;
end;
$$;

create or replace function bezb_private.create_support_thread_for_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform bezb_private.ensure_support_thread(new.id);
  return new;
end;
$$;

drop trigger if exists orders_create_support_thread on public.orders;
create trigger orders_create_support_thread
  after insert on public.orders
  for each row execute function bezb_private.create_support_thread_for_order();

create or replace function bezb_private.revoke_guest_support_on_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.customer_user_id is null and new.customer_user_id is not null then
    update public.support_threads
    set guest_token_hash = null,
        guest_access_revoked_at = now(),
        updated_at = now()
    where order_id = new.id and guest_token_hash is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_revoke_guest_support_on_claim on public.orders;
create trigger orders_revoke_guest_support_on_claim
  after update of customer_user_id on public.orders
  for each row
  when (old.customer_user_id is null and new.customer_user_id is not null)
  execute function bezb_private.revoke_guest_support_on_claim();

insert into public.support_threads(order_id)
select o.id from public.orders o
on conflict (order_id) do nothing;

create or replace function bezb_private.issue_guest_token(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_thread_id uuid;
begin
  select t.id into v_thread_id
  from public.support_threads t
  join public.orders o on o.id = t.order_id
  where t.order_id = p_order_id and o.customer_user_id is null
  for update of t;
  if v_thread_id is null then raise exception 'Guest support thread unavailable'; end if;
  update public.support_threads
  set guest_token_hash = extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
      guest_access_revoked_at = null,
      updated_at = now()
  where id = v_thread_id;
  return v_token;
end;
$$;

create or replace function bezb_private.can_access_support_thread(p_thread_id uuid, p_guest_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.support_threads t
    join public.orders o on o.id = t.order_id
    where t.id = p_thread_id
      and (
        (auth.uid() is not null and o.customer_user_id = (select auth.uid()))
        or (
          o.customer_user_id is null
          and
          p_guest_token ~ '^[0-9a-f]{64}$'
          and t.guest_access_revoked_at is null
          and t.guest_token_hash = extensions.digest(convert_to(p_guest_token, 'UTF8'), 'sha256')
        )
      )
  );
$$;

drop function if exists public.place_public_order_with_support(text,text,text,text,text,boolean,jsonb);
create function public.place_public_order_with_support(
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_delivery_address text,
  p_customer_comment text,
  p_consent boolean,
  p_items jsonb,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order jsonb;
  v_token text;
  v_order_id uuid;
  v_key_hash bytea;
  v_fingerprint_hash bytea;
  v_request public.support_guest_checkout_requests%rowtype;
begin
  if p_idempotency_key is null
    or p_idempotency_key::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'A random checkout request key is required';
  end if;

  v_key_hash := extensions.digest(convert_to(p_idempotency_key::text, 'UTF8'), 'sha256');
  v_fingerprint_hash := extensions.digest(convert_to(jsonb_build_object(
    'customer_name', p_customer_name,
    'customer_phone', p_customer_phone,
    'customer_email', p_customer_email,
    'delivery_address', p_delivery_address,
    'customer_comment', p_customer_comment,
    'consent', p_consent,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', item.value->>'product_id',
        'region', coalesce(item.value->>'region', ''),
        'quantity', item.value->'quantity',
        'expected_price', item.value->'expected_price'
      ) order by item.value->>'product_id', coalesce(item.value->>'region', ''), item.value->>'quantity', item.value->'expected_price')
      from jsonb_array_elements(
        case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end
      ) as item(value)
    ), '[]'::jsonb)
  )::text, 'UTF8'), 'sha256');

  insert into public.support_guest_checkout_requests(idempotency_key_hash, request_fingerprint_hash)
  values (v_key_hash, v_fingerprint_hash)
  on conflict (idempotency_key_hash) do nothing;

  select * into v_request
  from public.support_guest_checkout_requests
  where idempotency_key_hash = v_key_hash
  for update;

  if v_request.request_fingerprint_hash <> v_fingerprint_hash then
    raise exception 'Checkout request key was already used with different data';
  end if;

  if v_request.order_id is null then
    v_order := public.place_public_order(
      p_customer_name, p_customer_phone, p_customer_email, p_delivery_address,
      p_customer_comment, p_consent, p_items
    );
    v_order_id := (v_order->>'id')::uuid;
    update public.support_guest_checkout_requests
    set order_id = v_order_id, response_payload = v_order
    where idempotency_key_hash = v_key_hash;
  else
    v_order_id := v_request.order_id;
    v_order := v_request.response_payload;
    perform bezb_private.ensure_support_thread(v_order_id);
  end if;

  if not exists (
    select 1 from public.orders
    where id = v_order_id and customer_user_id is null
  ) then
    raise exception 'Guest checkout request is unavailable';
  end if;

  v_token := bezb_private.issue_guest_token(v_order_id);
  return v_order || jsonb_build_object('guest_access_token', v_token);
end;
$$;

create or replace function public.place_buyer_order_with_support(
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_delivery_address text,
  p_customer_comment text,
  p_consent boolean,
  p_items jsonb,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order jsonb;
  v_order_id uuid;
begin
  v_order := public.place_buyer_order(
    p_customer_name, p_customer_phone, p_customer_email, p_delivery_address,
    p_customer_comment, p_consent, p_items, p_idempotency_key
  );
  v_order_id := (v_order->>'id')::uuid;
  perform bezb_private.ensure_support_thread(v_order_id);
  return v_order;
end;
$$;

create or replace function public.support_customer_get_thread(p_order_id uuid, p_guest_token text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_thread public.support_threads%rowtype;
  v_result jsonb;
begin
  select t.* into v_thread
  from public.support_threads t
  where t.order_id = p_order_id
    and bezb_private.can_access_support_thread(t.id, p_guest_token);
  if not found then raise exception 'Support conversation unavailable'; end if;

  select jsonb_build_object(
    'id', v_thread.id,
    'order_id', o.id,
    'order_number', o.order_number,
    'status', v_thread.status,
    'created_at', v_thread.created_at,
    'updated_at', v_thread.updated_at,
    'total_amount', o.total_amount,
    'payment_status', o.payment_status,
    'fulfillment_status', o.fulfillment_status,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_name', i.product_name, 'platform', i.platform, 'region', i.region,
        'quantity', i.quantity, 'unit_price', i.unit_price
      ) order by i.id)
      from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'sender_role', m.sender_role, 'body', m.body, 'created_at', m.created_at,
        'read_by_customer_at', m.read_by_customer_at, 'read_by_manager_at', m.read_by_manager_at
      ) order by m.created_at, m.id)
      from public.support_messages m where m.thread_id = v_thread.id
    ), '[]'::jsonb)
  ) into v_result
  from public.orders o where o.id = p_order_id;
  return v_result;
end;
$$;

create or replace function public.support_customer_send_message(p_order_id uuid, p_guest_token text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public.support_threads%rowtype;
  v_sender_role text;
  v_sender_id uuid := auth.uid();
  v_message public.support_messages%rowtype;
begin
  select t.* into v_thread
  from public.support_threads t
  join public.orders o on o.id = t.order_id
  where t.order_id = p_order_id
    and (
      (v_sender_id is not null and o.customer_user_id = v_sender_id)
      or (
        o.customer_user_id is null
        and
        p_guest_token ~ '^[0-9a-f]{64}$'
        and t.guest_access_revoked_at is null
        and t.guest_token_hash = extensions.digest(convert_to(p_guest_token, 'UTF8'), 'sha256')
      )
    )
  for update of t;
  if not found then raise exception 'Support conversation unavailable'; end if;
  if v_thread.status <> 'open' then raise exception 'Support conversation is closed'; end if;
  if p_body is null or length(btrim(p_body)) not between 1 and 5000 then raise exception 'Message must contain 1 to 5000 characters'; end if;
  v_sender_role := 'customer';
  insert into public.support_messages(thread_id, sender_role, sender_id, body)
  values (v_thread.id, v_sender_role, v_sender_id, btrim(p_body))
  returning * into v_message;
  update public.support_threads set updated_at = now(), last_message_at = v_message.created_at where id = v_thread.id;
  return jsonb_build_object('id', v_message.id, 'sender_role', v_message.sender_role, 'body', v_message.body, 'created_at', v_message.created_at);
end;
$$;

create or replace function public.support_customer_mark_read(p_order_id uuid, p_guest_token text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_thread_id uuid;
begin
  select t.id into v_thread_id from public.support_threads t
  where t.order_id = p_order_id and bezb_private.can_access_support_thread(t.id, p_guest_token);
  if v_thread_id is null then raise exception 'Support conversation unavailable'; end if;
  update public.support_messages set read_by_customer_at = now()
  where thread_id = v_thread_id and sender_role = 'manager' and read_by_customer_at is null;
end;
$$;

create or replace function public.support_customer_list_threads()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'order_id', o.id, 'order_number', o.order_number, 'status', t.status,
      'created_at', t.created_at, 'updated_at', t.updated_at, 'last_message_at', t.last_message_at,
      'total_amount', o.total_amount, 'payment_status', o.payment_status, 'fulfillment_status', o.fulfillment_status,
      'items', coalesce((select jsonb_agg(jsonb_build_object('product_name', i.product_name, 'platform', i.platform, 'region', i.region, 'quantity', i.quantity, 'unit_price', i.unit_price) order by i.id) from public.order_items i where i.order_id = o.id), '[]'::jsonb),
      'last_message', (select m.body from public.support_messages m where m.thread_id = t.id order by m.created_at desc, m.id desc limit 1),
      'unread_count', (select count(*) from public.support_messages m where m.thread_id = t.id and m.sender_role = 'manager' and m.read_by_customer_at is null)
    ) order by t.last_message_at desc nulls last, t.created_at desc)
    from public.support_threads t
    join public.orders o on o.id = t.order_id
    where o.customer_user_id = (select auth.uid())
  ), '[]'::jsonb);
end;
$$;

create or replace function public.support_admin_list_threads()
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
      'id', t.id, 'order_id', o.id, 'order_number', o.order_number, 'status', t.status,
      'created_at', t.created_at, 'updated_at', t.updated_at, 'last_message_at', t.last_message_at,
      'total_amount', o.total_amount, 'is_guest', o.customer_user_id is null,
      'payment_status', o.payment_status, 'fulfillment_status', o.fulfillment_status,
      'customer_name', o.customer_name, 'customer_email', o.customer_email,
      'last_message', (select m.body from public.support_messages m where m.thread_id = t.id order by m.created_at desc, m.id desc limit 1),
      'unread_count', (select count(*) from public.support_messages m where m.thread_id = t.id and m.sender_role = 'customer' and m.read_by_manager_at is null)
    ) order by t.last_message_at desc nulls last, t.created_at desc)
    from public.support_threads t join public.orders o on o.id = t.order_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.support_admin_get_thread(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  update public.support_messages
  set read_by_manager_at = now()
  where thread_id = (select id from public.support_threads where order_id = p_order_id)
    and sender_role = 'customer' and read_by_manager_at is null;
  select jsonb_build_object(
    'id', t.id, 'order_id', o.id, 'order_number', o.order_number, 'status', t.status,
    'created_at', t.created_at, 'updated_at', t.updated_at, 'last_message_at', t.last_message_at,
    'total_amount', o.total_amount, 'is_guest', o.customer_user_id is null,
    'payment_status', o.payment_status, 'fulfillment_status', o.fulfillment_status,
    'customer_name', o.customer_name, 'customer_email', o.customer_email,
    'items', coalesce((select jsonb_agg(jsonb_build_object('product_name', i.product_name, 'platform', i.platform, 'region', i.region, 'quantity', i.quantity, 'unit_price', i.unit_price) order by i.id) from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'sender_role', m.sender_role, 'body', m.body, 'created_at', m.created_at, 'read_by_customer_at', m.read_by_customer_at, 'read_by_manager_at', m.read_by_manager_at) order by m.created_at, m.id) from public.support_messages m where m.thread_id = t.id), '[]'::jsonb)
  ) into v_result
  from public.support_threads t join public.orders o on o.id = t.order_id
  where t.order_id = p_order_id;
  if v_result is null then raise exception 'Support conversation unavailable'; end if;
  return v_result;
end;
$$;

create or replace function public.support_admin_send_message(p_order_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_thread public.support_threads%rowtype; v_message public.support_messages%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_body is null or length(btrim(p_body)) not between 1 and 5000 then raise exception 'Message must contain 1 to 5000 characters'; end if;
  select * into v_thread from public.support_threads where order_id = p_order_id for update;
  if not found then raise exception 'Support conversation unavailable'; end if;
  if v_thread.status <> 'open' then raise exception 'Support conversation is closed'; end if;
  insert into public.support_messages(thread_id, sender_role, sender_id, body)
  values (v_thread.id, 'manager', auth.uid(), btrim(p_body))
  returning * into v_message;
  update public.support_threads set updated_at = now(), last_message_at = v_message.created_at where id = v_thread.id;
  return jsonb_build_object('id', v_message.id, 'sender_role', v_message.sender_role, 'body', v_message.body, 'created_at', v_message.created_at);
end;
$$;

create or replace function public.support_admin_set_status(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_status not in ('open', 'closed') then raise exception 'Invalid support status'; end if;
  update public.support_threads set status = p_status, updated_at = now() where order_id = p_order_id;
  if not found then raise exception 'Support conversation unavailable'; end if;
end;
$$;

create or replace function public.support_admin_revoke_guest_access(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  update public.support_threads t
  set guest_token_hash = null, guest_access_revoked_at = now(), updated_at = now()
  from public.orders o
  where t.order_id = p_order_id and o.id = t.order_id and o.customer_user_id is null;
  if not found then raise exception 'Guest support conversation unavailable'; end if;
end;
$$;

create or replace function public.support_admin_reissue_guest_access(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  return bezb_private.issue_guest_token(p_order_id);
end;
$$;

create or replace function public.support_admin_send_delivered_codes(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public.support_threads%rowtype;
  v_order public.orders%rowtype;
  v_body text;
  v_expected_count bigint;
  v_delivered_count bigint;
  v_item_quantity_mismatch boolean;
  v_message public.support_messages%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.payment_status <> 'paid' or v_order.fulfillment_status <> 'delivered' then
    raise exception 'Digital goods must be delivered for a paid order before sharing them in chat';
  end if;
  select * into v_thread from public.support_threads where order_id = p_order_id for update;
  if not found then raise exception 'Support conversation unavailable'; end if;
  if v_thread.status <> 'open' then raise exception 'Support conversation is closed'; end if;

  with expected_items as (
    select i.id as item_id, i.quantity::bigint as units
    from public.order_items i
    where i.order_id = p_order_id
  ),
  valid_deliveries as (
    select d.id, i.id as item_id, c.id as code_id, i.product_name, c.region,
      c.secret_code, p.activation_instructions
    from public.order_deliveries d
    join public.digital_codes c
      on c.id = d.digital_code_id
     and c.assigned_order_id = d.order_id
     and c.assigned_order_item_id = d.order_item_id
    join public.order_items i
      on i.id = d.order_item_id
     and i.order_id = d.order_id
     and i.product_id = c.product_id
     and coalesce(i.region, '') = c.region
    join public.products p on p.product_id = c.product_id and p.region = c.region
    where d.order_id = p_order_id and d.status = 'delivered' and c.status = 'delivered'
  ),
  item_delivery_counts as (
    select expected_items.item_id, expected_items.units, count(valid_deliveries.id)::bigint as delivered_units
    from expected_items
    left join valid_deliveries on valid_deliveries.item_id = expected_items.item_id
    group by expected_items.item_id, expected_items.units
  ),
  expected as (
    select coalesce(sum(item_delivery_counts.units), 0)::bigint as units,
      coalesce(bool_or(item_delivery_counts.units <> item_delivery_counts.delivered_units), false) as item_quantity_mismatch
    from item_delivery_counts
  ),
  delivery_totals as (
    select count(valid_deliveries.id)::bigint as units,
      string_agg(
        valid_deliveries.product_name
          || coalesce(' · ' || nullif(valid_deliveries.region, ''), '')
          || E'\nКод: ' || valid_deliveries.secret_code
          || coalesce(E'\nИнструкция: ' || nullif(valid_deliveries.activation_instructions, ''), ''),
        E'\n\n' order by valid_deliveries.item_id, valid_deliveries.code_id
      ) as body
    from valid_deliveries
  )
  select expected.units, delivery_totals.units, expected.item_quantity_mismatch, delivery_totals.body
  into v_expected_count, v_delivered_count, v_item_quantity_mismatch, v_body
  from expected
  cross join delivery_totals;
  if v_expected_count <= 0
    or v_delivered_count <> v_expected_count
    or v_item_quantity_mismatch then
    raise exception 'Delivered digital code quantity does not match the ordered quantity';
  end if;
  if length(v_body) > 5000 then raise exception 'Delivered data exceeds the message limit; send an administrator-prepared instruction instead'; end if;

  insert into public.support_messages(thread_id, sender_role, sender_id, body)
  values (v_thread.id, 'manager', auth.uid(), v_body)
  returning * into v_message;
  update public.support_threads set updated_at = now(), last_message_at = v_message.created_at where id = v_thread.id;
  return jsonb_build_object('id', v_message.id, 'sender_role', v_message.sender_role, 'body', v_message.body, 'created_at', v_message.created_at);
end;
$$;

revoke all on function bezb_private.ensure_support_thread(uuid) from public, anon, authenticated;
revoke all on function bezb_private.create_support_thread_for_order() from public, anon, authenticated;
revoke all on function bezb_private.revoke_guest_support_on_claim() from public, anon, authenticated;
revoke all on function bezb_private.issue_guest_token(uuid) from public, anon, authenticated;
revoke all on function bezb_private.can_access_support_thread(uuid, text) from public, anon, authenticated;
revoke all on function public.place_public_order_with_support(text,text,text,text,text,boolean,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.place_buyer_order_with_support(text,text,text,text,text,boolean,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.support_customer_get_thread(uuid,text) from public, anon, authenticated;
revoke all on function public.support_customer_send_message(uuid,text,text) from public, anon, authenticated;
revoke all on function public.support_customer_mark_read(uuid,text) from public, anon, authenticated;
revoke all on function public.support_customer_list_threads() from public, anon, authenticated;
revoke all on function public.support_admin_list_threads() from public, anon, authenticated;
revoke all on function public.support_admin_get_thread(uuid) from public, anon, authenticated;
revoke all on function public.support_admin_send_message(uuid,text) from public, anon, authenticated;
revoke all on function public.support_admin_set_status(uuid,text) from public, anon, authenticated;
revoke all on function public.support_admin_revoke_guest_access(uuid) from public, anon, authenticated;
revoke all on function public.support_admin_reissue_guest_access(uuid) from public, anon, authenticated;
revoke all on function public.support_admin_send_delivered_codes(uuid) from public, anon, authenticated;
grant execute on function public.place_public_order_with_support(text,text,text,text,text,boolean,jsonb,uuid) to anon, authenticated;
grant execute on function public.place_buyer_order_with_support(text,text,text,text,text,boolean,jsonb,uuid) to authenticated;
grant execute on function public.support_customer_get_thread(uuid,text) to anon, authenticated;
grant execute on function public.support_customer_send_message(uuid,text,text) to anon, authenticated;
grant execute on function public.support_customer_mark_read(uuid,text) to anon, authenticated;
grant execute on function public.support_customer_list_threads() to authenticated;
grant execute on function public.support_admin_list_threads() to authenticated;
grant execute on function public.support_admin_get_thread(uuid) to authenticated;
grant execute on function public.support_admin_send_message(uuid,text) to authenticated;
grant execute on function public.support_admin_set_status(uuid,text) to authenticated;
grant execute on function public.support_admin_revoke_guest_access(uuid) to authenticated;
grant execute on function public.support_admin_reissue_guest_access(uuid) to authenticated;
grant execute on function public.support_admin_send_delivered_codes(uuid) to authenticated;

commit;
