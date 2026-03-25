// lib/platform.ts
// Platform-agnostic bridge — works in Tauri, Electron, and browser

export function isElectron(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

export function isDesktop(): boolean {
  return isElectron() || isTauri();
}

// Secure storage: Electron safeStorage → localStorage fallback
export async function getSecureConfig(key: string): Promise<string | null> {
  if (isElectron()) {
    try {
      const result = await (window as any).electronAPI.getAppConfig(key);
      if (result?.ok && result?.configJson) return result.configJson;
    } catch { /* fallthrough */ }
  }
  // Tauri and browser: use localStorage
  try {
    return localStorage.getItem(`garnet_config_${key}`);
  } catch {
    return null;
  }
}

export async function setSecureConfig(key: string, value: string): Promise<boolean> {
  if (isElectron()) {
    try {
      const result = await (window as any).electronAPI.saveAppConfig(key, value);
      return result?.ok ?? false;
    } catch { /* fallthrough */ }
  }
  try {
    localStorage.setItem(`garnet_config_${key}`, value);
    return true;
  } catch {
    return false;
  }
}

export async function getRuntimeConfig(): Promise<string | null> {
  if (isElectron()) {
    try {
      const result = await (window as any).electronAPI.getRuntimeConfig();
      if (result?.ok && result?.runtimeJson) return result.runtimeJson;
    } catch { /* fallthrough */ }
  }
  try {
    return localStorage.getItem('garnet_runtime_config');
  } catch {
    return null;
  }
}

export async function setRuntimeConfig(json: string): Promise<boolean> {
  if (isElectron()) {
    try {
      const result = await (window as any).electronAPI.saveRuntimeConfig(json);
      return result?.ok ?? false;
    } catch { /* fallthrough */ }
  }
  try {
    localStorage.setItem('garnet_runtime_config', json);
    return true;
  } catch {
    return false;
  }
}
