\set ON_ERROR_STOP on

do $$
begin
  if to_regprocedure('public.claim_guest_orders()') is not null then
    raise exception 'Failed migration left claim_guest_orders behind';
  end if;

  if pg_get_functiondef(
       to_regprocedure('public.place_public_order(text,text,text,text,text,boolean,jsonb)')
     ) not like '%Invalid phone%'
     or pg_get_functiondef(
       to_regprocedure('public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)')
     ) not like '%Changed phone validation%' then
    raise exception 'Failed migration did not roll back the first checkout function replacement';
  end if;
end;
$$;
