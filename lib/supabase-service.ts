import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://oxpkqnmuwqcnmzvavsuz.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''

if (!supabaseServiceKey) {
  console.warn('[supabase-service] WARNING: SUPABASE_SERVICE_ROLE_KEY is not set. Service role client will not work properly.')
}

/**
 * Service role Supabase client for server-side operations.
 * This client bypasses Row Level Security (RLS) and should only be used
 * in trusted server environments (API routes, server actions).
 * 
 * NEVER expose this client to the browser or client-side code.
 */
export const supabaseService = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})

/**
 * Type alias for clarity - makes it explicit this is the service role client
 */
export type ServiceSupabaseClient = typeof supabaseService
