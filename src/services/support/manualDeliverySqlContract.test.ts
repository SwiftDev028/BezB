import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/202610310001_manual_order_deliveries.sql?raw'

function functionDefinition(name: string): string {
  const declaration = migration.indexOf(`function public.${name}(`)
  const start = migration.lastIndexOf('create or replace', declaration)
  const end = migration.indexOf('$$;', start)
  expect(start, `missing ${name}`).toBeGreaterThanOrEqual(0)
  expect(end, `unterminated ${name}`).toBeGreaterThan(start)
  return migration.slice(start, end)
}

function functionBody(name: string): string {
  const definition = functionDefinition(name)
  const bodyStart = definition.indexOf('as $$')
  expect(bodyStart, `missing ${name} body`).toBeGreaterThanOrEqual(0)
  return definition.slice(bodyStart)
}

describe('manual order delivery migration security contract', () => {
  it('stores secrets only in private RLS-protected tables without client table grants', () => {
    expect(migration).toMatch(/create table if not exists bezb_private\.manual_deliveries/i)
    expect(migration).toMatch(/create table if not exists bezb_private\.manual_delivery_requests/i)
    expect(migration).toMatch(/alter table bezb_private\.manual_deliveries enable row level security/i)
    expect(migration).toMatch(/alter table bezb_private\.manual_delivery_requests enable row level security/i)
    expect(migration).toMatch(/revoke all on bezb_private\.manual_delivery_requests, bezb_private\.manual_deliveries\s+from public, anon, authenticated/i)
    expect(migration).not.toMatch(/grant \w+ on bezb_private\.(manual_deliveries|manual_delivery_requests)/i)
    for (const name of [
      'support_admin_list_manual_deliveries',
      'support_customer_list_manual_deliveries',
      'support_admin_issue_manual_deliveries',
      'support_admin_resend_manual_delivery',
    ]) {
      expect(functionDefinition(name), name).toMatch(/security definer[\s\S]*set search_path = ''/i)
    }
  })

  it('limits mutations and administrative reads to administrators', () => {
    for (const name of [
      'support_admin_list_manual_deliveries',
      'support_admin_issue_manual_deliveries',
      'support_admin_resend_manual_delivery',
    ]) {
      expect(functionBody(name), name).toMatch(/auth\.uid\(\) is null or not public\.is_admin\(\)/i)
    }
    expect(migration).toMatch(/grant execute on function public\.support_admin_issue_manual_deliveries\(uuid, uuid, jsonb\) to authenticated/i)
    expect(migration).toMatch(/grant execute on function public\.support_admin_resend_manual_delivery\(uuid, uuid\) to authenticated/i)
    expect(migration).toMatch(/grant execute on function public\.support_customer_list_manual_deliveries\(uuid, text\) to anon, authenticated/i)
  })

  it('authenticates customer access and verifies every delivered order item', () => {
    const customer = functionBody('support_customer_list_manual_deliveries')
    expect(customer).toContain('from bezb_private.manual_deliveries')
    expect(customer).toContain('can_access_support_thread')
    expect(customer).toContain('where d.order_id = p_order_id')

    const issue = functionBody('support_admin_issue_manual_deliveries')
    expect(issue).toMatch(/v_order\.payment_status <> 'paid'/i)
    expect(issue).toMatch(/where id = v_delivery_item_id and order_id = p_order_id/i)
    expect(issue).toMatch(/v_existing_count \+ v_requested_count > v_item\.quantity/i)
    expect(issue).toMatch(/d\.status = 'reserved'/i)
    expect(issue).toMatch(/bool_or\(delivered\.item_count <> i\.quantity\)/i)
    expect(issue).toMatch(/set status = 'completed', fulfillment_status = 'delivered'/i)
    expect(issue).toMatch(/insert into public\.support_messages/i)
    expect(issue.indexOf('insert into public.support_messages')).toBeLessThan(issue.indexOf("set status = 'completed'"))
  })

  it('uses request-key idempotency and resends only existing deliveries', () => {
    const issue = functionBody('support_admin_issue_manual_deliveries')
    expect(issue).toMatch(/on conflict \(request_key\) do nothing/i)
    expect(issue).toMatch(/request_fingerprint_hash <> v_fingerprint/i)
    expect(issue).toMatch(/if cardinality\(v_request\.delivery_ids\) > 0 then/i)
    const resend = functionBody('support_admin_resend_manual_delivery')
    expect(resend).toMatch(/where d\.id = p_delivery_id and d\.order_id = p_order_id/i)
    expect(resend).not.toMatch(/insert into bezb_private\.manual_deliveries/i)
    expect(resend).toMatch(/insert into public\.support_messages/i)
  })

  it('prevents mixing warehouse assignments after manual delivery begins', () => {
    const assignCode = functionDefinition('admin_assign_code')
    expect(assignCode).toMatch(/security definer[\s\S]*set search_path = ''/i)
    expect(assignCode).toMatch(/auth\.uid\(\) is null or not public\.is_admin\(\)/i)
    expect(assignCode).toMatch(/where d\.order_id = p_order_id/i)
    expect(assignCode).toMatch(/Manual delivery has already started for this order/i)
    expect(assignCode).toMatch(/v_code\.status <> 'available'/i)
    expect(assignCode).toMatch(/v_code\.product_id::text <> v_item\.product_id::text/i)
  })

  it('keeps message bodies free of delivery secrets', () => {
    const issue = functionBody('support_admin_issue_manual_deliveries')
    const resend = functionBody('support_admin_resend_manual_delivery')
    expect(issue).toContain("'BEZB_MANUAL_DELIVERY:'")
    expect(resend).toContain("'BEZB_MANUAL_DELIVERY:'")
    expect(issue).not.toContain('v_code ||')
    expect(resend).not.toContain('activation_code')
  })
})
