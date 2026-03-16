import {
  createDefaultMcpHubDraft,
  mergeMcpHubDraft,
  type McpHubDraft
} from '@/lib/mcp-connections';
import { loadStoredSecureJson, saveStoredSecureJson } from '@/lib/secure-json-store';

const MCP_HUB_STORAGE_KEY = 'mcp_connection_hub_v1';

export async function loadStoredMcpHubDraft() {
  const defaults = createDefaultMcpHubDraft();
  return loadStoredSecureJson<McpHubDraft>({
    storageKey: MCP_HUB_STORAGE_KEY,
    defaults,
    merge: mergeMcpHubDraft
  });
}

export async function saveStoredMcpHubDraft(value: McpHubDraft) {
  return saveStoredSecureJson(MCP_HUB_STORAGE_KEY, value);
}
