import { NextResponse } from 'next/server';

export async function GET() {
  const appId = process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: 'META_APP_ID not configured' }, { status: 500 });
  }

  // Meta 앱에 등록된 리디렉션 URI (https 필수)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = baseUrl.replace('http://', 'https://') + '/meta/connect';

  const scopes = 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights';

  const oauthUrl = `https://www.instagram.com/oauth/authorize?force_reauth=true&client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}`;

  return NextResponse.redirect(oauthUrl);
}
