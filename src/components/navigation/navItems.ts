export interface NavItem {
  to: string
  label: string
}

export const mainNav: NavItem[] = [
  { to: '/catalog', label: 'Каталог' },
  { to: '/category/apple', label: 'Apple' },
  { to: '/category/xbox', label: 'Xbox' },
  { to: '/category/playstation', label: 'PlayStation' },
  { to: '/category/steam', label: 'Steam' },
  { to: '/category/ai', label: 'AI' },
]

export const infoNav: NavItem[] = [
  { to: '/about', label: 'О магазине' },
  { to: '/faq', label: 'Вопросы и ответы' },
  { to: '/delivery', label: 'Получение товаров' },
  { to: '/contacts', label: 'Контакты' },
]

export const legalNav: NavItem[] = [
  { to: '/terms', label: 'Условия использования' },
  { to: '/privacy', label: 'Политика конфиденциальности' },
  { to: '/refunds', label: 'Правила возврата и отмены заказа' },
  { to: '/admin/orders', label: 'Админ-панель' },
]
