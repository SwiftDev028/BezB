\set ON_ERROR_STOP on

create role anon;
create role authenticated;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz
);

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null default 'test-order',
  customer_name text not null,
  -- Limited test model only; the repository does not contain the legacy table definition.
  customer_phone text not null,
  customer_email text not null,
  customer_user_id uuid,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.orders enable row level security;
grant select on public.orders to authenticated;
create policy "test customer reads own orders" on public.orders
  for select to authenticated using (customer_user_id = (select auth.uid()));

create function public.place_public_order(
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
  v_order_id uuid;
begin
  if p_consent is distinct from true then raise exception 'Consent is required'; end if;
  if p_customer_phone is null or length(btrim(p_customer_phone)) not between 5 and 40 then
    raise exception 'Invalid phone';
  end if;
  insert into public.orders(customer_name, customer_phone, customer_email)
  values (btrim(p_customer_name), btrim(p_customer_phone), lower(btrim(p_customer_email)))
  returning id into v_order_id;
  return jsonb_build_object('id', v_order_id);
end;
$$;

create function public.place_buyer_order(
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
  v_order_id uuid;
begin
  if p_consent is distinct from true then raise exception 'Consent is required'; end if;
  if p_customer_phone is null or length(btrim(p_customer_phone)) not between 5 and 40 then raise exception 'Invalid phone'; end if;
  insert into public.orders(customer_name, customer_phone, customer_email)
  values (btrim(p_customer_name), btrim(p_customer_phone), lower(btrim(p_customer_email)))
  returning id into v_order_id;
  return jsonb_build_object('id', v_order_id);
end;
$$;

create or replace function public.place_buyer_order(
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
begin
  if p_consent is distinct from true then raise exception 'Consent is required'; end if;
  if p_customer_phone is null or length(btrim(p_customer_phone)) not between 5 and 40 then
    raise exception 'Changed phone validation';
  end if;
  return '{}'::jsonb;
end;
$$;

\set ON_ERROR_STOP off
\ir ../migrations/202610260001_optional_checkout_phone_and_guest_claim.sql
\set ON_ERROR_STOP on

do $$
begin
  if to_regprocedure('public.claim_guest_orders()') is not null then
    raise exception 'Mismatch migration should roll back claim_guest_orders creation';
  end if;

  if pg_get_functiondef(
       to_regprocedure('public.place_public_order(text,text,text,text,text,boolean,jsonb)')
     ) not like '%Invalid phone%'
     or pg_get_functiondef(
       to_regprocedure('public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)')
     ) not like '%Changed phone validation%' then
    raise exception 'Mismatch migration should roll back checkout function replacements';
  end if;
end;
$$;

create or replace function public.place_buyer_order(
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
  v_order_id uuid;
begin
  if p_consent is distinct from true then raise exception 'Consent is required'; end if;
  if p_customer_phone is null or length(btrim(p_customer_phone)) not between 5 and 40 then
    raise exception 'Invalid phone';
  end if;
  insert into public.orders(customer_name, customer_phone, customer_email)
  values (btrim(p_customer_name), btrim(p_customer_phone), lower(btrim(p_customer_email)))
  returning id into v_order_id;
  return jsonb_build_object('id', v_order_id);
end;
$$;

\ir ../migrations/202610260001_optional_checkout_phone_and_guest_claim.sql

insert into auth.users(id, email, email_confirmed_at) values
  ('10000000-0000-0000-0000-000000000001', 'Alice@Example.com', now()),
  ('10000000-0000-0000-0000-000000000002', 'bob@example.com', now()),
  ('10000000-0000-0000-0000-000000000003', 'pending@example.com', null),
  ('10000000-0000-0000-0000-000000000004', 'nobody@example.com', now());

insert into public.orders(id, customer_name, customer_phone, customer_email, customer_user_id) values
  ('20000000-0000-0000-0000-000000000001', 'Alice guest', 'N/A', '  alice@example.com  ', null),
  ('20000000-0000-0000-0000-000000000002', 'Alice owned by Bob', 'N/A', 'alice@example.com', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000003', 'Unrelated guest', 'N/A', 'other@example.com', null),
  ('20000000-0000-0000-0000-000000000004', 'Pending guest', 'N/A', 'pending@example.com', null);

do $$
declare
  v_public_result jsonb;
  v_buyer_result jsonb;
begin
  v_public_result := public.place_public_order('Guest', null, 'guest@example.com', null, null, true, '[]'::jsonb);
  v_buyer_result := public.place_buyer_order(
    'Buyer', '', 'buyer@example.com', null, null, true, '[]'::jsonb,
    '30000000-0000-0000-0000-000000000001'
  );

  if not exists (
    select 1 from public.orders where id = (v_public_result->>'id')::uuid and customer_phone = ''
  ) then
    raise exception 'Guest checkout did not store NULL phone as an empty string';
  end if;
  if not exists (
    select 1 from public.orders where id = (v_buyer_result->>'id')::uuid and customer_phone = ''
  ) then
    raise exception 'Buyer checkout did not store empty phone as an empty string';
  end if;

  begin
    perform public.place_public_order('Guest', null, 'guest@example.com', null, null, false, '[]'::jsonb);
    raise exception 'Expected guest checkout to reject missing consent';
  exception
    when others then
      if sqlerrm <> 'Consent is required' then raise; end if;
  end;

  begin
    perform public.place_buyer_order(
      'Buyer', null, 'buyer@example.com', null, null, false, '[]'::jsonb,
      '30000000-0000-0000-0000-000000000002'
    );
    raise exception 'Expected buyer checkout to reject missing consent';
  exception
    when others then
      if sqlerrm <> 'Consent is required' then raise; end if;
  end;

  begin
    perform public.place_public_order('Guest', '1234', 'guest@example.com', null, null, true, '[]'::jsonb);
    raise exception 'Expected guest checkout to retain the non-empty phone bounds';
  exception
    when others then
      if sqlerrm <> 'Invalid phone' then raise; end if;
  end;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

do $$
begin
  if public.claim_guest_orders() <> 1 then
    raise exception 'Expected exactly one unowned, normalized-email match to be claimed';
  end if;
  if public.claim_guest_orders() <> 0 then
    raise exception 'Repeated guest-order claim should be a no-op';
  end if;

  if (select count(*) from public.orders where customer_user_id = '10000000-0000-0000-0000-000000000002') <> 0 then
    raise exception 'RLS exposed an order owned by another account';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '', false);
do $$
begin
  begin
    perform public.claim_guest_orders();
    raise exception 'Expected unauthenticated invocation to be rejected';
  exception
    when others then
      if sqlerrm <> 'Sign in is required' then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', false);
do $$
begin
  if public.claim_guest_orders() <> 0 then
    raise exception 'No matching guest orders should return zero';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', false);
do $$
begin
  begin
    perform public.claim_guest_orders();
    raise exception 'Expected unconfirmed email to be rejected';
  exception
    when others then
      if sqlerrm <> 'A confirmed account email is required' then raise; end if;
  end;
end;
$$;

reset role;

do $$
begin
  if (select customer_user_id from public.orders where id = '20000000-0000-0000-0000-000000000001')
     <> '10000000-0000-0000-0000-000000000001' then
    raise exception 'Matching guest order was not attached to Alice';
  end if;
  if (select customer_user_id from public.orders where id = '20000000-0000-0000-0000-000000000002')
     <> '10000000-0000-0000-0000-000000000002' then
    raise exception 'Claim operation overwrote another account owner';
  end if;
  if (select customer_user_id from public.orders where id = '20000000-0000-0000-0000-000000000003') is not null
     or (select customer_user_id from public.orders where id = '20000000-0000-0000-0000-000000000004') is not null then
    raise exception 'Unmatched or unconfirmed-email guest order was claimed';
  end if;

  if has_function_privilege('anon', 'public.claim_guest_orders()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.claim_guest_orders()', 'EXECUTE')
     or exists (
       select 1
       from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
       where p.oid = 'public.claim_guest_orders()'::regprocedure
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     ) then
    raise exception 'claim_guest_orders EXECUTE grants are broader than expected';
  end if;

  if not (
    select p.prosecdef and p.proconfig @> array['search_path=""']
    from pg_proc p
    where p.oid = 'public.claim_guest_orders()'::regprocedure
  ) then
    raise exception 'claim_guest_orders lost SECURITY DEFINER or the empty search_path';
  end if;
end;
$$;

\echo 'PostgreSQL migration integration checks passed.'
