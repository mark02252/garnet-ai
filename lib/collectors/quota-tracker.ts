interface QuotaConfig { dailyLimit: number; monthlyLimit?: number; }

interface QuotaState {
  dailyUsed: number; monthlyUsed: number;
  lastResetDate: string; lastMonthlyResetMonth: string;
}

const DEFAULT_QUOTAS: Record<string, QuotaConfig> = {
  YOUTUBE: { dailyLimit: 8000 },
  TWITTER: { monthlyLimit: 8000 },
  REDDIT: { dailyLimit: 5000 },
  SERPER: { dailyLimit: 500 },
  NAVER: { dailyLimit: 20000 },
};

const state = new Map<string, QuotaState>();

function getState(platform: string): QuotaState {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  let s = state.get(platform);

  if (!s) {
    s = { dailyUsed: 0, monthlyUsed: 0, lastResetDate: today, lastMonthlyResetMonth: month };
    state.set(platform, s);
    return s;
  }

  if (s.lastResetDate !== today) { s.dailyUsed = 0; s.lastResetDate = today; }
  if (s.lastMonthlyResetMonth !== month) { s.monthlyUsed = 0; s.lastMonthlyResetMonth = month; }
  return s;
}

export function checkQuota(platform: string): { canProceed: boolean; remaining: number } {
  const config = DEFAULT_QUOTAS[platform];
  if (!config) return { canProceed: true, remaining: Infinity };

  const s = getState(platform);
  if (config.monthlyLimit) {
    const remaining = config.monthlyLimit - s.monthlyUsed;
    return { canProceed: remaining > 0, remaining };
  }
  const remaining = config.dailyLimit - s.dailyUsed;
  return { canProceed: remaining > 0, remaining };
}

export function consumeQuota(platform: string, units: number = 1): void {
  const s = getState(platform);
  s.dailyUsed += units;
  s.monthlyUsed += units;
}

export function resetAllQuotas(): void { state.clear(); }
