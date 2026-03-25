import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { InstagramConnectionMode, MetaConnectedInstagramAccount } from '@/lib/meta-connection';

const requestSchema = z
  .object({
    appId: z.string().optional().default(''),
    appSecret: z.string().optional().default(''),
    redirectUri: z.string().url().optional(),
    graphApiVersion: z.string().min(2).default('v25.0'),
    code: z.string().optional().default(''),
    accessToken: z.string().optional().default(''),
    loginMode: z.enum(['instagram_login', 'meta_business']).default('instagram_login'),
    tokenSource: z.enum(['oauth_short_lived', 'oauth_long_lived']).optional(),
    expiresIn: z.number().nullable().optional()
  })
  .superRefine((value, ctx) => {
    if (value.loginMode === 'meta_business') {
      if (!value.appId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['appId'], message: 'App ID가 필요합니다.' });
      }
      if (!value.appSecret) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['appSecret'], message: 'App Secret이 필요합니다.' });
      }
      if (!value.redirectUri) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['redirectUri'], message: 'Redirect URI가 필요합니다.' });
      }
      if (!value.code) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['code'], message: '인증 코드가 필요합니다.' });
      }
      return;
    }

    if (!value.accessToken && !value.code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accessToken'],
        message: '인스타그램 로그인 토큰 또는 인증 코드가 필요합니다.'
      });
    }
  });

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

type TokenPayload = ApiErrorPayload & {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

type MetaAccountsPayload = ApiErrorPayload & {
  data?: Array<{
    id?: string;
    name?: string;
    instagram_business_account?: {
      id?: string;
      username?: string;
      profile_picture_url?: string;
    };
  }>;
};

type InstagramProfilePayload = ApiErrorPayload & {
  id?: string;
  user_id?: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
  account_type?: string;
  data?: Array<{
    id?: string;
    user_id?: string;
    username?: string;
    name?: string;
    profile_picture_url?: string;
    account_type?: string;
  }>;
};

function getApiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback;
  const error = (payload as ApiErrorPayload).error;
  return typeof error?.message === 'string' && error.message.trim() ? error.message : fallback;
}

async function fetchApiJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers || {})
    }
  });

  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    throw new Error(getApiError(payload, `Instagram API 호출 실패 (${response.status})`));
  }

  return payload as T;
}

function normalizeInstagramProfile(payload: InstagramProfilePayload) {
  if (payload.user_id || payload.username) {
    return payload;
  }

  const first = Array.isArray(payload.data) ? payload.data[0] : null;
  if (!first) return null;
  return first;
}

function buildInstagramAccountsFromProfile(
  payload: InstagramProfilePayload
): MetaConnectedInstagramAccount[] {
  const profile = normalizeInstagramProfile(payload);
  if (!profile?.user_id || !profile.username) return [];

  return [
    {
      pageId: '',
      pageName: profile.name || '',
      instagramBusinessAccountId: profile.user_id,
      username: profile.username,
      profilePictureUrl: profile.profile_picture_url || undefined
    }
  ];
}

async function exchangeInstagramLogin(input: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  graphApiVersion: string;
  code: string;
}) {
  // Instagram API용 App ID/Secret 사용 (Meta App ID가 아닌 Instagram App ID)
  const effectiveAppId = process.env.META_APP_ID || input.appId || '';
  const effectiveAppSecret = process.env.META_APP_SECRET || input.appSecret || '';
  // redirect_uri는 OAuth 인증 때와 정확히 일치해야 함 (https 강제)
  let redirectUri = input.redirectUri || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/meta/connect`;
  redirectUri = redirectUri.replace('http://localhost', 'https://localhost');

  const body = new URLSearchParams({
    client_id: effectiveAppId,
    client_secret: effectiveAppSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code: input.code
  });

  // The official docs confirm Instagram Login returns an Instagram User access token,
  // but do not expose the token endpoint directly in the rendered doc HTML. This
  // follows Instagram's standard OAuth token exchange pattern.
  const shortLived = await fetchApiJson<TokenPayload>('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  if (!shortLived.access_token) {
    throw new Error(getApiError(shortLived, '인스타그램 액세스 토큰을 받지 못했습니다.'));
  }

  const profile = await fetchApiJson<InstagramProfilePayload>(
    `https://graph.instagram.com/${input.graphApiVersion}/me?fields=user_id,username,name,profile_picture_url,account_type&access_token=${encodeURIComponent(shortLived.access_token)}`
  );

  return {
    ok: true,
    accessToken: shortLived.access_token,
    expiresIn: typeof shortLived.expires_in === 'number' ? shortLived.expires_in : 3600,
    tokenSource: 'oauth_short_lived' as const,
    accounts: buildInstagramAccountsFromProfile(profile)
  };
}

