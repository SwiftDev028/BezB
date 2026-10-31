begin;

alter table bezb_private.manual_deliveries
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists revision integer not null default 1 check (revision > 0);

create table if not exists bezb_private.manual_delivery_audit (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  delivery_id uuid not null references bezb_private.manual_deliveries(id) on delete restrict,
  revision integer not null check (revision > 1),
  changed_fields text[] not null check (
    cardinality(changed_fields) > 0
    and changed_fields <@ array['title', 'activation_code', 'login', 'password', 'additional_data', 'instructions']::text[]
  ),
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists manual_delivery_audit_order_idx
  on bezb_private.manual_delivery_audit(order_id, delivery_id, revision);

alter table bezb_private.manual_delivery_audit enable row level security;
revoke all on bezb_private.manual_delivery_audit from public, anon, authenticated;

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
      'additional_data', d.additional_data, 'instructions', d.instructions,
      'created_at', d.created_at, 'updated_at', d.updated_at, 'revision', d.revision,
      'history', coalesce((
        select jsonb_agg(jsonb_build_object(
          'revision', a.revision,
          'changed_fields', to_jsonb(a.changed_fields),
          'changed_at', a.created_at,
          'changed_by', a.changed_by
        ) order by a.revision)
        from bezb_private.manual_delivery_audit a
        where a.delivery_id = d.id and a.order_id = d.order_id
      ), '[]'::jsonb)
    ) order by d.created_at, d.id)
    from bezb_private.manual_deliveries d
    where d.order_id = p_order_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.support_customer_list_manual_deliveries(
  p_order_id uuid,
  p_guest_token text default null
)
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
      'additional_data', d.additional_data, 'instructions', d.instructions,
      'created_at', d.created_at, 'updated_at', d.updated_at, 'revision', d.revision
    ) order by d.created_at, d.id)
    from bezb_private.manual_deliveries d
    where d.order_id = p_order_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.support_admin_update_manual_delivery(
  p_order_id uuid,
  p_delivery_id uuid,
  p_expected_revision integer,
  p_delivery jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_thread public.support_threads%rowtype;
  v_current bezb_private.manual_deliveries%rowtype;
  v_title text;
  v_code text;
  v_login text;
  v_password text;
  v_additional text;
  v_instructions text;
  v_changed_fields text[] := '{}'::text[];
  v_message public.support_messages%rowtype;
  v_message_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'A valid delivery revision is required';
  end if;
  if jsonb_typeof(p_delivery) is distinct from 'object'
    or jsonb_typeof(p_delivery->'title') is distinct from 'string'
    or jsonb_typeof(p_delivery->'activation_code') is distinct from 'string'
    or jsonb_typeof(p_delivery->'login') is distinct from 'string'
    or jsonb_typeof(p_delivery->'password') is distinct from 'string'
    or jsonb_typeof(p_delivery->'additional_data') is distinct from 'string'
    or jsonb_typeof(p_delivery->'instructions') is distinct from 'string' then
    raise exception 'All delivery fields must be provided as text';
  end if;

  v_title := nullif(btrim(p_delivery->>'title'), '');
  v_code := p_delivery->>'activation_code';
  v_login := p_delivery->>'login';
  v_password := p_delivery->>'password';
  v_additional := p_delivery->>'additional_data';
  v_instructions := p_delivery->>'instructions';
  if v_title is null or length(v_title) > 200
    or length(v_code) > 4000 or length(v_login) > 500 or length(v_password) > 1000
    or length(v_additional) > 4000 or length(v_instructions) > 4000 then
    raise exception 'Delivery contains invalid or oversized fields';
  end if;
  if v_code = '' and v_login = '' and v_password = '' and v_additional = '' then
    raise exception 'Provide a key, account credential, or additional delivered data';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order is unavailable'; end if;
  select * into v_current
  from bezb_private.manual_deliveries
  where id = p_delivery_id and order_id = p_order_id
  for update;
  if not found then raise exception 'Delivered item is unavailable for this order'; end if;

  if v_current.revision <> p_expected_revision then
    if v_current.title = v_title
      and v_current.activation_code = v_code
      and v_current.login = v_login
      and v_current.password = v_password
      and v_current.additional_data = v_additional
      and v_current.instructions = v_instructions then
      v_message_id := null;
    else
      raise exception 'Delivery changed since it was loaded; refresh and review the current values';
    end if;
  else
    if v_current.title is distinct from v_title then v_changed_fields := array_append(v_changed_fields, 'title'); end if;
    if v_current.activation_code is distinct from v_code then v_changed_fields := array_append(v_changed_fields, 'activation_code'); end if;
    if v_current.login is distinct from v_login then v_changed_fields := array_append(v_changed_fields, 'login'); end if;
    if v_current.password is distinct from v_password then v_changed_fields := array_append(v_changed_fields, 'password'); end if;
    if v_current.additional_data is distinct from v_additional then v_changed_fields := array_append(v_changed_fields, 'additional_data'); end if;
    if v_current.instructions is distinct from v_instructions then v_changed_fields := array_append(v_changed_fields, 'instructions'); end if;

    if cardinality(v_changed_fields) > 0 then
      select * into v_thread from public.support_threads
      where order_id = p_order_id for update;
      if not found then raise exception 'Support conversation is unavailable'; end if;

      update bezb_private.manual_deliveries
      set title = v_title,
          activation_code = v_code,
          login = v_login,
          password = v_password,
          additional_data = v_additional,
          instructions = v_instructions,
          revision = revision + 1,
          updated_at = now()
      where id = p_delivery_id and order_id = p_order_id
      returning * into v_current;

      insert into bezb_private.manual_delivery_audit(
        order_id, delivery_id, revision, changed_fields, changed_by
      ) values (
        p_order_id, p_delivery_id, v_current.revision, v_changed_fields, auth.uid()
      );
      perform public.log_order_action(
        p_order_id,
        'manual_delivery_updated',
        jsonb_build_object(
          'delivery_id', p_delivery_id,
          'revision', v_current.revision,
          'changed_fields', to_jsonb(v_changed_fields)
        )
      );
      update public.orders
      set version = version + 1, updated_at = now()
      where id = p_order_id;

      insert into public.support_messages(thread_id, sender_role, sender_id, body)
      values (
        v_thread.id,
        'manager',
        auth.uid(),
        'BEZB_MANUAL_DELIVERY:' || jsonb_build_object(
          'delivery_ids', jsonb_build_array(p_delivery_id),
          'event', 'updated',
          'revision', v_current.revision
        )::text
      )
      returning * into v_message;
      update public.support_threads
      set updated_at = now(), last_message_at = v_message.created_at
      where id = v_thread.id;
      v_message_id := v_message.id;
    else
      v_message_id := null;
    end if;
  end if;

  return jsonb_build_object(
    'delivery', jsonb_build_object(
      'id', v_current.id,
      'order_item_id', v_current.order_item_id,
      'title', v_current.title,
      'activation_code', v_current.activation_code,
      'login', v_current.login,
      'password', v_current.password,
      'additional_data', v_current.additional_data,
      'instructions', v_current.instructions,
      'created_at', v_current.created_at,
      'updated_at', v_current.updated_at,
      'revision', v_current.revision,
      'history', coalesce((
        select jsonb_agg(jsonb_build_object(
          'revision', a.revision,
          'changed_fields', to_jsonb(a.changed_fields),
          'changed_at', a.created_at,
          'changed_by', a.changed_by
        ) order by a.revision)
        from bezb_private.manual_delivery_audit a
        where a.delivery_id = v_current.id and a.order_id = p_order_id
      ), '[]'::jsonb)
    ),
    'message_id', v_message_id
  );
end;
$$;

revoke all on function public.support_admin_list_manual_deliveries(uuid) from public, anon, authenticated;
revoke all on function public.support_customer_list_manual_deliveries(uuid, text) from public, anon, authenticated;
revoke all on function public.support_admin_update_manual_delivery(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.support_admin_list_manual_deliveries(uuid) to authenticated;
grant execute on function public.support_customer_list_manual_deliveries(uuid, text) to anon, authenticated;
grant execute on function public.support_admin_update_manual_delivery(uuid, uuid, integer, jsonb) to authenticated;

commit;
