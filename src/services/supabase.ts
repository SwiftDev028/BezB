import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabaseConfigured = Boolean(url && key)
let diagnosticRequestId = 0

const diagnosticFetch: typeof fetch = async (input, init) => {
  const requestUrl = input instanceof Request
    ? input.url
    : input instanceof URL
      ? input.href
      : input
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
  const retryHeader = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    .get('x-retry-count')
  const attempt = Number(retryHeader ?? 0) + 1
  const requestId = ++diagnosticRequestId
  const startedAt = performance.now()
  let path = 'unknown'

  try {
    path = new URL(requestUrl, url).pathname
  } catch {
    // Keep diagnostics useful without exposing request input.
  }

  console.debug('[Supabase dev]', { event: 'request', requestId, attempt, method, path })
  try {
    const response = await fetch(input, init)
    console.debug('[Supabase dev]', {
      event: 'response',
      requestId,
      attempt,
      method,
      path,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    })
    return response
  } catch (error) {
    console.warn('[Supabase dev]', {
      event: 'network-error',
      requestId,
      attempt,
      method,
      path,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      durationMs: Math.round(performance.now() - startedAt),
    })
    throw error
  }
}

export const supabase = supabaseConfigured ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  global: { fetch: import.meta.env.DEV ? diagnosticFetch : fetch },
}) : null

export function requireSupabase() {
  if (!supabase) throw new Error('Supabase не настроен. Добавьте публичные VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY при сборке сайта.')
  return supabase
}
