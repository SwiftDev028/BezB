import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/202610220003_xbox_game_pass_catalog_and_cost_status.sql?raw'

function checkoutFunction(name: 'place_public_order' | 'place_buyer_order'): string {
  const start = migration.indexOf(`create or replace function public.${name}(`)
  const end = migration.indexOf('$$;', migration.indexOf('as $$', start) + 5)
  expect(start, `missing ${name} definition`).toBeGreaterThanOrEqual(0)
  expect(end, `unterminated ${name} definition`).toBeGreaterThan(start)
  return migration.slice(start, end)
}

describe('optional digital checkout address SQL contract', () => {
  const addressCases: Array<[string, string | null, string | null]> = [
    ['NULL', null, null],
    ['empty', '', null],
    ['whitespace-only', '   ', null],
    ['non-empty', '  apt  ', 'apt'],
  ]

  it.each(['place_public_order', 'place_buyer_order'] as const)(
    '%s normalizes every supported address form',
    (name) => {
      const body = checkoutFunction(name)
      const normalizedValue = "nullif(btrim(coalesce(p_delivery_address,'')),'')"

      // This is a source-contract regression test; runtime behavior still needs PostgreSQL validation.
      expect(body.replace(/\s+/g, '').toLowerCase()).toContain(normalizedValue)
      expect(body).toMatch(/nullif\(btrim\(coalesce\(p_delivery_address,\s*''\)\),\s*''\)\s+is\s+not\s+null/i)
      expect(body).toMatch(/length\(btrim\(p_delivery_address\)\)\s+not\s+between\s+3\s+and\s+500/i)
      expect(body).not.toMatch(/p_delivery_address\s+is\s+null\s+or\s+length\(btrim\(p_delivery_address\)\)/i)

      for (const [label, supplied, expected] of addressCases) {
        const normalized = supplied?.trim() || null
        expect(normalized, `${label} address normalization`).toBe(expected)
      }
    },
  )
})
