-- Allow checkout without a phone number and let verified account holders claim
-- only unowned guest orders whose stored email matches their Auth email.
begin;

do $$
declare
  v_signature text;
  v_function_oid regprocedure;
  v_definition text;
  v_pattern text;
  v_replacement text;
  v_missing text;
begin
  select string_agg(required.table_name || '.' || required.column_name, ', ' order by required.table_name, required.column_name)
    into v_missing
  from (values
    ('orders', 'customer_email'),
    ('orders', 'customer_user_id'),
    ('orders', 'version'),
    ('orders', 'updated_at')
  ) as required(table_name, column_name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = required.table_name
      and c.column_name = required.column_name
  );

  if v_missing is not null then
    raise exception 'Guest order claiming requires missing columns: %', v_missing;
  end if;

  if to_regprocedure('public.place_public_order(text,text,text,text,text,boolean,jsonb)') is null
     or to_regprocedure('public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)') is null then
    raise exception 'Expected existing guest and buyer checkout RPCs before updating phone validation';
  end if;

  v_pattern := 'if p_customer_phone is null or length\(btrim\(p_customer_phone\)\) not between 5 and 40 then[[:space:]]+raise exception ''Invalid phone'';[[:space:]]+end if;';
  v_replacement := 'if nullif(btrim(coalesce(p_customer_phone, ' || quote_literal('') || ')), ' || quote_literal('') || ') is not null and length(btrim(p_customer_phone)) not between 5 and 40 then raise exception ' || quote_literal('Invalid phone') || '; end if;';

  foreach v_signature in array array[
    'public.place_public_order(text,text,text,text,text,boolean,jsonb)',
    'public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)'
  ] loop
    v_function_oid := to_regprocedure(v_signature);
    v_definition := pg_catalog.pg_get_functiondef(v_function_oid);
    if regexp_count(v_definition, v_pattern) <> 1 then
      raise exception 'Unexpected phone validation in %; refusing to alter checkout RPC', v_signature;
    end if;

    v_definition := regexp_replace(v_definition, v_pattern, v_replacement);
    v_definition := replace(
      v_definition,
      'btrim(p_customer_phone)',
      'coalesce(btrim(p_customer_phone), ' || quote_literal('') || ')'
    );

    if position('Invalid phone' in v_definition) = 0
       or position('coalesce(btrim(p_customer_phone)' in v_definition) = 0 then
      raise exception 'Failed to preserve phone bounds and normalize optional phone in %', v_signature;
    end if;
    execute v_definition;
  end loop;
end;
$$;

create or replace function public.claim_guest_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_claimed integer;
begin
  if v_user_id is null then
    raise exception 'Sign in is required';
  end if;

  select u.email
    into v_email
  from auth.users u
  where u.id = v_user_id
    and u.email_confirmed_at is not null;

  if v_email is null or btrim(v_email) = '' then
    raise exception 'A confirmed account email is required';
  end if;

  update public.orders o
  set customer_user_id = v_user_id,
      version = o.version + 1,
      updated_at = now()
  where o.customer_user_id is null
    and lower(btrim(o.customer_email)) = lower(btrim(v_email));

  get diagnostics v_claimed = row_count;
  return v_claimed;
end;
$$;

revoke all on function public.claim_guest_orders() from public, anon, authenticated;
grant execute on function public.claim_guest_orders() to authenticated;

commit;