async function hydrateInstagramLoginToken(input: {
  accessToken: string;
  graphApiVersion: string;
  tokenSource?: 'oauth_short_lived' | 'oauth_long_lived';
  expiresIn?: number | null;
}) {
  const profile = await fetchApiJson<InstagramProfilePayload>(
    `https://graph.instagram.com/${input.graphApiVersion}/me?fields=user_id,username,name,profile_picture_url,account_type&access_token=${encodeURIComponent(input.accessToken)}`
  );

  return {
    ok: true,
    accessToken: input.accessToken,
    expiresIn: typeof input.expiresIn === 'number' ? input.expiresIn : null,
    tokenSource: input.tokenSource || ('oauth_long_lived' as const),
    accounts: buildInstagramAccountsFromProfile(profile)
  };
}

async function exchangeMetaBusinessLogin(input: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  graphApiVersion: string;
  code: string;
}) {
  const codeParams = new URLSearchParams({
    client_id: input.appId,
    client_secret: input.appSecret,
    redirect_uri: input.redirectUri,
    code: input.code
  });

  const shortLived = await fetchApiJson<TokenPayload>(
    `https://graph.facebook.com/${input.graphApiVersion}/oauth/access_token?${codeParams.toString()}`
  );

  if (!shortLived.access_token) {
    throw new Error(getApiError(shortLived, 'Meta 액세스 토큰을 받지 못했습니다.'));
  }

  let accessToken = shortLived.access_token;
  let expiresIn = typeof shortLived.expires_in === 'number' ? shortLived.expires_in : null;
  let tokenSource: 'oauth_short_lived' | 'oauth_long_lived' = 'oauth_short_lived';

  try {
    const exchangeParams = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: input.appId,
      client_secret: input.appSecret,
      fb_exchange_token: accessToken
    });

    const longLived = await fetchApiJson<TokenPayload>(
      `https://graph.facebook.com/${input.graphApiVersion}/oauth/access_token?${exchangeParams.toString()}`
    );

    if (longLived.access_token) {
      accessToken = longLived.access_token;
      expiresIn = typeof longLived.expires_in === 'number' ? longLived.expires_in : expiresIn;
      tokenSource = 'oauth_long_lived';
    }
  } catch {
    // Keep the short-lived token when the long-lived exchange is not available.
  }

  const accountsPayload = await fetchApiJson<MetaAccountsPayload>(
    `https://graph.facebook.com/${input.graphApiVersion}/me/accounts?fields=id,name,instagram_business_account{id,username,profile_picture_url}&access_token=${encodeURIComponent(accessToken)}`
  );

  const accounts = (accountsPayload.data || [])
    .map<MetaConnectedInstagramAccount | null>((page) => {
      const instagram = page.instagram_business_account;
      if (!instagram?.id || !instagram.username) return null;
      return {
        pageId: page.id || '',
        pageName: page.name || '',
        instagramBusinessAccountId: instagram.id,
        username: instagram.username,
        profilePictureUrl: instagram.profile_picture_url || undefined
      };
    })
    .filter((value): value is MetaConnectedInstagramAccount => Boolean(value));

  return {
    ok: true,
    accessToken,
    expiresIn,
    tokenSource,
    accounts
  };
}

export async function POST(req: Request) {
  try {
    const input = requestSchema.parse(await req.json());
    const mode: InstagramConnectionMode = input.loginMode;

    const result =
      mode === 'instagram_login'
        ? input.accessToken
          ? await hydrateInstagramLoginToken({
              accessToken: input.accessToken,
              graphApiVersion: input.graphApiVersion,
              tokenSource: input.tokenSource,
              expiresIn: input.expiresIn
            })
          : await exchangeInstagramLogin({
              appId: input.appId,
              appSecret: input.appSecret,
              redirectUri: input.redirectUri || '',
              graphApiVersion: input.graphApiVersion,
              code: input.code
            })
        : await exchangeMetaBusinessLogin({
            appId: input.appId,
            appSecret: input.appSecret,
            redirectUri: input.redirectUri || '',
            graphApiVersion: input.graphApiVersion,
            code: input.code
          });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : '인스타그램 로그인 교환에 실패했습니다.'
      },
      { status: 400 }
    );
  }
}
