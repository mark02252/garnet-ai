export type RuntimeDraft = {
  runProfile: 'manual' | 'free';
  llmProvider: 'openai' | 'gemini' | 'groq' | 'local' | 'openclaw' | 'claude';
  openaiApiKey: string;
  openaiModel: string;
  geminiApiKey: string;
  geminiModel: string;
  groqApiKey: string;
  groqModel: string;
  localBaseUrl: string;
  localModel: string;
  localApiKey: string;
  openclawAgent: string;
  anthropicApiKey: string;
  anthropicModel: string;
  searchApiKey: string;
  searchIncludeDomains: string;
  searchExcludeDomains: string;
};

export type SeminarRuntimeDraft = RuntimeDraft & {
  seminarDebateCycles: number;
};

export const defaultRuntimeDraft: RuntimeDraft = {
  runProfile: 'free',
  llmProvider: 'openclaw',
  openaiApiKey: '',
  openaiModel: '',
  geminiApiKey: '',
  geminiModel: '',
  groqApiKey: '',
  groqModel: '',
  localBaseUrl: '',
  localModel: '',
  localApiKey: '',
  openclawAgent: '',
  anthropicApiKey: '',
  anthropicModel: '',
  searchApiKey: '',
  searchIncludeDomains: '',
  searchExcludeDomains: ''
};

export const defaultSeminarRuntimeDraft: SeminarRuntimeDraft = {
  ...defaultRuntimeDraft,
  seminarDebateCycles: 1
};

function pickString(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback;
}

function pickRunProfile(value: unknown, fallback: RuntimeDraft['runProfile']) {
  return value === 'manual' || value === 'free' ? value : fallback;
}

function pickProvider(value: unknown, fallback: RuntimeDraft['llmProvider']) {
  return value === 'openai' || value === 'gemini' || value === 'groq' || value === 'local' || value === 'openclaw' || value === 'claude'
    ? value
    : fallback;
}

export function mergeRuntimeDraft(defaults: RuntimeDraft, parsed: unknown): RuntimeDraft {
  const candidate = parsed && typeof parsed === 'object' ? (parsed as Partial<RuntimeDraft>) : {};

  return {
    runProfile: pickRunProfile(candidate.runProfile, defaults.runProfile),
    llmProvider: pickProvider(candidate.llmProvider, defaults.llmProvider),
    openaiApiKey: pickString(candidate.openaiApiKey, defaults.openaiApiKey),
    openaiModel: pickString(candidate.openaiModel, defaults.openaiModel),
    geminiApiKey: pickString(candidate.geminiApiKey, defaults.geminiApiKey),
    geminiModel: pickString(candidate.geminiModel, defaults.geminiModel),
    groqApiKey: pickString(candidate.groqApiKey, defaults.groqApiKey),
    groqModel: pickString(candidate.groqModel, defaults.groqModel),
    localBaseUrl: pickString(candidate.localBaseUrl, defaults.localBaseUrl),
    localModel: pickString(candidate.localModel, defaults.localModel),
    localApiKey: pickString(candidate.localApiKey, defaults.localApiKey),
    openclawAgent: pickString(candidate.openclawAgent, defaults.openclawAgent),
    anthropicApiKey: pickString(candidate.anthropicApiKey, defaults.anthropicApiKey),
    anthropicModel: pickString(candidate.anthropicModel, defaults.anthropicModel),
    searchApiKey: pickString(candidate.searchApiKey, defaults.searchApiKey),
    searchIncludeDomains: pickString(candidate.searchIncludeDomains, defaults.searchIncludeDomains),
    searchExcludeDomains: pickString(candidate.searchExcludeDomains, defaults.searchExcludeDomains)
  };
}

export function mergeSeminarRuntimeDraft(defaults: SeminarRuntimeDraft, parsed: unknown): SeminarRuntimeDraft {
  const candidate = parsed && typeof parsed === 'object' ? (parsed as Partial<SeminarRuntimeDraft>) : {};

  return {
    ...mergeRuntimeDraft(defaults, candidate),
    seminarDebateCycles: Math.max(
      1,
      Math.min(3, Math.floor(Number(candidate.seminarDebateCycles ?? defaults.seminarDebateCycles) || 1))
    )
  };
}
