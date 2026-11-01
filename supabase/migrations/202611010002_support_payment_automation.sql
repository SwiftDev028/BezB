begin;

create extension if not exists pg_cron;

do $$
begin
  if to_regclass('public.support_threads') is null
    or to_regclass('public.support_messages') is null
    or to_regclass('public.orders') is null
    or to_regprocedure('bezb_private.ensure_support_thread(uuid)') is null
    or to_regprocedure('public.is_admin()') is null
    or not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'orders'
        and column_name = 'payment_status'
    ) then
    raise exception 'Support payment automation requires the existing support tables, payment_status, ensure_support_thread(uuid), and is_admin()';
  end if;
end;
$$;

alter table public.support_messages
  drop constraint if exists support_messages_sender_role_check;
alter table public.support_messages
  add constraint support_messages_sender_role_check
  check (sender_role in ('customer', 'manager', 'system'));

alter table public.support_threads
  add column if not exists payment_greeting_sent_at timestamptz,
  add column if not exists busy_followup_due_at timestamptz,
  add column if not exists busy_followup_sent_at timestamptz;

create index if not exists support_threads_busy_followup_due_idx
  on public.support_threads(busy_followup_due_at)
  where busy_followup_due_at is not null and busy_followup_sent_at is null;

create unique index if not exists support_system_message_once_idx
  on public.support_messages(thread_id, body)
  where sender_role = 'system';

create or replace function bezb_private.start_paid_order_support_automation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread_id uuid;
  v_message public.support_messages%rowtype;
  v_started_at timestamptz := clock_timestamp();
begin
  if new.payment_status is distinct from 'paid'
    or old.payment_status is not distinct from 'paid' then
    return new;
  end if;

  v_thread_id := bezb_private.ensure_support_thread(new.id);
  perform 1 from public.support_threads where id = v_thread_id for update;

  if not exists (
    select 1 from public.support_threads
    where id = v_thread_id and payment_greeting_sent_at is not null
  ) then
    insert into public.support_messages(
      thread_id, sender_role, sender_id, body, read_by_customer_at, read_by_manager_at
    ) values (
      v_thread_id,
      'system',
      null,
      'Здравствуйте! Спасибо за заказ в BezB!' || E'\n\n' ||
      'Ваш заказ получен, и мы уже занимаемся его обработкой.' || E'\n\n' ||
      'Как только всё будет готово, отправим ваш цифровой товар прямо в этот чат.' || E'\n\n' ||
      'Если у вас возникнут вопросы — пишите сюда, менеджер обязательно вам ответит.' || E'\n\n' ||
      'Спасибо, что выбрали BezB!',
      null,
      now()
    )
    on conflict do nothing
    returning * into v_message;

    update public.support_threads
    set payment_greeting_sent_at = coalesce(payment_greeting_sent_at, v_started_at),
        busy_followup_due_at = coalesce(busy_followup_due_at, v_started_at + interval '5 minutes'),
        updated_at = now(),
        last_message_at = coalesce(v_message.created_at, last_message_at)
    where id = v_thread_id;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_start_paid_support_automation on public.orders;
create trigger orders_start_paid_support_automation
after update of payment_status on public.orders
for each row
when (new.payment_status = 'paid' and old.payment_status is distinct from 'paid')
execute function bezb_private.start_paid_order_support_automation();

create or replace function public.support_admin_send_message(p_order_id uuid, p_body text)
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
  if p_body is null or length(btrim(p_body)) not between 1 and 5000 then
    raise exception 'Message must contain 1 to 5000 characters';
  end if;

  select * into v_thread
  from public.support_threads
  where order_id = p_order_id
  for update;
  if not found then raise exception 'Support conversation unavailable'; end if;
  if v_thread.status <> 'open' then raise exception 'Support conversation is closed'; end if;

  insert into public.support_messages(thread_id, sender_role, sender_id, body)
  values (v_thread.id, 'manager', auth.uid(), btrim(p_body))
  returning * into v_message;
  update public.support_threads
  set updated_at = now(),
      last_message_at = v_message.created_at,
      busy_followup_due_at = null
  where id = v_thread.id;

  return jsonb_build_object(
    'id', v_message.id,
    'sender_role', v_message.sender_role,
    'body', v_message.body,
    'created_at', v_message.created_at
  );
