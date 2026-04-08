import { NextResponse } from 'next/server';

export async function GET() {
  const appId = process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: 'META_APP_ID not configured' }, { status: 500 });
  }

  // redirect_uri: 환경변수 META_OAUTH_REDIRECT_URI가 있으면 사용, 없으면 자동 구성
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI || baseUrl + '/meta/connect';

  const scopes = 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights';

  console.log('[OAuth Start] redirect_uri:', JSON.stringify(redirectUri), '| encoded:', encodeURIComponent(redirectUri));
  const oauthUrl = `https://www.instagram.com/oauth/authorize?force_reauth=true&client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}`;

  return NextResponse.redirect(oauthUrl);
}
