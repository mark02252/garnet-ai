export const INSTAGRAM_LOGIN_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_insights',
  'instagram_manage_comments',
  'instagram_content_publish'
] as const;

export const META_BUSINESS_SCOPES = [
  'instagram_basic',
  'instagram_manage_insights',
  'pages_show_list',
  'pages_read_engagement',
  'business_management'
] as const;

export type InstagramConnectionMode = 'instagram_login' | 'meta_business';
export type InstagramTokenSource = 'none' | 'manual' | 'oauth_short_lived' | 'oauth_long_lived';

export type MetaConnectedInstagramAccount = {
  pageId: string;
  pageName: string;
  instagramBusinessAccountId: string;
  username: string;
  profilePictureUrl?: string;
};

export type MetaConnectionDraft = {
  loginMode: InstagramConnectionMode;
  appId: string;
  appSecret: string;
  redirectUri: string;
  graphApiVersion: string;
  instagramBusinessAccountId: string;
  accessToken: string;
  scopes: string[];
  connectedAccounts: MetaConnectedInstagramAccount[];
  tokenSource: InstagramTokenSource;
  tokenExpiresIn: number | null;
  lastConnectedAt: string;
  lastOauthState: string;
};

export function isLikelyMetaAppId(value: string) {
  return /^\d{6,}$/.test(value.trim());
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

function sanitizeAccount(value: unknown): MetaConnectedInstagramAccount | null {
  const record = asRecord(value);
  if (!record) return null;

  const pageId = asString(record.pageId);
  const pageName = asString(record.pageName);
  const instagramBusinessAccountId = asString(record.instagramBusinessAccountId);
  const username = asString(record.username);
  const profilePictureUrl = asString(record.profilePictureUrl);

  if (!instagramBusinessAccountId || !username) return null;

  return {
    pageId,
    pageName,
    instagramBusinessAccountId,
    username,
    profilePictureUrl: profilePictureUrl || undefined
  };
}

export function getDefaultScopesForConnectionMode(mode: InstagramConnectionMode) {
  return mode === 'instagram_login' ? [...INSTAGRAM_LOGIN_SCOPES] : [...META_BUSINESS_SCOPES];
}

export function createDefaultMetaConnectionDraft(origin = ''): MetaConnectionDraft {
  return {
    loginMode: 'instagram_login',
    appId: '',
    appSecret: '',
    redirectUri: origin ? `${origin}/meta/connect` : '',
    graphApiVersion: 'v25.0',
    instagramBusinessAccountId: '',
    accessToken: '',
    scopes: getDefaultScopesForConnectionMode('instagram_login'),
    connectedAccounts: [],
    tokenSource: 'none',
    tokenExpiresIn: null,
    lastConnectedAt: '',
    lastOauthState: ''
  };
}

export function mergeMetaConnectionDraft(defaults: MetaConnectionDraft, parsed: unknown): MetaConnectionDraft {
  const record = asRecord(parsed);
  if (!record) return defaults;

  const connectedAccounts = Array.isArray(record.connectedAccounts)
    ? record.connectedAccounts
        .map(sanitizeAccount)
        .filter((item): item is MetaConnectedInstagramAccount => Boolean(item))
    : defaults.connectedAccounts;

  const loginMode = asString(record.loginMode);
  const normalizedMode: InstagramConnectionMode =
    loginMode === 'meta_business' || loginMode === 'instagram_login' ? loginMode : defaults.loginMode;
  const scopes = asStringArray(record.scopes);
  const tokenSource = asString(record.tokenSource);

  return {
    loginMode: normalizedMode,
    appId: asString(record.appId) || defaults.appId,
    appSecret: asString(record.appSecret) || defaults.appSecret,
    redirectUri: asString(record.redirectUri) || defaults.redirectUri,
    graphApiVersion: asString(record.graphApiVersion) || defaults.graphApiVersion,
    instagramBusinessAccountId: asString(record.instagramBusinessAccountId) || defaults.instagramBusinessAccountId,
    accessToken: asString(record.accessToken) || defaults.accessToken,
    scopes: scopes.length ? scopes : getDefaultScopesForConnectionMode(normalizedMode),
    connectedAccounts,
    tokenSource:
      tokenSource === 'manual' ||
      tokenSource === 'oauth_short_lived' ||
      tokenSource === 'oauth_long_lived' ||
      tokenSource === 'none'
        ? tokenSource
        : defaults.tokenSource,
    tokenExpiresIn:
      typeof record.tokenExpiresIn === 'number' && Number.isFinite(record.tokenExpiresIn)
        ? Math.max(0, Math.round(record.tokenExpiresIn))
        : defaults.tokenExpiresIn,
    lastConnectedAt: asString(record.lastConnectedAt) || defaults.lastConnectedAt,
    lastOauthState: asString(record.lastOauthState) || defaults.lastOauthState
  };
}

export function buildInstagramConnectionOAuthUrl(
  draft: Pick<MetaConnectionDraft, 'appId' | 'redirectUri' | 'graphApiVersion' | 'scopes' | 'loginMode'>,
  state: string
) {
  const appId = draft.appId.trim() || (typeof process !== 'undefined' ? process.env.META_APP_ID ?? '' : '');
  const redirectUri = draft.redirectUri.trim();
  if (!appId || !redirectUri) return '';

  if (draft.loginMode === 'instagram_login') {
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: draft.scopes.join(','),
      state
    });

    return `https://api.instagram.com/oauth/authorize?${params.toString()}`;
  }

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: draft.scopes.join(','),
    state
  });

  return `https://www.facebook.com/${draft.graphApiVersion}/dialog/oauth?${params.toString()}`;
}
