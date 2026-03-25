import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    hasAppId: Boolean(process.env.META_APP_ID),
    hasAppSecret: Boolean(process.env.META_APP_SECRET),
    redirectUri: process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/meta/connect`
      : 'http://localhost:3000/meta/connect',
  });
}
