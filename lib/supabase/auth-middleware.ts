import { NextRequest, NextResponse } from 'next/server'
import { verifySupabaseToken } from './server'

export type AuthResult = {
  authenticated: boolean
  userId?: string
  email?: string
}

// Extract and verify Supabase token from request
// Returns user info if authenticated, or allows anonymous access if Supabase is not configured
export async function authenticateRequest(req: NextRequest): Promise<AuthResult> {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  // If no Supabase URL configured, allow anonymous (local dev mode)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { authenticated: true, userId: 'local', email: 'local@garnet.dev' }
  }

  // If no token provided, allow anonymous in development
  if (!token) {
    if (process.env.NODE_ENV === 'development') {
      return { authenticated: true, userId: 'dev', email: 'dev@garnet.dev' }
    }
    return { authenticated: false }
  }

  const user = await verifySupabaseToken(token)
  if (!user) return { authenticated: false }
  return { authenticated: true, ...user }
}

// Helper to return 401 response
export function unauthorizedResponse() {
  return NextResponse.json({ error: '인증이 필요합니다. 로그인해 주세요.' }, { status: 401 })
}
