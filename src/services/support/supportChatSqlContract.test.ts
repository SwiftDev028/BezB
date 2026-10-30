import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/202610300001_support_chat.sql?raw'
import guestClaimMigration from '../../../supabase/migrations/202610260001_optional_checkout_phone_and_guest_claim.sql?raw'

function functionBody(name: string, schema = 'public'): string {
  const declaration = migration.indexOf(`function ${schema}.${name}(`)
  const start = migration.lastIndexOf('create', declaration)
  const bodyStart = migration.indexOf('as $$', start)
  const end = migration.indexOf('$$;', bodyStart + 5)
  expect(start, `missing ${name}`).toBeGreaterThanOrEqual(0)
  expect(bodyStart, `missing ${name} body`).toBeGreaterThan(start)
  expect(end, `unterminated ${name}`).toBeGreaterThan(bodyStart)
  return migration.slice(bodyStart, end)
}

describe('support chat migration security contract', () => {
  it('creates one thread per existing order and attaches future orders transactionally', () => {
    expect(migration).toMatch(/order_id uuid not null unique references public\.orders\(id\)/i)
    expect(migration).toMatch(/support_threads \([\s\S]*id uuid primary key default pg_catalog\.gen_random_uuid\(\)/i)
    expect(migration).toMatch(/support_messages \([\s\S]*id uuid primary key default pg_catalog\.gen_random_uuid\(\)/i)
    expect(migration).toMatch(/after insert on public\.orders[\s\S]*create_support_thread_for_order/i)
    expect(migration).toMatch(/insert into public\.support_threads\(order_id\)\s*select o\.id from public\.orders/i)
  })

  it('stores only a SHA-256 token hash and returns the raw guest token only from guest checkout/reissue RPCs', () => {
    expect(migration).toMatch(/gen_random_bytes\(32\)/i)
    expect(migration).toMatch(/digest\(convert_to\(v_token, 'UTF8'\), 'sha256'\)/i)
    expect(functionBody('place_public_order_with_support')).toContain("'guest_access_token'")
    expect(functionBody('place_buyer_order_with_support')).not.toContain('guest_access_token')
    expect(functionBody('support_customer_get_thread')).not.toContain('guest_token_hash')
  })

  it('stores guest idempotency keys and response data without storing a raw chat token', () => {
    expect(migration).toMatch(/create table if not exists public\.support_guest_checkout_requests/i)
    expect(migration).toMatch(/idempotency_key_hash bytea primary key check \(octet_length\(idempotency_key_hash\) = 32\)/i)
    expect(migration).toMatch(/request_fingerprint_hash bytea not null check \(octet_length\(request_fingerprint_hash\) = 32\)/i)
    expect(migration).toMatch(/alter table public\.support_guest_checkout_requests enable row level security/i)
    expect(migration).toMatch(/revoke all on public\.support_threads, public\.support_messages, public\.support_guest_checkout_requests from public, anon, authenticated/i)
    expect(functionBody('place_public_order_with_support')).toMatch(/digest\(convert_to\(p_idempotency_key::text, 'UTF8'\), 'sha256'\)/i)
    const checkout = functionBody('place_public_order_with_support')
    expect(checkout).toContain("'items', coalesce((")
    expect(checkout).toContain('jsonb_array_elements(')
    expect(checkout).toContain("'quantity', item.value->'quantity'")
    expect(checkout).toContain("'expected_price', item.value->'expected_price'")
    expect(functionBody('place_public_order_with_support')).toMatch(/on conflict \(idempotency_key_hash\) do nothing/i)
    expect(functionBody('place_public_order_with_support')).toMatch(/for update/i)
    expect(functionBody('place_public_order_with_support')).toMatch(/request_fingerprint_hash <> v_fingerprint_hash/i)
    expect(functionBody('place_public_order_with_support')).toMatch(/set order_id = v_order_id, response_payload = v_order/i)
    expect(functionBody('place_public_order_with_support')).toMatch(/v_token := bezb_private\.issue_guest_token\(v_order_id\)/i)
    expect(functionBody('place_public_order_with_support')).toMatch(/customer_user_id is null/i)
  })

  it('requires account ownership or a matching, non-revoked bearer token', () => {
    expect(functionBody('can_access_support_thread', 'bezb_private')).toMatch(/o\.customer_user_id = \(select auth\.uid\(\)\)/i)
    expect(functionBody('can_access_support_thread', 'bezb_private')).toMatch(/o\.customer_user_id is null/i)
    expect(functionBody('can_access_support_thread', 'bezb_private')).toMatch(/guest_access_revoked_at is null/i)
    expect(functionBody('can_access_support_thread', 'bezb_private')).toMatch(/guest_token_hash = extensions\.digest/i)
    expect(functionBody('support_customer_get_thread')).toContain('can_access_support_thread')
    expect(functionBody('support_customer_send_message')).toMatch(/o\.customer_user_id is null/i)
    expect(functionBody('support_customer_send_message')).toMatch(/guest_access_revoked_at is null/i)
    expect(functionBody('support_customer_mark_read')).toContain('can_access_support_thread')
  })

  it('revokes guest credentials when a guest order is claimed by an account', () => {
    const body = functionBody('revoke_guest_support_on_claim', 'bezb_private')
    const claimBody = guestClaimMigration.slice(
      guestClaimMigration.indexOf('create or replace function public.claim_guest_orders()'),
    )
    expect(body).toMatch(/old\.customer_user_id is null and new\.customer_user_id is not null/i)
    expect(body).toMatch(/guest_token_hash = null/i)
    expect(migration).toMatch(/create trigger orders_revoke_guest_support_on_claim[\s\S]*after update of customer_user_id\s+on public\.orders/i)
    expect(claimBody).toMatch(/set customer_user_id = v_user_id/i)
    expect(claimBody).toMatch(/where o\.customer_user_id is null/i)
  })

  it('preserves authenticated owner access after guest access is disabled', () => {
    const accessCheck = functionBody('can_access_support_thread', 'bezb_private')
    expect(accessCheck).toMatch(/auth\.uid\(\) is not null and o\.customer_user_id = \(select auth\.uid\(\)\)/i)
    expect(accessCheck).toMatch(/or\s*\(\s*o\.customer_user_id is null/i)
    for (const name of [
      'support_admin_list_threads',
      'support_admin_get_thread',
      'support_admin_send_message',
      'support_admin_set_status',
    ]) {
      expect(functionBody(name), name).toMatch(/not public\.is_admin\(\)/i)
    }
  })

  it('derives sender roles on the server and checks admin membership for every admin mutation', () => {
    expect(functionBody('support_customer_send_message')).toContain("v_sender_role := 'customer'")
    expect(functionBody('support_customer_send_message')).not.toMatch(/p_(author|role)/i)
    for (const name of [
      'support_admin_list_threads',
      'support_admin_get_thread',
      'support_admin_send_message',
      'support_admin_set_status',
      'support_admin_revoke_guest_access',
      'support_admin_reissue_guest_access',
      'support_admin_send_delivered_codes',
    ]) {
      expect(functionBody(name), name).toMatch(/not public\.is_admin\(\)/i)
    }
    expect(functionBody('support_admin_send_message')).toContain("'manager'")
  })

  it('marks customer messages read before returning the manager conversation', () => {
    const body = functionBody('support_admin_get_thread')
    expect(body.indexOf('update public.support_messages')).toBeLessThan(body.indexOf('select jsonb_build_object'))
  })

  it('limits text, protects tables with RLS and denies direct table access', () => {
    expect(migration).toMatch(/check \(length\(btrim\(body\)\) between 1 and 5000\)/i)
    expect(migration).toMatch(/alter table public\.support_threads enable row level security/i)
    expect(migration).toMatch(/alter table public\.support_messages enable row level security/i)
    expect(migration).toMatch(/revoke all on public\.support_threads, public\.support_messages, public\.support_guest_checkout_requests from public, anon, authenticated/i)
  })

  it('shares codes only through a manager function after paid delivery and never exposes them in customer RPCs', () => {
    const delivery = functionBody('support_admin_send_delivered_codes')
    expect(delivery).toMatch(/payment_status <> 'paid'/i)
    expect(delivery).toMatch(/fulfillment_status <> 'delivered'/i)
    expect(delivery).toContain('public.order_deliveries')
    expect(delivery).toMatch(/i\.quantity::bigint as units/i)
    expect(delivery).toMatch(/coalesce\(sum\(item_delivery_counts\.units\), 0\)::bigint as units/i)
    expect(delivery).toMatch(/count\(valid_deliveries\.id\)::bigint as delivered_units/i)
    expect(delivery).toMatch(/bool_or\(item_delivery_counts\.units <> item_delivery_counts\.delivered_units\)/i)
    expect(delivery).toMatch(/v_delivered_count <> v_expected_count/i)
    expect(delivery).toMatch(/c\.assigned_order_id = d\.order_id/i)
    expect(delivery).toMatch(/c\.assigned_order_item_id = d\.order_item_id/i)
    expect(delivery).toMatch(/i\.order_id = d\.order_id/i)
    expect(delivery).toMatch(/i\.product_id = c\.product_id/i)
    expect(delivery).toContain('public.digital_codes')
    expect(delivery).toMatch(/c\.assigned_order_id = d\.order_id/i)
    expect(delivery).toMatch(/c\.assigned_order_item_id = d\.order_item_id/i)
    expect(delivery).toMatch(/i\.order_id = d\.order_id/i)
    expect(delivery).toMatch(/i\.product_id = c\.product_id/i)
    expect(delivery).toMatch(/coalesce\(i\.region, ''\) = c\.region/i)
    expect(functionBody('support_customer_get_thread')).not.toContain('secret_code')
    expect(functionBody('support_customer_send_message')).not.toContain('secret_code')
  })

  it('keeps existing checkout RPC signatures and return contracts untouched', () => {
    expect(migration).toContain('public.place_public_order_with_support(')
    expect(migration).toContain('drop function if exists public.place_public_order_with_support(text,text,text,text,text,boolean,jsonb)')
    expect(migration).toContain('p_items jsonb,\n  p_idempotency_key uuid')
    expect(migration).toContain('place_public_order_with_support(text,text,text,text,text,boolean,jsonb,uuid)')
    expect(migration).toContain('public.place_buyer_order_with_support(')
    expect(migration).toContain('public.place_public_order(')
    expect(migration).toContain('public.place_buyer_order(')
    expect(migration).not.toMatch(/create or replace function public\.place_(public|buyer)_order\(/i)
  })
})
