\set ON_ERROR_STOP on

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

create table public.orders (
  customer_email text,
  customer_user_id uuid,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

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
begin
  if p_consent is distinct from true then raise exception 'Consent is required'; end if;
  if p_customer_phone is null or length(btrim(p_customer_phone)) not between 5 and 40 then
    raise exception 'Invalid phone';
  end if;
  return '{}'::jsonb;
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
begin
  if p_consent is distinct from true then raise exception 'Consent is required'; end if;
  if p_customer_phone is null or length(btrim(p_customer_phone)) not between 5 and 40 then
    raise exception 'Changed phone validation';
  end if;
  return '{}'::jsonb;
end;
$$;
