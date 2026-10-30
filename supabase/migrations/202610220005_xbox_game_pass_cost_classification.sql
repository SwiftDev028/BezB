-- Reconcile internal cost classifications after the catalog preparation.
-- This migration changes only purchase_cost_status and cost_updated_at; it never
-- changes retail prices, procurement amounts, products, availability, or suppliers.
begin;

do $$
declare
  v_conflicts text;
begin
  if to_regclass('public.products') is null
     or to_regclass('public.internal_purchase_costs') is null then
    raise exception 'Expected products and internal_purchase_costs before cost classification';
  end if;

  with expected(product_id, purchase_cost, purchase_cost_status) as (values
    ('xbox-game-pass-ultimate-1-month',1199,'confirmed'),
    ('xbox-game-pass-ultimate-2-months',2300,'confirmed'),
    ('xbox-game-pass-ultimate-3-months',2900,'confirmed'),
    ('xbox-game-pass-ultimate-4-months',4500,'confirmed'),
    ('xbox-game-pass-ultimate-5-months',5044,'estimate'),
    ('xbox-game-pass-ultimate-6-months',5589,'estimate'),
    ('xbox-game-pass-ultimate-7-months',6133,'estimate'),
    ('xbox-game-pass-ultimate-11-months',8311,'estimate'),
    ('xbox-game-pass-ultimate-12-months-bonus-1',9400,'confirmed'),
    ('xbox-game-pass-premium-1-month',1000,'confirmed'),
    ('xbox-game-pass-essential-3-months',1400,'confirmed'),
    ('pc-game-pass-3-months',1600,'confirmed'),
    ('pc-game-pass-6-months',3200,'confirmed'),
    ('pc-game-pass-9-months',4300,'confirmed'),
    ('pc-game-pass-12-months',5300,'confirmed')
  )
  select string_agg(e.product_id, ', ' order by e.product_id)
    into v_conflicts
  from expected e
  left join (
    select p.*, count(*) over (partition by p.product_id) as variant_count
    from public.products p
  ) p on p.product_id=e.product_id
  left join public.internal_purchase_costs c
    on c.product_id=p.product_id and c.region=p.region
  where p.product_id is null
     or p.variant_count <> 1
     or p.region is distinct from ''
     or c.product_id is null
     or c.purchase_cost is distinct from e.purchase_cost::numeric
     or c.purchase_currency is distinct from 'RUB';

  if v_conflicts is not null then
    raise exception 'Xbox cost values or product variants do not match the approved seed: %', v_conflicts;
  end if;

  if has_table_privilege('anon','public.internal_purchase_costs','select')
     or has_table_privilege('anon','public.internal_purchase_costs','insert')
     or has_table_privilege('anon','public.internal_purchase_costs','update')
     or has_table_privilege('anon','public.internal_purchase_costs','delete') then
    raise exception 'internal_purchase_costs is accessible to anon';
  end if;
end;
$$;

with expected(product_id, purchase_cost, purchase_cost_status) as (values
  ('xbox-game-pass-ultimate-1-month',1199,'confirmed'),
  ('xbox-game-pass-ultimate-2-months',2300,'confirmed'),
  ('xbox-game-pass-ultimate-3-months',2900,'confirmed'),
  ('xbox-game-pass-ultimate-4-months',4500,'confirmed'),
  ('xbox-game-pass-ultimate-5-months',5044,'estimate'),
  ('xbox-game-pass-ultimate-6-months',5589,'estimate'),
  ('xbox-game-pass-ultimate-7-months',6133,'estimate'),
  ('xbox-game-pass-ultimate-11-months',8311,'estimate'),
  ('xbox-game-pass-ultimate-12-months-bonus-1',9400,'confirmed'),
  ('xbox-game-pass-premium-1-month',1000,'confirmed'),
  ('xbox-game-pass-essential-3-months',1400,'confirmed'),
  ('pc-game-pass-3-months',1600,'confirmed'),
  ('pc-game-pass-6-months',3200,'confirmed'),
  ('pc-game-pass-9-months',4300,'confirmed'),
  ('pc-game-pass-12-months',5300,'confirmed')
)
update public.internal_purchase_costs c
set purchase_cost_status=e.purchase_cost_status,
    cost_updated_at=case
      when c.purchase_cost_status is distinct from e.purchase_cost_status then now()
      else c.cost_updated_at
    end
from expected e
join public.products p on p.product_id=e.product_id
where c.product_id=p.product_id
  and c.region=p.region
  and c.purchase_cost=e.purchase_cost::numeric
  and c.purchase_currency='RUB';

do $$
declare
  v_conflicts text;
begin
  with expected(product_id, purchase_cost, purchase_cost_status) as (values
    ('xbox-game-pass-ultimate-1-month',1199,'confirmed'),
    ('xbox-game-pass-ultimate-2-months',2300,'confirmed'),
    ('xbox-game-pass-ultimate-3-months',2900,'confirmed'),
    ('xbox-game-pass-ultimate-4-months',4500,'confirmed'),
    ('xbox-game-pass-ultimate-5-months',5044,'estimate'),
    ('xbox-game-pass-ultimate-6-months',5589,'estimate'),
    ('xbox-game-pass-ultimate-7-months',6133,'estimate'),
    ('xbox-game-pass-ultimate-11-months',8311,'estimate'),
    ('xbox-game-pass-ultimate-12-months-bonus-1',9400,'confirmed'),
    ('xbox-game-pass-premium-1-month',1000,'confirmed'),
    ('xbox-game-pass-essential-3-months',1400,'confirmed'),
    ('pc-game-pass-3-months',1600,'confirmed'),
    ('pc-game-pass-6-months',3200,'confirmed'),
    ('pc-game-pass-9-months',4300,'confirmed'),
    ('pc-game-pass-12-months',5300,'confirmed')
  )
  select string_agg(e.product_id, ', ' order by e.product_id)
    into v_conflicts
  from expected e
  join (
    select p.*, count(*) over (partition by p.product_id) as variant_count
    from public.products p
  ) p on p.product_id=e.product_id and p.variant_count=1 and p.region=''
  left join public.internal_purchase_costs c
    on c.product_id=p.product_id and c.region=p.region
  where c.product_id is null
     or c.purchase_cost is distinct from e.purchase_cost::numeric
     or c.purchase_currency is distinct from 'RUB'
     or c.purchase_cost_status is distinct from e.purchase_cost_status;

  if v_conflicts is not null then
    raise exception 'Xbox cost classification verification failed: %', v_conflicts;
  end if;
end;
$$;

commit;
