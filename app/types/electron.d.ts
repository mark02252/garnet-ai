export {};

declare global {
  interface Window {
    electronAPI?: {
      platform?: string;
      savePdfReport?: (suggestedName?: string) => Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
      getRuntimeConfig?: () => Promise<{
        ok: boolean;
        status: string;
        message: string;
        runtimeJson?: string;
        storageMode?: 'safeStorage' | 'none';
      }>;
      saveRuntimeConfig?: (runtimeJson: string) => Promise<{
        ok: boolean;
        status: string;
        message: string;
        storageMode?: 'safeStorage' | 'none';
      }>;
      getAppConfig?: (key: string) => Promise<{
        ok: boolean;
        status: string;
        message: string;
        configJson?: string;
        storageMode?: 'safeStorage' | 'none';
      }>;
      saveAppConfig?: (key: string, configJson: string) => Promise<{
        ok: boolean;
        status: string;
        message: string;
        storageMode?: 'safeStorage' | 'none';
      }>;
      checkForUpdates?: () => Promise<{
        ok: boolean;
        status: string;
        message: string;
        currentVersion?: string;
        availableVersion?: string;
        updateUrl?: string;
        configSource?: 'saved' | 'env' | 'bundled' | 'none';
      }>;
      downloadUpdate?: () => Promise<{
        ok: boolean;
        status: string;
        message: string;
        availableVersion?: string;
      }>;
      installUpdate?: () => Promise<{ ok: boolean; status: string; message: string }>;
      getUpdateConfig?: () => Promise<{ ok: boolean; updateUrl?: string; source?: 'saved' | 'env' | 'bundled' | 'none' }>;
      saveUpdateConfig?: (updateUrl: string) => Promise<{
        ok: boolean;
        status: string;
        message: string;
        updateUrl?: string;
      }>;
    };
  }
}
