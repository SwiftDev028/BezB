import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/202610260001_optional_checkout_phone_and_guest_claim.sql?raw'
import checkoutMigration from '../../../supabase/migrations/202610220003_xbox_game_pass_catalog_and_cost_status.sql?raw'

function checkoutFunction(name: 'place_public_order' | 'place_buyer_order'): string {
  const start = checkoutMigration.indexOf(`create or replace function public.${name}(`)
  const bodyStart = checkoutMigration.indexOf('as $$', start)
  const end = checkoutMigration.indexOf('$$;', bodyStart + 5)
  expect(start, `missing ${name} definition`).toBeGreaterThanOrEqual(0)
  expect(bodyStart, `missing ${name} body`).toBeGreaterThan(start)
  expect(end, `unterminated ${name} definition`).toBeGreaterThan(bodyStart)
  return checkoutMigration.slice(bodyStart, end)
}

describe('optional checkout phone and guest claim SQL contract', () => {
  it('updates both existing checkout RPCs without changing their signatures', () => {
    expect(migration).toContain("public.place_public_order(text,text,text,text,text,boolean,jsonb)")
    expect(migration).toContain("public.place_buyer_order(text,text,text,text,text,boolean,jsonb,uuid)")
    expect(migration).toContain("regexp_count(v_definition, v_pattern) <> 1")
    expect(migration).toContain("coalesce(btrim(p_customer_phone)")
    expect(migration).toContain("is not null and length(btrim(p_customer_phone)) not between 5 and 40")
    expect(migration).toContain("Invalid phone")
    expect(migration).toContain("if regexp_count(v_definition, v_pattern) <> 1 then")
    expect(migration).toContain("execute v_definition")
  })

  it('allows an omitted phone while retaining length checks for a provided phone', () => {
    expect(migration).toMatch(/if nullif\(btrim\(coalesce\(p_customer_phone,/)
    expect(migration).toMatch(/is not null and length\(btrim\(p_customer_phone\)\) not between 5 and 40/)
    expect(migration).toMatch(/'btrim\(p_customer_phone\)'[\s\S]*'coalesce\(btrim\(p_customer_phone\),/)
  })

  it.each(['place_public_order', 'place_buyer_order'] as const)(
    'retains %s consent, server price, and availability checks in its source definition',
    (name) => {
      const body = checkoutFunction(name)
      expect(body).toMatch(/p_consent is distinct from true/i)
      expect(body).toMatch(/expected_price[\s\S]*v_product\.unit_price/i)
      expect(body).toMatch(/p\.active\s*=\s*true/i)
      expect(body).toMatch(/p\.publication_status\s*=\s*'published'/i)
      expect(body).toMatch(/p\.availability\s*=\s*'in_stock'/i)
    },
  )

  it('fails closed unless exactly one known required-phone block is present', () => {
    expect(migration).toMatch(/regexp_count\(v_definition,\s*v_pattern\)\s*<>\s*1/)
    expect(migration).toMatch(/Unexpected phone validation in %; refusing to alter checkout RPC/)
    expect(migration).toMatch(/v_definition := regexp_replace\(v_definition,\s*v_pattern,\s*v_replacement\)/)
  })

  it('claims only unowned orders matching the confirmed Auth email', () => {
    expect(migration).toMatch(/security definer[\s\S]*set search_path = ''[\s\S]*auth\.uid\(\)/i)
    expect(migration).toMatch(/u\.email_confirmed_at is not null/i)
    expect(migration).toMatch(/o\.customer_user_id is null/i)
    expect(migration).toMatch(/lower\(btrim\(o\.customer_email\)\)\s*=\s*lower\(btrim\(v_email\)\)/i)
    expect(migration).toMatch(/revoke all on function public\.claim_guest_orders\(\) from public, anon, authenticated/i)
    expect(migration).toMatch(/grant execute on function public\.claim_guest_orders\(\) to authenticated/i)
  })
})
