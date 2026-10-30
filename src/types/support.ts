export type SupportAuthor = 'customer' | 'support'
export type SupportStatus = 'open' | 'closed'

export interface SupportOrderItem {
  title: string
  quantity: number
  unitPrice: number
}

export interface SupportMessage {
  id: string
  author: SupportAuthor
  text: string
  sentAt: string
  readBySupport: boolean
  readByCustomer?: boolean
}

export interface SupportThread {
  id?: string
  orderId: string
  orderNumber: string
  createdAt: string
  updatedAt?: string
  lastMessageAt?: string | null
  total: number
  currency: 'RUB'
  items: SupportOrderItem[]
  demoPaymentAt: string | null
  status: SupportStatus
  messages: SupportMessage[]
  paymentStatus?: string
  fulfillmentStatus?: string
  customerName?: string
  customerEmail?: string
  unreadCount?: number
  isGuest?: boolean
  lastMessage?: string | null
}

export interface SupportOrderRegistration {
  orderId: string
  orderNumber: string
  createdAt: string
  total: number
  currency: 'RUB'
  items: SupportOrderItem[]
}
