/** Чистая логика админки каталога: подписи, фильтрация, расчёт маржи, проверка формы. Без обращений к сети. */

export type Publication = 'draft' | 'published' | 'hidden'
export type Availability = 'in_stock' | 'out_of_stock' | 'unavailable'

export interface AdminProduct {
  product_id: string
  region: string
  slug: string
  group_id: string | null
  title: string
  brand: string
  platform: string | null
  category: string
  product_type: string
  denomination: number | string | null
  denomination_currency: string | null
  subscription_months?: number | string | null
  subscription_bonus_months?: number | string | null
  unit_price: number | string
  availability: Availability
  publication_status: Publication
  image_url: string | null
  description: string | null
  activation_instructions: string | null
  restrictions: unknown
  updated_at?: string | null
}

export const publicationLabels: Record<Publication, string> = {
  draft: 'Черновик',
  published: 'Опубликован',
  hidden: 'Скрыт',
}

export const availabilityLabels: Record<Availability, string> = {
  in_stock: 'В наличии',
  out_of_stock: 'Нет в наличии',
  unavailable: 'Недоступен',
}

/** Покупатель видит вариант, только если он опубликован и в наличии (так же считает база). */
export function isLive(p: Pick<AdminProduct, 'publication_status' | 'availability'>): boolean {
  return p.publication_status === 'published' && p.availability === 'in_stock'
}

export const variantKey = (p: Pick<AdminProduct, 'product_id' | 'region'>) => `${p.product_id}|${p.region}`

export function denominationLabel(p: Pick<AdminProduct, 'denomination' | 'denomination_currency'>): string {
  if (p.denomination === null || p.denomination === undefined || p.denomination === '') return ''
  return `${Number(p.denomination)} ${p.denomination_currency ?? ''}`.trim()
}

/** Короткое описание варианта: «Турция · 100 TRY». */
export function variantLabel(p: AdminProduct): string {
  return [p.region || null, denominationLabel(p) || null].filter(Boolean).join(' · ') || 'Без региона и номинала'
}

