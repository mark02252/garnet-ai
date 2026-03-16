import { contextBridge } from 'electron';
import { ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  savePdfReport: (suggestedName?: string) => ipcRenderer.invoke('report:save-pdf', { suggestedName }),
  getRuntimeConfig: () => ipcRenderer.invoke('runtime-config:get'),
  saveRuntimeConfig: (runtimeJson: string) => ipcRenderer.invoke('runtime-config:set', { runtimeJson }),
  getAppConfig: (key: string) => ipcRenderer.invoke('app-config:get', { key }),
  saveAppConfig: (key: string, configJson: string) => ipcRenderer.invoke('app-config:set', { key, configJson }),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  getUpdateConfig: () => ipcRenderer.invoke('updater:get-config'),
  saveUpdateConfig: (updateUrl: string) => ipcRenderer.invoke('updater:set-config', { updateUrl })
});
