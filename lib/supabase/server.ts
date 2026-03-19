import { createClient } from '@supabase/supabase-js'

// Server-side Supabase client for API routes
// Uses service role key for admin operations, or user access token for auth checks
export function createServerSupabaseClient(accessToken?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''

  if (!url) return null

  // If access token provided, create authenticated client
  if (accessToken) {
    return createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false },
    })
  }

  // Fallback: service role for admin operations
  if (serviceKey) {
    return createClient(url, serviceKey, {
      auth: { persistSession: false },
    })
  }

  return null
}

// Verify a Supabase access token and return user info
export async function verifySupabaseToken(accessToken: string): Promise<{ userId: string; email: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''
  if (!url || !anonKey || !accessToken) return null

  try {
    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false },
    })
    const { data: { user }, error } = await client.auth.getUser()
    if (error || !user) return null
    return { userId: user.id, email: user.email || '' }
  } catch {
    return null
  }
}
