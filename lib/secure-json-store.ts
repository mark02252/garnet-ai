type SecureJsonLoadResult<T> = {
  value: T;
  source: 'secure' | 'migrated_local' | 'local' | 'default';
};

type SecureJsonSaveResult = {
  ok: boolean;
  source: 'secure' | 'local';
  message?: string;
};

function getLegacyStorageKey(storageKey: string) {
  return `secure_json_store:${storageKey}`;
}

function readLegacyJson(storageKey: string) {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(getLegacyStorageKey(storageKey)) || '';
}

function clearLegacyJson(storageKey: string) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(getLegacyStorageKey(storageKey));
}

export async function loadStoredSecureJson<T>(options: {
  storageKey: string;
  defaults: T;
  merge: (defaults: T, parsed: unknown) => T;
}): Promise<SecureJsonLoadResult<T>> {
  const { storageKey, defaults, merge } = options;

  if (typeof window === 'undefined') {
    return { value: defaults, source: 'default' };
  }

  if (window.electronAPI?.getAppConfig) {
    try {
      const result = await window.electronAPI.getAppConfig(storageKey);
      const secureRaw = typeof result.configJson === 'string' ? result.configJson : '';

      if (result.ok && secureRaw.trim()) {
        clearLegacyJson(storageKey);
        return {
          value: merge(defaults, JSON.parse(secureRaw)),
          source: 'secure'
        };
      }

      const legacyRaw = readLegacyJson(storageKey);
      if (legacyRaw.trim()) {
        const migrated = merge(defaults, JSON.parse(legacyRaw));
        if (window.electronAPI?.saveAppConfig) {
          const saveResult = await window.electronAPI.saveAppConfig(storageKey, JSON.stringify(migrated));
          if (saveResult.ok) {
            clearLegacyJson(storageKey);
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
      const legacyRaw = readLegacyJson(storageKey);
      if (legacyRaw.trim()) {
        try {
          return {
            value: merge(defaults, JSON.parse(legacyRaw)),
            source: 'local'
          };
        } catch {
          clearLegacyJson(storageKey);
        }
      }
    }
  } else {
    const legacyRaw = readLegacyJson(storageKey);
    if (legacyRaw.trim()) {
      try {
        return {
          value: merge(defaults, JSON.parse(legacyRaw)),
          source: 'local'
        };
      } catch {
        clearLegacyJson(storageKey);
      }
    }
  }

  return {
    value: defaults,
    source: 'default'
  };
}

export async function saveStoredSecureJson<T>(storageKey: string, value: T): Promise<SecureJsonSaveResult> {
  const raw = JSON.stringify(value);

  if (typeof window === 'undefined') {
    return {
      ok: false,
      source: 'local',
      message: '브라우저 환경이 아닙니다.'
    };
  }

  if (window.electronAPI?.saveAppConfig) {
    const result = await window.electronAPI.saveAppConfig(storageKey, raw);
    if (!result.ok) {
      return {
        ok: false,
        source: 'secure',
        message: result.message
      };
    }
    clearLegacyJson(storageKey);
    return {
      ok: true,
      source: 'secure',
      message: result.message
    };
  }

  localStorage.setItem(getLegacyStorageKey(storageKey), raw);
  return {
    ok: true,
    source: 'local',
    message: '브라우저 모드에서 로컬 저장소에 저장했습니다.'
  };
}
