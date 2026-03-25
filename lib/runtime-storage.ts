import { isElectron, getRuntimeConfig, setRuntimeConfig } from '@/lib/platform';

const LEGACY_RUNTIME_STORAGE_KEY = 'runtime_key_draft_v1';

type RuntimeStoreLoadResult<T> = {
  value: T;
  source: 'secure' | 'migrated_local' | 'local' | 'default';
};

type RuntimeStoreSaveResult = {
  ok: boolean;
  source: 'secure' | 'local';
  message?: string;
};

function readLegacyRuntimeJson() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(LEGACY_RUNTIME_STORAGE_KEY) || '';
}

function clearLegacyRuntimeJson() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LEGACY_RUNTIME_STORAGE_KEY);
}

export async function loadStoredRuntimeDraft<T>(options: {
  defaults: T;
  merge: (defaults: T, parsed: unknown) => T;
}): Promise<RuntimeStoreLoadResult<T>> {
  const { defaults, merge } = options;

  if (typeof window === 'undefined') {
    return { value: defaults, source: 'default' };
  }

  if (isElectron() || typeof localStorage !== 'undefined') {
    try {
      const secureRaw = await getRuntimeConfig();

      if (secureRaw && secureRaw.trim()) {
        clearLegacyRuntimeJson();
        return {
          value: merge(defaults, JSON.parse(secureRaw)),
          source: 'secure'
        };
      }

      const legacyRaw = readLegacyRuntimeJson();
      if (legacyRaw.trim()) {
        const migrated = merge(defaults, JSON.parse(legacyRaw));
        const saved = await setRuntimeConfig(JSON.stringify(migrated));
        if (saved) {
          clearLegacyRuntimeJson();
          return {
            value: migrated,
            source: 'migrated_local'
          };
        }
        return {
          value: migrated,
          source: 'local'
        };
      }
    } catch {
      const legacyRaw = readLegacyRuntimeJson();
      if (legacyRaw.trim()) {
        try {
          return {
            value: merge(defaults, JSON.parse(legacyRaw)),
            source: 'local'
          };
        } catch {
          clearLegacyRuntimeJson();
        }
      }
    }
  }

  return { value: defaults, source: 'default' };
}

export async function saveStoredRuntimeDraft<T>(value: T): Promise<RuntimeStoreSaveResult> {
  const raw = JSON.stringify(value);

  if (typeof window === 'undefined') {
    return {
      ok: false,
      source: 'local',
      message: '브라우저 환경이 아닙니다.'
    };
  }

  const saved = await setRuntimeConfig(raw);
  if (saved) {
    clearLegacyRuntimeJson();
    return {
      ok: true,
      source: isElectron() ? 'secure' : 'local',
      message: isElectron() ? undefined : '브라우저 모드에서 로컬 저장소에 저장했습니다.'
    };
  }

  localStorage.setItem(LEGACY_RUNTIME_STORAGE_KEY, raw);
  return {
    ok: true,
    source: 'local',
    message: '브라우저 모드에서 로컬 저장소에 저장했습니다.'
  };
}
