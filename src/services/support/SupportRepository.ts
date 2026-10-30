import type { Result, SupportAuthor, SupportMessage, SupportOrderRegistration, SupportThread } from '../../types'

/** Repositories can later be replaced with a server-backed implementation. */
export interface SupportRepository {
  readonly kind: 'local-demo' | 'supabase'
  registerOrder(order: SupportOrderRegistration): Promise<Result<SupportThread>>
  confirmDemoPayment(orderId: string): Promise<Result<SupportThread>>
  getThread(orderId: string): Promise<Result<SupportThread | null>>
  listThreads(): Promise<Result<SupportThread[]>>
  sendMessage(orderId: string, author: SupportAuthor, text: string): Promise<Result<SupportThread>>
  markCustomerMessagesRead(orderId: string): Promise<Result<SupportThread>>
  setStatus(orderId: string, status: SupportThread['status']): Promise<Result<SupportThread>>
  getCustomerThread(orderId: string, guestToken?: string): Promise<Result<SupportThread>>
  sendCustomerMessage(orderId: string, guestToken: string | undefined, text: string): Promise<Result<SupportMessage>>
  markCustomerRead(orderId: string, guestToken?: string): Promise<Result<void>>
  listCustomerThreads(): Promise<Result<SupportThread[]>>
  listAdminThreads(): Promise<Result<SupportThread[]>>
  getAdminThread(orderId: string): Promise<Result<SupportThread>>
  sendAdminMessage(orderId: string, text: string): Promise<Result<SupportMessage>>
  setAdminStatus(orderId: string, status: SupportThread['status']): Promise<Result<void>>
  revokeGuestAccess(orderId: string): Promise<Result<void>>
  reissueGuestAccess(orderId: string): Promise<Result<string>>
  sendDeliveredCodes(orderId: string): Promise<Result<SupportMessage>>
}
