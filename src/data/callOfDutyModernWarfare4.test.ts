import { describe, expect, it } from 'vitest'
import costMigration from '../../supabase/migrations/202611020001_internal_purchase_costs.sql?raw'
import migration from '../../supabase/migrations/202611020002_call_of_duty_modern_warfare_4.sql?raw'
import { banners } from './banners'
import { getGame } from './games'

describe('Call of Duty: Modern Warfare 4 catalog integration', () => {
  it('connects the home banner to the PS5 game page and local artwork', () => {
    const game = getGame('call-of-duty-modern-warfare-4')
    const banner = banners.find((item) => item.id === 'call-of-duty-modern-warfare-4')

    expect(game?.platforms).toEqual([{ category: 'playstation', label: 'PlayStation 5' }])
    expect(banner?.to).toBe('/game/call-of-duty-modern-warfare-4')
    expect(banner?.image).toBe('images/games/call-of-duty-modern-warfare-4.jpg')
    expect(banner?.imageAlt).toContain('Call of Duty: Modern Warfare')
    expect(banner?.text).toContain('Standard Edition и Vault Edition')
  })

  it('seeds only the specified editions, prices, regions, and private purchase costs', () => {
    expect(migration).toContain("'call-of-duty-modern-warfare-4-ps5-standard'")
    expect(migration).toContain("'call-of-duty-modern-warfare-4-ps5-vault'")
    expect(migration).toContain("'Южная Корея'")
    expect(migration).toContain("'США'")
    expect(migration).toMatch(/8400,\s*7015,/)
    expect(migration).toMatch(/8990,\s*7550,/)
    expect(migration).toMatch(/'in_stock', 'published'/)
    expect(migration).toContain('insert into public.internal_purchase_costs')
    expect(migration).toMatch(/on conflict \(product_id, region\) do nothing/gi)
    expect(migration).not.toMatch(/insert into public\.(?:supplier_products|digital_codes|order_deliveries)/i)
    expect(migration).not.toMatch(/update public\.(?:products|internal_purchase_costs)/i)
  })

  it('preserves public catalog separation and fails on conflicting existing rows', () => {
    expect(migration).toContain('internal_purchase_costs must retain RLS and deny anon access')
    expect(migration).toContain('catalog_public must not expose internal purchase costs')
    expect(migration).toContain('conflict with existing catalog rows')
    expect(migration).toContain('Existing internal purchase costs conflict with supplied values')
  })

  it('uses the separate private-cost migration and denies non-admin access via RLS', () => {
    expect(costMigration).toContain('create table if not exists public.internal_purchase_costs')
    expect(costMigration).toContain('numeric(12,2)')
    expect(costMigration).toContain('primary key (product_id, region)')
    expect(costMigration).toContain('references public.products(product_id, region)')
    expect(costMigration).toContain('alter table public.internal_purchase_costs enable row level security')
    expect(costMigration).toContain('revoke all on public.internal_purchase_costs from public, anon, authenticated')
    expect(costMigration).toContain('using (public.is_admin())')
    expect(costMigration).toContain('as restrictive for all to authenticated')
    expect(costMigration).not.toMatch(/create\s+(?:or replace\s+)?(?:view|function)\b/i)
    expect(migration).not.toMatch(/create\s+(?:or replace\s+)?(?:view|function)\b/i)
  })

  it('validates check-constraint meaning without depending on PostgreSQL formatting', () => {
    expect(costMigration).toContain('pg_catalog.pg_get_expr(c.conbin, c.conrelid)')
    expect(costMigration).toContain('pg_catalog.pg_attrdef')
    expect(costMigration).toContain('has incompatible column defaults')
    expect(costMigration).toContain("'purchase_cost>=0'")
    expect(costMigration).toContain("'purchase_currency=''rub'''")
    expect(costMigration).toContain(
      "'purchase_cost_status=anyarray[''confirmed'',''estimated'',''estimate'',''unverified'']'",
    )
    expect(costMigration).not.toContain('pg_catalog.pg_get_constraintdef(c.oid)')

    expect(migration).toContain("'active=publication_status=''published''andavailability=''in_stock'''")
    expect(migration).toContain("'product_type=anyarray[''gift-card'',''game'',''subscription'',''topup'']'")
    expect(migration).toContain("'category=anyarray[''apple'',''xbox'',''playstation'',''steam'',''ai'']'")
  })

  it('serializes reruns and does not overwrite existing catalog or cost records', () => {
    expect(costMigration).toContain('pg_catalog.pg_advisory_xact_lock(20261102, 1)')
    expect(migration).toContain('pg_catalog.pg_advisory_xact_lock(20261102, 2)')
    expect(migration).toMatch(/on conflict \(product_id, region\) do nothing/gi)
    expect(migration).not.toMatch(/update\s+public\.(?:products|internal_purchase_costs)/i)
    expect(migration).toContain('Existing internal purchase costs conflict with supplied values')
  })
})
