export type SupportAuthor = 'customer' | 'support'
export type SupportMessageAuthor = SupportAuthor | 'system'
export type SupportStatus = 'open' | 'closed'

export interface SupportOrderItem {
  title: string
  quantity: number
  unitPrice: number
}

export interface SupportMessage {
  id: string
  author: SupportMessageAuthor
  text: string
  sentAt: string
  readBySupport: boolean
  readByCustomer?: boolean
}

export interface ManualDelivery {
  id: string
  orderItemId: string
  title: string
  activationCode: string
  login: string
  password: string
  additionalData: string
  instructions: string
  createdAt: string
  updatedAt: string
  revision: number
  history: ManualDeliveryAuditEntry[]
}

export interface ManualDeliveryAuditEntry {
  revision: number
  changedFields: string[]
  changedAt: string
  changedBy: string | null
}

export interface ManualDeliveryInput {
  orderItemId: string
  title: string
  activationCode: string
  login: string
  password: string
  additionalData: string
  instructions: string
}

export interface ManualDeliveryIssueResult {
  deliveryIds: string[]
  messageId: string
  fulfillmentStatus: 'processing' | 'delivered'
}

export interface ManualDeliveryUpdateResult {
  delivery: ManualDelivery
  messageId: string | null
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
