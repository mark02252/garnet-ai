/**
 * Meta Token Manager
 * 토큰 만료 추적 + 자동 갱신 + 상태 관리
 */

const TOKEN_REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000; // 만료 1일 전에 갱신 시도
const TOKEN_STORAGE_KEY = 'meta_token_expiry';

export type TokenStatus = 'valid' | 'expiring_soon' | 'expired' | 'unknown';

export function getTokenExpiryTimestamp(): number | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
  return stored ? Number(stored) : null;
}

export function setTokenExpiry(expiresInSeconds: number) {
  if (typeof window === 'undefined') return;
  const expiryTimestamp = Date.now() + expiresInSeconds * 1000;
  localStorage.setItem(TOKEN_STORAGE_KEY, String(expiryTimestamp));
}

export function getTokenStatus(): TokenStatus {
  const expiry = getTokenExpiryTimestamp();
  if (!expiry) return 'unknown';
  const now = Date.now();
  if (now > expiry) return 'expired';
  if (now > expiry - TOKEN_REFRESH_BUFFER_MS) return 'expiring_soon';
  return 'valid';
}

export function getTokenRemainingDays(): number | null {
  const expiry = getTokenExpiryTimestamp();
  if (!expiry) return null;
  const remaining = expiry - Date.now();
  return Math.max(0, Math.floor(remaining / (24 * 60 * 60 * 1000)));
}

/**
 * 토큰 자동 갱신 시도
 * 성공 시 새 토큰 반환, 실패 시 null
 */
export async function tryRefreshToken(currentToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
} | null> {
  try {
    const res = await fetch('/api/meta/token/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: currentToken }),
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      accessToken?: string;
      expiresIn?: number;
      error?: string;
    };

    if (!data.accessToken) return null;

    // 만료 시간 저장
    if (data.expiresIn) {
      setTokenExpiry(data.expiresIn);
    }

    return {
      accessToken: data.accessToken,
      expiresIn: data.expiresIn || 5184000, // 기본 60일
    };
  } catch {
    return null;
  }
}

/**
 * 토큰 상태 체크 + 필요 시 자동 갱신
 * 대시보드/분석 페이지 로드 시 호출
 */
export async function ensureValidToken(currentToken: string): Promise<{
  token: string;
  status: TokenStatus;
  refreshed: boolean;
}> {
  const status = getTokenStatus();

  // 만료되었거나 곧 만료될 예정이면 갱신 시도
  if (status === 'expired' || status === 'expiring_soon') {
    const refreshed = await tryRefreshToken(currentToken);
    if (refreshed) {
      return {
        token: refreshed.accessToken,
        status: 'valid',
        refreshed: true,
      };
    }
    // 갱신 실패
    return {
      token: currentToken,
      status: status === 'expired' ? 'expired' : 'expiring_soon',
      refreshed: false,
    };
  }

  return { token: currentToken, status, refreshed: false };
}