const translit: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map((ch) => translit[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Предлагаемые SKU и slug нового варианта из названия, региона и номинала. */
export function suggestIds(title: string, region: string, denomination: string, currency: string, months = '', bonusMonths = '') {
  const base = slugify(title)
  const term = months.trim() ? `${months.trim()}-months${bonusMonths.trim() && Number(bonusMonths) > 0 ? `-bonus-${bonusMonths.trim()}` : ''}` : ''
  const parts = [base, slugify(region), denomination.trim() ? slugify(`${denomination} ${currency}`) : '', term].filter(Boolean)
  const slug = parts.join('-')
  return { product_id: slug, slug }
}

export interface Cost {
  cost: number
  currency: string
  supplier: string
  status: 'confirmed'
}

interface MappingRow {
  product_id: string
  region: string
  purchase_cost: number | string
  purchase_currency: string
  purchase_cost_status?: 'confirmed' | 'estimated' | 'estimate' | 'unverified' | null
  suppliers?: { name?: string; status?: string } | null
}

/** Лучшая подтверждённая цена по варианту среди supplier-linked и внутренних записей. */
export function bestCosts(mappings: MappingRow[]): Map<string, Cost> {
  const result = new Map<string, Cost>()
  for (const m of mappings) {
    if (m.purchase_cost_status !== 'confirmed') continue
    if (m.suppliers?.status && m.suppliers.status !== 'active') continue
    const entry: Cost = { cost: Number(m.purchase_cost), currency: m.purchase_currency, supplier: m.suppliers?.name ?? '', status: 'confirmed' }
    const key = variantKey(m)
    const current = result.get(key)
    // сравниваем только одну валюту; рублёвая закупка приоритетнее — по ней считается маржа
    const better =
      !current ||
      (entry.currency === 'RUB' && current.currency !== 'RUB') ||
      (entry.currency === current.currency && entry.cost < current.cost)
    if (better) result.set(key, entry)
  }
  return result
}

export function margin(price: number, cost: Cost | undefined): { profit: number; percent: number } | null {
  if (!cost || cost.currency !== 'RUB' || !Number.isFinite(price) || price <= 0) return null
  const profit = price - cost.cost
  return { profit, percent: (profit / price) * 100 }
}

export type StatusView = 'all' | 'live' | 'draft' | 'hidden' | 'no_stock'

export interface AdminFilters {
  query: string
  view: StatusView
  category: string
  sort: 'title' | 'price-asc' | 'price-desc' | 'updated'
}

export const defaultAdminFilters: AdminFilters = { query: '', view: 'all', category: 'all', sort: 'title' }

export function matchesView(p: AdminProduct, view: StatusView): boolean {
  switch (view) {
    case 'live':
      return isLive(p)
    case 'draft':
      return p.publication_status === 'draft'
    case 'hidden':
      return p.publication_status === 'hidden'
    case 'no_stock':
      return p.availability !== 'in_stock'
    default:
      return true
  }
}

export function filterAdminProducts(rows: AdminProduct[], f: AdminFilters): AdminProduct[] {
  const words = f.query.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean)
  const list = rows.filter((p) => {
    if (f.category !== 'all' && p.category !== f.category) return false
    if (!matchesView(p, f.view)) return false
    if (words.length === 0) return true
    const hay = [p.title, p.product_id, p.slug, p.brand, p.region, denominationLabel(p), p.platform ?? '']
      .join(' ')
      .toLowerCase()
      .replace(/ё/g, 'е')
    return words.every((w) => hay.includes(w))
  })
  const copy = [...list]
  switch (f.sort) {
    case 'price-asc':
      return copy.sort((a, b) => Number(a.unit_price) - Number(b.unit_price))
    case 'price-desc':
      return copy.sort((a, b) => Number(b.unit_price) - Number(a.unit_price))
    case 'updated':
      return copy.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
    default:
      return copy.sort((a, b) => a.title.localeCompare(b.title, 'ru') || (a.region ?? '').localeCompare(b.region ?? '', 'ru'))
  }
}

export function countByView(rows: AdminProduct[]): Record<StatusView, number> {
  return {
    all: rows.length,
    live: rows.filter((p) => matchesView(p, 'live')).length,
    draft: rows.filter((p) => matchesView(p, 'draft')).length,
    hidden: rows.filter((p) => matchesView(p, 'hidden')).length,
    no_stock: rows.filter((p) => matchesView(p, 'no_stock')).length,
  }
}

export interface ProductForm {
  product_id: string
  slug: string
  group_id: string
  title: string
  brand: string
  platform: string
  category: string
  product_type: string
  region: string
  denomination: string
  denomination_currency: string
  subscription_months: string
  subscription_bonus_months: string
  unit_price: string
  image_url: string
  description: string
  activation_instructions: string
  restrictions: string
  availability: Availability
  publication_status: Publication
}

export type FormErrors = Partial<Record<keyof ProductForm, string>>

export function validateProductForm(f: ProductForm): FormErrors {
  const e: FormErrors = {}
  if (!f.title.trim()) e.title = 'Укажите название.'
  if (!f.brand.trim()) e.brand = 'Укажите бренд.'
  if (!f.product_id.trim()) e.product_id = 'Укажите SKU.'
  else if (!/^[a-z0-9][a-z0-9._-]*$/i.test(f.product_id.trim())) e.product_id = 'SKU: латиница, цифры, точка, дефис или подчёркивание.'
  if (!f.slug.trim()) e.slug = 'Укажите адрес страницы.'
  else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.slug.trim())) e.slug = 'Адрес: строчная латиница, цифры и дефисы.'
  const price = Number(f.unit_price)
  if (f.unit_price.trim() === '' || !Number.isFinite(price) || price <= 0) e.unit_price = 'Цена продажи должна быть больше нуля.'
  if (f.denomination.trim() !== '') {
    const d = Number(f.denomination)
    if (!Number.isFinite(d) || d <= 0) e.denomination = 'Номинал должен быть больше нуля.'
    else if (!f.denomination_currency.trim()) e.denomination_currency = 'Укажите валюту номинала.'
  } else if (f.denomination_currency.trim()) {
    e.denomination = 'Укажите номинал или очистите валюту.'
  }
  if (f.subscription_months.trim() !== '') {
    const months = Number(f.subscription_months)
    if (!Number.isInteger(months) || months < 1 || months > 120) e.subscription_months = 'Срок должен быть целым числом от 1 до 120 месяцев.'
  }
  if (f.subscription_bonus_months.trim() !== '') {
    const bonus = Number(f.subscription_bonus_months)
    if (!Number.isInteger(bonus) || bonus < 0 || bonus > 120) e.subscription_bonus_months = 'Бонусный срок должен быть целым числом от 0 до 120 месяцев.'
    else if (!f.subscription_months.trim()) e.subscription_months = 'Укажите основной срок подписки для бонусных месяцев.'
  }
  if (f.product_type !== 'subscription' && (f.subscription_months.trim() || f.subscription_bonus_months.trim())) {
    e.subscription_months = 'Срок можно указать только для подписки.'
  }
  if (f.image_url.trim() && !/^https:\/\/\S+$/i.test(f.image_url.trim())) e.image_url = 'Ссылка должна начинаться с https://'
  return e
}

/** Предупреждения не блокируют сохранение, но их стоит заметить до публикации. */
export function publishWarnings(f: ProductForm, cost: Cost | undefined): string[] {
  const warnings: string[] = []
  if (f.publication_status !== 'published') return warnings
  if (!f.image_url.trim()) warnings.push('У товара нет изображения.')
  if (!f.description.trim()) warnings.push('Нет описания.')
  if (!f.activation_instructions.trim()) warnings.push('Нет инструкции по активации.')
  if (f.product_type === 'subscription' && !f.subscription_months.trim()) warnings.push('Не указан структурированный срок подписки.')
  const m = margin(Number(f.unit_price), cost)
  if (m && m.profit <= 0) warnings.push('Цена продажи не выше закупочной: товар продаётся без прибыли или в убыток.')
  if (!cost) warnings.push('Не указана подтверждённая закупочная стоимость (раздел «Поставщики»).')
  return warnings
}

/** Сообщение об ошибке Supabase/Postgres понятным языком. Ошибки Postgrest — не Error, поэтому читаем message сами. */
export function describeError(e: unknown, fallback: string): string {
  const err = e as { message?: string; code?: string } | null
  const message = err && typeof err === 'object' && typeof err.message === 'string' ? err.message : ''
  switch (err?.code) {
    case '23505':
      return 'Такой SKU, адрес страницы или вариант (SKU + регион) уже существует.'
    case '23503':
      return 'Нельзя изменить или удалить: на этот вариант ссылаются коды, заказы или закупки.'
    case '23514':
      return `Значение не прошло проверку базы данных. ${message}`.trim()
    case '42501':
      return 'Недостаточно прав для этого действия. Войдите как администратор.'
  }
  if (/row-level security/i.test(message)) return 'Недостаточно прав для этого действия. Войдите как администратор.'
  return message || fallback
}
