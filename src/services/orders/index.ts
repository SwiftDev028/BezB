import { supabaseConfigured } from '../supabase'
import { supabaseOrdersRepository } from './supabaseOrdersRepository'
import { localOrdersRepository } from './localOrdersRepository'
import type { OrdersRepository } from './OrdersRepository'

/** Точка подключения backend: заменить на HttpOrdersRepository (см. docs/BACKEND.md). */
export const ordersRepository: OrdersRepository = supabaseConfigured ? supabaseOrdersRepository : localOrdersRepository

export type { OrdersRepository }
