import { NextResponse } from 'next/server';

export async function GET() {
  const appId = process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: 'META_APP_ID not configured' }, { status: 500 });
  }

  const redirectUri = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/meta/connect`
    : 'http://localhost:3000/meta/connect';

  const scopes = 'instagram_business_basic,instagram_business_manage_insights';

  const oauthUrl = `https://api.instagram.com/oauth/authorize?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}`;

  return NextResponse.redirect(oauthUrl);
}
