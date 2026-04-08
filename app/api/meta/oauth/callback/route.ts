import { NextRequest, NextResponse } from 'next/server';

/**
 * OAuth Callback Proxy
 * Instagram redirects to https://localhost:3000/api/meta/oauth/callback?code=...
 * This route extracts the code and redirects to the client page via http
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code') || '';
  const error = req.nextUrl.searchParams.get('error_description') || req.nextUrl.searchParams.get('error') || '';

  if (error) {
    return NextResponse.redirect(
      new URL(`/meta/connect?error=${encodeURIComponent(error)}`, req.url.replace('https://', 'http://'))
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/meta/connect?error=no_code', req.url.replace('https://', 'http://'))
    );
  }

  // Redirect to the client page with the code, using http for localhost
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const clientUrl = `${baseUrl}/meta/connect?code=${encodeURIComponent(code)}`;

  return NextResponse.redirect(clientUrl);
}
