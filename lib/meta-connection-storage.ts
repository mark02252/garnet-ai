import {
  createDefaultMetaConnectionDraft,
  mergeMetaConnectionDraft,
  type MetaConnectionDraft
} from '@/lib/meta-connection';
import { loadStoredSecureJson, saveStoredSecureJson } from '@/lib/secure-json-store';

const META_CONNECTION_STORAGE_KEY = 'meta_connection_v1';

export async function loadStoredMetaConnectionDraft(origin = '') {
  const defaults = createDefaultMetaConnectionDraft(origin);
  return loadStoredSecureJson<MetaConnectionDraft>({
    storageKey: META_CONNECTION_STORAGE_KEY,
    defaults,
    merge: mergeMetaConnectionDraft
  });
}

export async function saveStoredMetaConnectionDraft(value: MetaConnectionDraft) {
  return saveStoredSecureJson(META_CONNECTION_STORAGE_KEY, value);
}
