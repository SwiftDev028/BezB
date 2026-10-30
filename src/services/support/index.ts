import { supabaseConfigured } from '../supabase'
import { localSupportRepository } from './localSupportRepository'
import { supabaseSupportRepository } from './supabaseSupportRepository'

export const supportRepository = supabaseConfigured ? supabaseSupportRepository : localSupportRepository
export { localSupportRepository, supabaseSupportRepository }
export type { SupportRepository } from './SupportRepository'
