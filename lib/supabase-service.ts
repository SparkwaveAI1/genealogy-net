import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://oxpkqnmuwqcnmzvavsuz.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''

// Use a placeholder key if env var is not set — this allows the build to succeed
// but service role operations will fail at runtime until the real key is configured
const effectiveKey = supabaseServiceKey || 'placeholder-key-for-build-time'

/**
 * Service role Supabase client for server-side operations.
 * This client bypasses Row Level Security (RLS) and should only be used
 * in trusted server environments (API routes, server actions).
 *
 * NEVER expose this client to the browser or client-side code.
 */
export const supabaseService = createClient(supabaseUrl, effectiveKey, {
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
