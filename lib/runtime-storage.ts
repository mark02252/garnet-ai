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

  if (window.electronAPI?.getRuntimeConfig) {
    try {
      const result = await window.electronAPI.getRuntimeConfig();
      const secureRaw = typeof result.runtimeJson === 'string' ? result.runtimeJson : '';

      if (result.ok && secureRaw.trim()) {
        clearLegacyRuntimeJson();
        return {
          value: merge(defaults, JSON.parse(secureRaw)),
          source: 'secure'
        };
      }

      const legacyRaw = readLegacyRuntimeJson();
      if (legacyRaw.trim()) {
        const migrated = merge(defaults, JSON.parse(legacyRaw));
        if (window.electronAPI?.saveRuntimeConfig) {
          const saveResult = await window.electronAPI.saveRuntimeConfig(JSON.stringify(migrated));
          if (saveResult.ok) {
            clearLegacyRuntimeJson();
            return {
              value: migrated,
              source: 'migrated_local'
            };
          }
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
  } else {
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

  if (window.electronAPI?.saveRuntimeConfig) {
    const result = await window.electronAPI.saveRuntimeConfig(raw);
    if (!result.ok) {
      return {
        ok: false,
        source: 'secure',
        message: result.message
      };
    }
    clearLegacyRuntimeJson();
    return {
      ok: true,
      source: 'secure',
      message: result.message
    };
  }

  localStorage.setItem(LEGACY_RUNTIME_STORAGE_KEY, raw);
  return {
    ok: true,
    source: 'local',
    message: '브라우저 모드에서 로컬 저장소에 저장했습니다.'
  };
}