end;
$$;

create or replace function bezb_private.process_due_support_followups()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread record;
  v_message public.support_messages%rowtype;
  v_processed integer := 0;
begin
  for v_thread in
    select t.id
    from public.support_threads t
    where t.busy_followup_due_at <= clock_timestamp()
      and t.busy_followup_sent_at is null
    order by t.busy_followup_due_at, t.id
    for update skip locked
  loop
    if exists (
      select 1
      from public.support_messages m
      where m.thread_id = v_thread.id
        and m.sender_role = 'manager'
    ) then
      update public.support_threads
      set busy_followup_due_at = null,
          updated_at = now()
      where id = v_thread.id;
    else
      insert into public.support_messages(
        thread_id, sender_role, sender_id, body, read_by_customer_at, read_by_manager_at
      ) values (
        v_thread.id,
        'system',
        null,
        'Сейчас у нас повышенная загруженность, поэтому ответ менеджера может занять немного больше времени.' || E'\n\n' ||
        'Не переживайте, ваше сообщение получено и не останется без внимания. Мы ответим вам, как только освободимся.' || E'\n\n' ||
        'Спасибо за понимание!',
        null,
        now()
      )
      on conflict do nothing
      returning * into v_message;

      update public.support_threads
      set busy_followup_sent_at = coalesce(busy_followup_sent_at, now()),
          busy_followup_due_at = null,
          updated_at = now(),
          last_message_at = coalesce(v_message.created_at, last_message_at)
      where id = v_thread.id;
    end if;
    v_processed := v_processed + 1;
  end loop;
  return v_processed;
end;
$$;

revoke all on function bezb_private.start_paid_order_support_automation() from public, anon, authenticated;
revoke all on function public.support_admin_send_message(uuid, text) from public, anon, authenticated;
grant execute on function public.support_admin_send_message(uuid, text) to authenticated;
revoke all on function bezb_private.process_due_support_followups() from public, anon, authenticated;

do $$
declare
  v_job record;
  v_kept_job_id bigint;
  v_expected_command constant text := 'select bezb_private.process_due_support_followups();';
begin
  if to_regclass('cron.job') is null
    or to_regprocedure('cron.schedule(text,text,text)') is null then
    raise exception 'Support payment automation requires the pg_cron extension and cron.schedule(text,text,text)';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(20261101, 2);

  for v_job in
    select jobid, schedule, command, active
    from cron.job
    where jobname = 'bezb-support-payment-followups'
    order by jobid
  loop
    if v_kept_job_id is null
      and v_job.schedule = '* * * * *'
      and v_job.command = v_expected_command
      and v_job.active then
      v_kept_job_id := v_job.jobid;
    else
      perform cron.unschedule(v_job.jobid);
    end if;
  end loop;

  if v_kept_job_id is null then
    perform cron.schedule(
      'bezb-support-payment-followups',
      '* * * * *',
      v_expected_command
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'support_threads'
      and column_name in (
        'payment_greeting_sent_at',
        'busy_followup_due_at',
        'busy_followup_sent_at'
      )
    group by table_schema, table_name
    having count(distinct column_name) = 3
  )
    or to_regprocedure('bezb_private.process_due_support_followups()') is null
    or to_regprocedure('public.support_admin_send_message(uuid,text)') is null
    or not exists (
      select 1
      from pg_catalog.pg_trigger
      where tgrelid = 'public.orders'::regclass
        and tgname = 'orders_start_paid_support_automation'
        and not tgisinternal
    )
    or not exists (
      select 1
      from cron.job
      where jobname = 'bezb-support-payment-followups'
        and schedule = '* * * * *'
        and command = 'select bezb_private.process_due_support_followups();'
        and active
    ) then
    raise exception 'Support payment automation post-install verification failed';
  end if;
end;
$$;

commit;
