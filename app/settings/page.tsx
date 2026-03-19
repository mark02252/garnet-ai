'use client';

import { useEffect, useMemo, useState } from 'react';
import { McpConnectionHub } from '@/components/mcp-connection-hub';
import { McpInspector } from '@/components/mcp-inspector';
import { MetaConnectionPanel } from '@/components/meta-connection-panel';
import { PlaywrightSmokePack } from '@/components/playwright-smoke-pack';
import { SupabaseAuthPanel } from '@/components/supabase-auth-panel';
import {
  AGENT_EXECUTION_KEY,
  BUSINESS_CONTEXT_KEY,
  DEFAULT_AGENT_EXECUTION,
  DEFAULT_BUSINESS_CONTEXT,
  DEFAULT_DOMAIN_AGENT_POOL,
  DOMAIN_POOL_KEY,
  sanitizeAgentExecution,
  sanitizeBusinessContext,
  sanitizeDomainAgentPoolConfig
} from '@/lib/agent-config';
import {
  createDefaultMcpHubDraft,
  getActiveMcpConnection,
  getMcpConnectionById,
  type McpConnectionDraft,
  type McpHubDraft
} from '@/lib/mcp-connections';
import { defaultRuntimeDraft, mergeRuntimeDraft, type RuntimeDraft } from '@/lib/runtime-draft';
import { loadStoredRuntimeDraft, saveStoredRuntimeDraft } from '@/lib/runtime-storage';
import type { AgentExecutionConfig, BusinessContext, DomainAgentPoolConfig, DomainAgentProfile, DomainKey } from '@/lib/types';

const DOMAIN_KEYS: DomainKey[] = [
  'MARKETING_GROWTH',
  'PRICING_PROCUREMENT',
  'OPERATIONS_EXPANSION',
  'FINANCE_STRATEGY',
  'GENERAL_STRATEGY'
];

const DOMAIN_LABELS: Record<DomainKey, string> = {
  MARKETING_GROWTH: '마케팅 성장',
  PRICING_PROCUREMENT: '단가/조달',
  OPERATIONS_EXPANSION: '운영/확장',
  FINANCE_STRATEGY: '재무 전략',
  GENERAL_STRATEGY: '범용 전략'
};

const CONSTRAINT_OPTIONS = [
  'limited_headcount',
  'budget_efficiency_required',
  'brand_consistency_required',
  'data_fragmentation',
  'low_automation'
];

const RESPONSE_EXPECTATION_OPTIONS = ['practical', 'prioritized', 'executive_ready', 'evidence_based', 'concise'];
const SETTINGS_DEVELOPER_MODE_KEY = 'settings_developer_mode_v1';

const PROVIDER_LABELS: Record<RuntimeDraft['llmProvider'], string> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  groq: 'Groq',
  local: 'Local',
  openclaw: 'OpenClaw'
};

function ensurePool(value?: DomainAgentPoolConfig | null) {
  return sanitizeDomainAgentPoolConfig(value || DEFAULT_DOMAIN_AGENT_POOL);
}

function ensureBusinessContext(value?: BusinessContext | null) {
  return sanitizeBusinessContext(value || DEFAULT_BUSINESS_CONTEXT) || DEFAULT_BUSINESS_CONTEXT;
}

function ensureAgentExecution(value?: AgentExecutionConfig | null) {
  return sanitizeAgentExecution(value || DEFAULT_AGENT_EXECUTION) || DEFAULT_AGENT_EXECUTION;
}

function buildDomainCatalog(pool: DomainAgentPoolConfig, domain: DomainKey) {
  const defaults = ensurePool(DEFAULT_DOMAIN_AGENT_POOL);
  const active = pool[domain] || [];
  const byId = new Map<string, DomainAgentProfile>();
  for (const item of [...(defaults[domain] || []), ...active]) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

export default function SettingsPage() {
  const [runtime, setRuntime] = useState<RuntimeDraft>({
    ...defaultRuntimeDraft
  });
  const [modelCheckLoading, setModelCheckLoading] = useState(false);
  const [modelCheckError, setModelCheckError] = useState('');
  const [modelCheckSuccess, setModelCheckSuccess] = useState<{
    provider: RuntimeDraft['llmProvider'];
    count: number;
    checkedAt: string;
  } | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [pendingModel, setPendingModel] = useState('');
  const [applyMessage, setApplyMessage] = useState('');
  const [modelApplyStatus, setModelApplyStatus] = useState<{
    model: string;
    appliedAt: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<{
    status: string;
    message: string;
    currentVersion?: string;
    availableVersion?: string;
    updateUrl?: string;
    configSource?: 'saved' | 'env' | 'bundled' | 'none';
  } | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [updateFeedUrl, setUpdateFeedUrl] = useState('');
  const [updateConfigSource, setUpdateConfigSource] = useState<'saved' | 'env' | 'bundled' | 'none'>('none');
  const [savingUpdateConfig, setSavingUpdateConfig] = useState(false);
  const [envStatus, setEnvStatus] = useState<{
    ok: boolean;
    missing: string[];
    keyStatus: {
      openaiApiKey: boolean;
      geminiApiKey: boolean;
      geminiModel: boolean;
      groqApiKey: boolean;
      groqModel: boolean;
      localBaseUrl: boolean;
      localModel: boolean;
      searchApiKey: boolean;
    };
  } | null>(null);
  const [openclawStatus, setOpenclawStatus] = useState<{
    installed: boolean;
    ready: boolean;
    version?: string;
    modelCount?: number;
    message: string;
    suggestedProvider?: 'openai' | 'gemini' | 'groq' | 'local' | null;
  } | null>(null);
  const [checkingOpenclaw, setCheckingOpenclaw] = useState(false);
  const [llmOpsLoading, setLlmOpsLoading] = useState(false);
  const [savedRuntimeSnapshot, setSavedRuntimeSnapshot] = useState('');
  const [runtimeSaveMessage, setRuntimeSaveMessage] = useState('');
  const [runtimeSaveError, setRuntimeSaveError] = useState('');
  const [lastAppliedAt, setLastAppliedAt] = useState('');
  const [quota, setQuota] = useState<{
    available: boolean;
    usedUsd?: number;
    budgetUsd?: number | null;
    remainingUsd?: number | null;
    usageRatePct?: number | null;
    message?: string;
  } | null>(null);
  const [geminiUsage, setGeminiUsage] = useState<{
    available: boolean;
    estimatedUsed?: number;
    estimatedRemaining?: number;
    dailyLimit?: number;
    usageRatePct?: number;
    note?: string;
    message?: string;
  } | null>(null);
  const [domainPoolJson, setDomainPoolJson] = useState('');
  const [domainPoolMessage, setDomainPoolMessage] = useState('');
  const [domainPoolError, setDomainPoolError] = useState('');
  const [managedDomainPool, setManagedDomainPool] = useState<DomainAgentPoolConfig>(ensurePool(DEFAULT_DOMAIN_AGENT_POOL));
  const [activeDomain, setActiveDomain] = useState<DomainKey>('MARKETING_GROWTH');
  const [businessContextJson, setBusinessContextJson] = useState('');
  const [businessContextMessage, setBusinessContextMessage] = useState('');
  const [businessContextError, setBusinessContextError] = useState('');
  const [managedBusinessContext, setManagedBusinessContext] = useState<BusinessContext>(ensureBusinessContext(DEFAULT_BUSINESS_CONTEXT));
  const [developerMode, setDeveloperMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'connections' | 'agents' | 'mcp' | 'dev'>('connections');
  const [agentExecutionJson, setAgentExecutionJson] = useState('');
  const [agentExecutionMessage, setAgentExecutionMessage] = useState('');
  const [agentExecutionError, setAgentExecutionError] = useState('');
  const [managedAgentExecution, setManagedAgentExecution] = useState<AgentExecutionConfig>(ensureAgentExecution(DEFAULT_AGENT_EXECUTION));
  const [mcpHub, setMcpHub] = useState<McpHubDraft>(createDefaultMcpHubDraft());
  const [activeMcpConnection, setActiveMcpConnection] = useState<McpConnectionDraft | null>(() =>
    getActiveMcpConnection(createDefaultMcpHubDraft())
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const loaded = await loadStoredRuntimeDraft({
        defaults: defaultRuntimeDraft,
        merge: mergeRuntimeDraft
      });
      if (cancelled) return;

      setRuntime(loaded.value);
      setSavedRuntimeSnapshot(JSON.stringify(loaded.value));

      if (loaded.source === 'migrated_local') {
        setRuntimeSaveMessage('기존 실행 키를 안전 저장소로 이관했습니다.');
        setRuntimeSaveError('');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      setDeveloperMode(localStorage.getItem(SETTINGS_DEVELOPER_MODE_KEY) === 'true');
    } catch {
      setDeveloperMode(false);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_DEVELOPER_MODE_KEY, developerMode ? 'true' : 'false');
    } catch {
      // Ignore local preference persistence failures.
    }
  }, [developerMode]);

  useEffect(() => {
    const raw = localStorage.getItem(DOMAIN_POOL_KEY);
    if (!raw) {
      const next = ensurePool(DEFAULT_DOMAIN_AGENT_POOL);
      setManagedDomainPool(next);
      setDomainPoolJson(JSON.stringify(next, null, 2));
      return;
    }
    try {
      const parsed = sanitizeDomainAgentPoolConfig(JSON.parse(raw));
      setManagedDomainPool(ensurePool(parsed));
      setDomainPoolJson(JSON.stringify(parsed, null, 2));
    } catch {
      const next = ensurePool(DEFAULT_DOMAIN_AGENT_POOL);
      setManagedDomainPool(next);
      setDomainPoolJson(JSON.stringify(next, null, 2));
    }
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(BUSINESS_CONTEXT_KEY);
    if (!raw) {
      const next = ensureBusinessContext(DEFAULT_BUSINESS_CONTEXT);
      setManagedBusinessContext(next);
      setBusinessContextJson(JSON.stringify(next, null, 2));
      return;
    }
    try {
      const parsed = sanitizeBusinessContext(JSON.parse(raw));
      const next = ensureBusinessContext(parsed || DEFAULT_BUSINESS_CONTEXT);
      setManagedBusinessContext(next);
      setBusinessContextJson(JSON.stringify(next, null, 2));
    } catch {
      const next = ensureBusinessContext(DEFAULT_BUSINESS_CONTEXT);
      setManagedBusinessContext(next);
      setBusinessContextJson(JSON.stringify(next, null, 2));
    }
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(AGENT_EXECUTION_KEY);
    if (!raw) {
      const next = ensureAgentExecution(DEFAULT_AGENT_EXECUTION);
      setManagedAgentExecution(next);
      setAgentExecutionJson(JSON.stringify(next, null, 2));
      return;
    }
    try {
      const parsed = sanitizeAgentExecution(JSON.parse(raw));
      const next = ensureAgentExecution(parsed || DEFAULT_AGENT_EXECUTION);
      setManagedAgentExecution(next);
      setAgentExecutionJson(JSON.stringify(next, null, 2));
    } catch {
      const next = ensureAgentExecution(DEFAULT_AGENT_EXECUTION);
      setManagedAgentExecution(next);
      setAgentExecutionJson(JSON.stringify(next, null, 2));
    }
  }, []);

  useEffect(() => {
    fetch('/api/env-status')
      .then((res) => res.json())
      .then((data) => setEnvStatus(data))
      .catch(() =>
        setEnvStatus({
          ok: false,
          missing: ['환경 상태 확인 실패'],
          keyStatus: {
            openaiApiKey: false,
            geminiApiKey: false,
            geminiModel: false,
            groqApiKey: false,
            groqModel: false,
            localBaseUrl: false,
            localModel: false,
            searchApiKey: false
          }
        })
      );
  }, []);

  useEffect(() => {
    async function loadUpdateConfig() {
      if (!window.electronAPI?.getUpdateConfig) return;
      const config = await window.electronAPI.getUpdateConfig();
      if (config?.ok) {
        setUpdateFeedUrl(config.updateUrl || '');
        setUpdateConfigSource(config.source || 'none');
      }
    }
    void loadUpdateConfig();
  }, []);

  useEffect(() => {
    setAvailableModels([]);
    setModelCheckError('');
    setModelCheckSuccess(null);
    setPendingModel('');
    setApplyMessage('');
    setOpenclawStatus(null);
  }, [runtime.llmProvider]);

  useEffect(() => {
    void refreshLlmOpsStatus(runtime.llmProvider);
  }, [runtime.llmProvider]);

  const hasUnsavedChanges = useMemo(() => {
    if (!savedRuntimeSnapshot) return false;
    return JSON.stringify(runtime) !== savedRuntimeSnapshot;
  }, [runtime, savedRuntimeSnapshot]);

  const appliedModel =
    runtime.llmProvider === 'gemini'
      ? runtime.geminiModel
      : runtime.llmProvider === 'openai'
        ? runtime.openaiModel
        : runtime.llmProvider === 'groq'
          ? runtime.groqModel
        : runtime.llmProvider === 'local'
          ? runtime.localModel
          : 'OpenClaw 내부 기본 모델';
  const activeDomainCatalog = useMemo(
    () => buildDomainCatalog(managedDomainPool, activeDomain),
    [managedDomainPool, activeDomain]
  );
  const executionAgentCatalog = useMemo(() => {
    const domain = managedAgentExecution.selectedDomain;
    if (domain && domain !== 'AUTO') {
      return managedDomainPool[domain] || [];
    }
    const merged = DOMAIN_KEYS.flatMap((key) => managedDomainPool[key] || []);
    const seen = new Set<string>();
    return merged.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [managedDomainPool, managedAgentExecution.selectedDomain]);
  const playwrightConnection = useMemo(() => getMcpConnectionById(mcpHub, 'playwright'), [mcpHub]);
  const activeDomainAgentCount = useMemo(
    () => DOMAIN_KEYS.reduce((sum, domain) => sum + (managedDomainPool[domain]?.length || 0), 0),
    [managedDomainPool]
  );
  const businessContextSignals = useMemo(() => {
    let count = 0;
    if (managedBusinessContext.companyStage) count += 1;
    if (managedBusinessContext.businessModel) count += 1;
    if (managedBusinessContext.currentPriority) count += 1;
    if (managedBusinessContext.decisionHorizon) count += 1;
    count += managedBusinessContext.constraints?.length || 0;
    count += managedBusinessContext.responseExpectation?.length || 0;
    return count;
  }, [managedBusinessContext]);
  const updateSummary = useMemo(() => {
    if (!updateStatus) return '점검 전';
    if (updateStatus.status === 'available') return '업데이트 가능';
    if (updateStatus.status === 'downloaded') return '설치 준비 완료';
    if (updateStatus.status === 'up-to-date') return '최신 버전';
    if (updateStatus.status === 'disabled') return '데스크톱 전용';
    return updateStatus.message || updateStatus.status;
  }, [updateStatus]);
  const mainUpdateMessage = updateStatus?.message || '새 버전이 있으면 다운로드 후 재시작으로 설치할 수 있습니다.';
  const activeConnectionName = activeMcpConnection?.name || '내부 AIMD 서버';

  async function onCheckModels() {
    setModelCheckLoading(true);
    setModelCheckError('');
    setModelCheckSuccess(null);
    setAvailableModels([]);

    try {
      const res = await fetch('/api/llm/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          llmProvider: runtime.llmProvider,
          openaiApiKey: runtime.openaiApiKey,
          geminiApiKey: runtime.geminiApiKey,
          groqApiKey: runtime.groqApiKey,
          localBaseUrl: runtime.localBaseUrl,
          localApiKey: runtime.localApiKey,
          openclawAgent: runtime.openclawAgent
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '모델 검증 실패');
      const models = (data.models || []) as string[];
      setAvailableModels(models);
      if (models.length > 0) {
        setPendingModel(models.includes(appliedModel) ? appliedModel : models[0]);
      } else {
        setPendingModel('');
      }
      setModelCheckSuccess({
        provider: runtime.llmProvider,
        count: models.length,
        checkedAt: new Date().toLocaleString('ko-KR')
      });
    } catch (err) {
      setModelCheckError(err instanceof Error ? err.message : '모델 검증 실패');
      setModelCheckSuccess(null);
    } finally {
      setModelCheckLoading(false);
    }
  }

  async function fetchOpenClawStatus() {
    const res = await fetch('/api/openclaw/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        openaiApiKey: runtime.openaiApiKey,
        geminiApiKey: runtime.geminiApiKey,
        geminiModel: runtime.geminiModel,
        groqApiKey: runtime.groqApiKey,
        groqModel: runtime.groqModel,
        localBaseUrl: runtime.localBaseUrl,
        localModel: runtime.localModel
      })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'OpenClaw 상태 점검 실패');
    }
    setOpenclawStatus(data);
    return data;
  }

  async function onCheckOpenClaw() {
    setCheckingOpenclaw(true);
    try {
      await fetchOpenClawStatus();
    } catch (error) {
      setOpenclawStatus({
        installed: false,
        ready: false,
        message: error instanceof Error ? error.message : 'OpenClaw 상태 점검 실패',
        suggestedProvider: null
      });
    } finally {
      setCheckingOpenclaw(false);
    }
  }

  async function refreshLlmOpsStatus(provider: RuntimeDraft['llmProvider']) {
    setLlmOpsLoading(true);
    try {
      if (provider === 'openai') {
        const res = await fetch('/api/openai/quota');
        const data = await res.json();
        setQuota(data);
        setGeminiUsage(null);
        return;
      }

      if (provider === 'gemini') {
        const res = await fetch('/api/gemini/usage');
        const data = await res.json();
        setGeminiUsage(data);
        setQuota(null);
        return;
      }

      if (provider === 'openclaw') {
        await fetchOpenClawStatus();
        setQuota(null);
        setGeminiUsage(null);
        return;
      }

      setQuota(null);
      setGeminiUsage(null);
    } catch {
      if (provider === 'openai') {
        setQuota({
          available: false,
          message: 'OpenAI 한도 정보를 불러오지 못했습니다.'
        });
      }
      if (provider === 'gemini') {
        setGeminiUsage({
          available: false,
          message: 'Gemini 요청 예측치를 불러오지 못했습니다.'
        });
      }
      if (provider === 'openclaw') {
        setOpenclawStatus({
          installed: false,
          ready: false,
          message: 'OpenClaw 상태를 불러오지 못했습니다.',
          suggestedProvider: null
        });
      }
    } finally {
      setLlmOpsLoading(false);
    }
  }

  function applySelectedModel() {
    if (!pendingModel) return;
    if (runtime.llmProvider === 'openclaw') {
      setApplyMessage('OpenClaw 모델은 OpenClaw 설정에서 변경됩니다. (앱에서는 검증만 가능)');
      setModelApplyStatus(null);
      return;
    }
    setRuntime((prev) =>
      prev.llmProvider === 'gemini'
        ? { ...prev, geminiModel: pendingModel }
        : prev.llmProvider === 'openai'
          ? { ...prev, openaiModel: pendingModel }
          : prev.llmProvider === 'groq'
            ? { ...prev, groqModel: pendingModel }
          : { ...prev, localModel: pendingModel }
    );
    const stamp = new Date().toLocaleString('ko-KR');
    setModelApplyStatus({ model: pendingModel, appliedAt: stamp });
    setApplyMessage(`선택 모델 적용 완료: ${pendingModel} (${stamp})`);
  }

  async function applyRuntimeSettings() {
    const result = await saveStoredRuntimeDraft(runtime);
    if (!result.ok) {
      setRuntimeSaveError(result.message || '설정 저장에 실패했습니다. 다시 시도해 주세요.');
      setRuntimeSaveMessage('');
      return;
    }

    setSavedRuntimeSnapshot(JSON.stringify(runtime));
    const stamp = new Date().toLocaleString('ko-KR');
    setLastAppliedAt(stamp);
    setRuntimeSaveError('');
    setRuntimeSaveMessage(
      result.source === 'secure'
        ? `실행 키 설정을 안전 저장소에 적용했습니다. (${stamp})`
        : `실행 키 설정 적용 완료 (${stamp})`
    );
  }

  function resetRuntimeChanges() {
    try {
      if (!savedRuntimeSnapshot) return;
      const parsed = JSON.parse(savedRuntimeSnapshot) as RuntimeDraft;
      setRuntime(parsed);
      setRuntimeSaveError('');
      setRuntimeSaveMessage('미적용 변경사항을 취소했습니다.');
    } catch {
      setRuntimeSaveError('저장된 설정을 불러오지 못했습니다.');
    }
  }

  function applyDomainPoolTemplate() {
    const next = ensurePool(DEFAULT_DOMAIN_AGENT_POOL);
    setManagedDomainPool(next);
    setDomainPoolJson(JSON.stringify(next, null, 2));
    setDomainPoolError('');
    setDomainPoolMessage('템플릿을 불러왔습니다. 저장 버튼으로 반영하세요.');
  }

  function clearDomainPoolOverrides() {
    localStorage.removeItem(DOMAIN_POOL_KEY);
    const next = ensurePool(DEFAULT_DOMAIN_AGENT_POOL);
    setManagedDomainPool(next);
    setDomainPoolJson(JSON.stringify(next, null, 2));
    setDomainPoolError('');
    setDomainPoolMessage('도메인 에이전트 풀을 기본 템플릿으로 초기화했습니다.');
  }

  function saveDomainPoolOverrides() {
    try {
      const parsed = sanitizeDomainAgentPoolConfig(managedDomainPool);
      localStorage.setItem(DOMAIN_POOL_KEY, JSON.stringify(parsed));
      setManagedDomainPool(parsed);
      setDomainPoolError('');
      setDomainPoolMessage(`도메인 에이전트 풀 저장 완료 (${new Date().toLocaleString('ko-KR')})`);
      setDomainPoolJson(JSON.stringify(parsed, null, 2));
    } catch (error) {
      setDomainPoolError(error instanceof Error ? error.message : '도메인 에이전트 풀 저장 실패');
    }
  }

  function applyBusinessContextTemplate() {
    const next = ensureBusinessContext(DEFAULT_BUSINESS_CONTEXT);
    setManagedBusinessContext(next);
    setBusinessContextJson(JSON.stringify(next, null, 2));
    setBusinessContextError('');
    setBusinessContextMessage('비즈니스 컨텍스트 템플릿을 불러왔습니다.');
  }

  function clearBusinessContext() {
    localStorage.removeItem(BUSINESS_CONTEXT_KEY);
    const next = ensureBusinessContext(DEFAULT_BUSINESS_CONTEXT);
    setManagedBusinessContext(next);
    setBusinessContextJson(JSON.stringify(next, null, 2));
    setBusinessContextError('');
    setBusinessContextMessage('비즈니스 컨텍스트를 기본 템플릿으로 초기화했습니다.');
  }

  function saveBusinessContext() {
    try {
      const parsed = sanitizeBusinessContext(managedBusinessContext);
      localStorage.setItem(BUSINESS_CONTEXT_KEY, JSON.stringify(parsed || {}));
      setManagedBusinessContext(ensureBusinessContext(parsed || DEFAULT_BUSINESS_CONTEXT));
      setBusinessContextError('');
      setBusinessContextMessage(`비즈니스 컨텍스트 저장 완료 (${new Date().toLocaleString('ko-KR')})`);
      setBusinessContextJson(JSON.stringify(parsed || {}, null, 2));
    } catch (error) {
      setBusinessContextError(error instanceof Error ? error.message : '비즈니스 컨텍스트 저장 실패');
    }
  }

  function applyAgentExecutionTemplate() {
    const next = ensureAgentExecution(DEFAULT_AGENT_EXECUTION);
    setManagedAgentExecution(next);
    setAgentExecutionJson(JSON.stringify(next, null, 2));
    setAgentExecutionError('');
    setAgentExecutionMessage('에이전트 실행 정책 템플릿을 불러왔습니다.');
  }

  function clearAgentExecution() {
    localStorage.removeItem(AGENT_EXECUTION_KEY);
    const next = ensureAgentExecution(DEFAULT_AGENT_EXECUTION);
    setManagedAgentExecution(next);
    setAgentExecutionJson(JSON.stringify(next, null, 2));
    setAgentExecutionError('');
    setAgentExecutionMessage('에이전트 실행 정책을 기본 템플릿으로 초기화했습니다.');
  }

  function saveAgentExecution() {
    try {
      const parsed = sanitizeAgentExecution(managedAgentExecution);
      localStorage.setItem(AGENT_EXECUTION_KEY, JSON.stringify(parsed || {}));
      setManagedAgentExecution(ensureAgentExecution(parsed || DEFAULT_AGENT_EXECUTION));
      setAgentExecutionError('');
      setAgentExecutionMessage(`에이전트 실행 정책 저장 완료 (${new Date().toLocaleString('ko-KR')})`);
      setAgentExecutionJson(JSON.stringify(parsed || {}, null, 2));
    } catch (error) {
      setAgentExecutionError(error instanceof Error ? error.message : '에이전트 실행 정책 저장 실패');
    }
  }

  function toggleDomainAgent(domain: DomainKey, profile: DomainAgentProfile) {
    setManagedDomainPool((prev) => {
      const current = prev[domain] || [];
      const exists = current.some((item) => item.id === profile.id);
      const nextItems = exists ? current.filter((item) => item.id !== profile.id) : [...current, profile];
      const next = {
        ...prev,
        [domain]: nextItems
      };
      setDomainPoolJson(JSON.stringify(next, null, 2));
      return next;
    });
    if ((managedAgentExecution.selectedAgents || []).includes(profile.id)) {
      setManagedAgentExecution((prev) => {
        const next = {
          ...prev,
          selectedAgents: (prev.selectedAgents || []).filter((item) => item !== profile.id)
        };
        setAgentExecutionJson(JSON.stringify(next, null, 2));
        return next;
      });
    }
  }

  function updateBusinessContextField<K extends keyof BusinessContext>(key: K, value: BusinessContext[K]) {
    setManagedBusinessContext((prev) => {
      const next = { ...prev, [key]: value };
      setBusinessContextJson(JSON.stringify(next, null, 2));
      return next;
    });
  }

  function toggleBusinessArrayField(key: 'constraints' | 'responseExpectation', value: string) {
    setManagedBusinessContext((prev) => {
      const current = prev[key] || [];
      const nextValues = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
      const next = { ...prev, [key]: nextValues };
      setBusinessContextJson(JSON.stringify(next, null, 2));
      return next;
    });
  }

  function updateAgentExecutionField<K extends keyof AgentExecutionConfig>(key: K, value: AgentExecutionConfig[K]) {
    setManagedAgentExecution((prev) => {
      const next = { ...prev, [key]: value };
      setAgentExecutionJson(JSON.stringify(next, null, 2));
      return next;
    });
  }

  function toggleSelectedAgent(agentId: string) {
    setManagedAgentExecution((prev) => {
      const current = prev.selectedAgents || [];
      const nextSelected = current.includes(agentId) ? current.filter((item) => item !== agentId) : [...current, agentId];
      const next = { ...prev, selectedAgents: nextSelected };
      setAgentExecutionJson(JSON.stringify(next, null, 2));
      return next;
    });
  }

  function applyRecommendedFreePreset() {
    setRuntime((prev) => ({
      ...prev,
      runProfile: 'free',
      llmProvider: 'openclaw',
      groqModel: prev.groqModel || 'llama-3.3-70b-versatile',
      geminiModel: prev.geminiModel || 'gemini-2.5-flash'
    }));
    setApplyMessage('권장 무료 운영 세팅을 불러왔습니다. 하단의 `실행 키 설정 적용` 버튼으로 최종 반영하세요.');
  }

  function applyReportQualityPreset() {
    const hasOpenAI = Boolean(runtime.openaiApiKey.trim() || envStatus?.keyStatus?.openaiApiKey);
    const hasGemini = Boolean(runtime.geminiApiKey.trim() || envStatus?.keyStatus?.geminiApiKey);
    const hasGroq = Boolean(runtime.groqApiKey.trim() || envStatus?.keyStatus?.groqApiKey);

    const provider: RuntimeDraft['llmProvider'] = hasOpenAI ? 'openai' : hasGemini ? 'gemini' : hasGroq ? 'groq' : 'openclaw';
    setRuntime((prev) => ({
      ...prev,
      runProfile: 'manual',
      llmProvider: provider,
      openaiModel: prev.openaiModel || 'gpt-4.1-mini',
      geminiModel: prev.geminiModel || 'gemini-2.5-flash',
      groqModel: prev.groqModel || 'llama-3.3-70b-versatile'
    }));
    setApplyMessage(`고품질 보고서 세팅을 불러왔습니다. (${provider.toUpperCase()}) 최종 반영은 실행 키 설정 적용 버튼을 눌러주세요.`);
  }

  async function onCopyRecoveryCommand() {
    try {
      await navigator.clipboard.writeText('npm run dev:clean');
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  async function onCheckUpdate() {
    if (!window.electronAPI?.checkForUpdates) {
      setUpdateStatus({ status: 'disabled', message: '데스크톱 앱에서만 업데이트 확인이 가능합니다.' });
      return;
    }
    setCheckingUpdate(true);
    const result = await window.electronAPI.checkForUpdates();
    setUpdateStatus(result);
    if (result.updateUrl) setUpdateFeedUrl(result.updateUrl);
    if (result.configSource) setUpdateConfigSource(result.configSource);
    setCheckingUpdate(false);
  }

  async function onDownloadUpdate() {
    if (!window.electronAPI?.downloadUpdate) {
      setUpdateStatus({ status: 'disabled', message: '데스크톱 앱에서만 업데이트 다운로드가 가능합니다.' });
      return;
    }
    setDownloadingUpdate(true);
    const result = await window.electronAPI.downloadUpdate();
    setUpdateStatus((prev) => ({ ...prev, ...result }));
    setDownloadingUpdate(false);
  }

  async function onInstallUpdate() {
    if (!window.electronAPI?.installUpdate) {
      setUpdateStatus({ status: 'disabled', message: '데스크톱 앱에서만 업데이트 설치가 가능합니다.' });
      return;
    }
    setInstallingUpdate(true);
    const result = await window.electronAPI.installUpdate();
    setUpdateStatus((prev) => ({ ...prev, ...result }));
    setInstallingUpdate(false);
  }

  async function onSaveUpdateConfig() {
    if (!window.electronAPI?.saveUpdateConfig) {
      setUpdateStatus({ status: 'disabled', message: '데스크톱 앱에서만 업데이트 URL 저장이 가능합니다.' });
      return;
    }
    setSavingUpdateConfig(true);
    const result = await window.electronAPI.saveUpdateConfig(updateFeedUrl);
    setUpdateStatus({
      status: result.status,
      message: result.message,
      updateUrl: result.updateUrl
    });
    if (result.ok && window.electronAPI?.getUpdateConfig) {
      const config = await window.electronAPI.getUpdateConfig();
      if (config?.ok) {
        setUpdateFeedUrl(config.updateUrl || '');
        setUpdateConfigSource(config.source || 'none');
      }
    }
    setSavingUpdateConfig(false);
  }

  return (
    <div className="space-y-6">
      <section className="dashboard-hero">
        <p className="dashboard-eyebrow">Settings</p>
        <h2 className="dashboard-title">설정 및 복구</h2>
        <p className="dashboard-copy">운영 환경, 브랜드 컨텍스트, 에이전트 정책, 앱 업데이트를 한 화면에서 차분하게 관리할 수 있도록 정리했습니다.</p>
        <div className="dashboard-chip-grid">
          <div className="dashboard-chip"><strong>안전 저장</strong><br />실행 키는 로컬 안전 저장소에 보관됩니다.</div>
          <div className="dashboard-chip"><strong>운영 중심</strong><br />일상적인 실행 설정과 정책을 먼저 배치했습니다.</div>
          <div className="dashboard-chip"><strong>개발 점검 분리</strong><br />MCP와 자동 QA는 별도 모드에서만 열립니다.</div>
        </div>
      </section>

      <nav className="flex gap-1 rounded-2xl bg-[var(--surface-sub)] p-1 w-fit">
        {([
          ['connections', '연결'],
          ['agents', '에이전트'],
          ['mcp', 'MCP'],
          ['dev', '개발자 도구'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`rounded-xl px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === key
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-base)]'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'connections' && (<>
      <section className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <div className="status-tile">
          <p className="metric-label">현재 운영 모드</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">
            {runtime.runProfile === 'free' ? '자동 선택 운영' : `${PROVIDER_LABELS[runtime.llmProvider]} 직접 운영`}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">적용 모델: {appliedModel || '미선택'}</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">활성 에이전트</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{activeDomainAgentCount}명 활성</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">실행 정책에 수동 선택된 에이전트 {managedAgentExecution.selectedAgents?.length || 0}명</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">공통 비즈니스 컨텍스트</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{businessContextSignals}개 신호 저장</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{managedBusinessContext.currentPriority || '우선순위를 설정하면 모든 응답의 기준이 더 선명해집니다.'}</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">업데이트 상태</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{updateSummary}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{mainUpdateMessage}</p>
        </div>
      </section>

      <SupabaseAuthPanel />
      </>)}

      {activeTab === 'agents' && (<>
      <section className="panel space-y-3">
        <h3 className="section-title">AI 실행 환경</h3>
        <p className="text-xs text-[var(--text-muted)]">입력 후 `실행 키 설정 적용`을 눌러야 캠페인 스튜디오와 세미나 실행에 반영됩니다.</p>
        <div className="grid gap-2 md:grid-cols-3">
          <div
            className={`rounded-xl border px-3 py-2 text-xs ${
              hasUnsavedChanges ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-800'
            }`}
          >
            <p className="font-semibold">1) 입력 상태</p>
            <p className="mt-1">{hasUnsavedChanges ? '미적용 변경 있음' : '저장된 설정과 동일'}</p>
          </div>
          <div
            className={`rounded-xl border px-3 py-2 text-xs ${
              modelCheckError
                ? 'border-rose-300 bg-rose-50 text-rose-700'
                : modelCheckSuccess
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-[var(--surface-border)] bg-[var(--surface-sub)] text-[var(--text-muted)]'
            }`}
          >
            <p className="font-semibold">2) 모델 검증</p>
            <p className="mt-1">
              {modelCheckLoading
                ? '검증 진행 중...'
                : modelCheckError
                  ? '검증 실패'
                  : modelCheckSuccess
                    ? `검증 완료 (${modelCheckSuccess.count}개)`
                    : '미검증'}
            </p>
          </div>
          <div
            className={`rounded-xl border px-3 py-2 text-xs ${
              lastAppliedAt ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-[var(--surface-border)] bg-[var(--surface-sub)] text-[var(--text-muted)]'
            }`}
          >
            <p className="font-semibold">3) 실행 반영</p>
            <p className="mt-1">{lastAppliedAt ? `적용 완료 (${lastAppliedAt})` : '아직 반영 전'}</p>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <button type="button" className="button-secondary" onClick={applyRecommendedFreePreset}>
            권장 무료 운영 세팅 적용
          </button>
          <button type="button" className="button-secondary" onClick={applyReportQualityPreset}>
            고품질 보고서 세팅 적용
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="button-primary" onClick={applyRuntimeSettings}>
            실행 키 설정 적용
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={resetRuntimeChanges}
            disabled={!hasUnsavedChanges}
          >
            변경 취소
          </button>
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
              hasUnsavedChanges ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-800'
            }`}
          >
            {hasUnsavedChanges ? '미적용 변경 있음' : '저장됨'}
          </span>
          {lastAppliedAt && <span className="text-xs text-[var(--text-muted)]">최근 적용: {lastAppliedAt}</span>}
        </div>
        {applyMessage && <p className="text-xs text-emerald-700">{applyMessage}</p>}
        {runtimeSaveMessage && <p className="text-xs text-emerald-700">{runtimeSaveMessage}</p>}
        {runtimeSaveError && <p className="text-xs text-rose-700">{runtimeSaveError}</p>}
        {modelCheckSuccess && (
          <p className="text-xs text-emerald-700">
            모델 검증 완료: {modelCheckSuccess.provider.toUpperCase()} / {modelCheckSuccess.count}개 / {modelCheckSuccess.checkedAt}
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">실행 모드</label>
            <select
              className="input"
              value={runtime.runProfile}
              onChange={(e) => setRuntime((prev) => ({ ...prev, runProfile: e.target.value as RuntimeDraft['runProfile'] }))}
            >
              <option value="free">무료모드 (자동 선택)</option>
              <option value="manual">수동모드 (직접 선택)</option>
            </select>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              무료모드: OpenClaw → Groq → Gemini → Local 순으로 자동 선택합니다. (fallback 최대 4개)
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">LLM Provider</label>
            <select
              className="input"
              value={runtime.llmProvider}
              onChange={(e) => setRuntime((prev) => ({ ...prev, llmProvider: e.target.value as RuntimeDraft['llmProvider'] }))}
            >
              <option value="openclaw">OpenClaw (로그인 기반)</option>
              <option value="gemini">Gemini</option>
              <option value="groq">Groq (무료 티어)</option>
              <option value="openai">OpenAI</option>
              <option value="local">Local(OpenAI 호환)</option>
            </select>
            {runtime.runProfile === 'free' && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">무료모드에서는 실행 시 자동 선택되며, 이 값은 모델 검증/입력 편의를 위한 선택값입니다.</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Search API Key</label>
            <input
              className="input"
              type="password"
              value={runtime.searchApiKey}
              onChange={(e) => setRuntime((prev) => ({ ...prev, searchApiKey: e.target.value }))}
              placeholder={envStatus?.keyStatus?.searchApiKey ? '미입력 시 .env 키 사용' : 'SEARCH API KEY 입력'}
            />
          </div>
        </div>

        {(runtime.runProfile === 'free' || runtime.llmProvider === 'gemini') && (
          <div>
            <label className="mb-1 block text-sm font-medium">Gemini API Key</label>
            <input
              className="input"
              type="password"
              value={runtime.geminiApiKey}
              onChange={(e) => setRuntime((prev) => ({ ...prev, geminiApiKey: e.target.value }))}
              placeholder={envStatus?.keyStatus?.geminiApiKey ? '미입력 시 .env 키 사용' : 'GEMINI API KEY 입력'}
            />
          </div>
        )}

        {(runtime.runProfile === 'free' || runtime.llmProvider === 'groq') && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Groq API Key</label>
              <input
                className="input"
                type="password"
                value={runtime.groqApiKey}
                onChange={(e) => setRuntime((prev) => ({ ...prev, groqApiKey: e.target.value }))}
                placeholder={envStatus?.keyStatus?.groqApiKey ? '미입력 시 .env 키 사용' : 'GROQ API KEY 입력'}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Groq 모델(선택)</label>
              <input
                className="input"
                value={runtime.groqModel}
                onChange={(e) => setRuntime((prev) => ({ ...prev, groqModel: e.target.value }))}
                placeholder="미입력 시 기본 모델 사용"
              />
            </div>
          </div>
        )}

        {runtime.runProfile === 'manual' && runtime.llmProvider === 'openai' && (
          <div>
            <label className="mb-1 block text-sm font-medium">OpenAI API Key</label>
            <input
              className="input"
              type="password"
              value={runtime.openaiApiKey}
              onChange={(e) => setRuntime((prev) => ({ ...prev, openaiApiKey: e.target.value }))}
              placeholder={envStatus?.keyStatus?.openaiApiKey ? '미입력 시 .env 키 사용' : 'OPENAI API KEY 입력'}
            />
          </div>
        )}

        {(runtime.runProfile === 'free' || runtime.llmProvider === 'local') && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Local Base URL</label>
              <input
                className="input"
                value={runtime.localBaseUrl}
                onChange={(e) => setRuntime((prev) => ({ ...prev, localBaseUrl: e.target.value }))}
                placeholder="http://127.0.0.1:1234/v1"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Local API Key(선택)</label>
              <input className="input" value={runtime.localApiKey} onChange={(e) => setRuntime((prev) => ({ ...prev, localApiKey: e.target.value }))} />
            </div>
          </div>
        )}

        {(runtime.runProfile === 'free' || runtime.llmProvider === 'openclaw') && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">OpenClaw Agent ID</label>
              <input
                className="input"
                value={runtime.openclawAgent}
                onChange={(e) => setRuntime((prev) => ({ ...prev, openclawAgent: e.target.value }))}
                placeholder="main (미입력 시 기본값)"
              />
            </div>
            <div className="surface-note">
              OpenClaw는 로컬 로그인/OAuth 기반입니다. 실행 시 OpenClaw가 없으면 API 키가 설정된 provider(OpenAI/Gemini/Groq/Local)로 자동 전환됩니다.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={onCheckOpenClaw} disabled={checkingOpenclaw} className="button-secondary">
                {checkingOpenclaw ? 'OpenClaw 점검 중...' : 'OpenClaw 설치/작동 점검'}
              </button>
              <p className="text-xs text-[var(--text-muted)]">사내 배포 전 각 Mac에서 OpenClaw 사용 가능 여부를 확인하세요.</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onCheckModels} disabled={modelCheckLoading} className="button-secondary">
            {modelCheckLoading ? '모델 검증 중...' : '사용 가능 모델 검증'}
          </button>
          {modelCheckError && <p className="text-xs text-rose-700">{modelCheckError}</p>}
        </div>

        <div className="soft-panel">
          <p className="text-sm font-semibold text-[var(--text-strong)]">사용 모델 선택</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">현재 적용 모델: {appliedModel || '미선택'}</p>
          {runtime.llmProvider === 'openclaw' && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              OpenClaw는 모델 라우팅을 OpenClaw 내부 설정에서 관리합니다. 여기서는 사용 가능 모델 확인만 제공합니다.
            </p>
          )}
          {availableModels.length === 0 ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">검증 버튼을 눌러 사용 가능한 모델을 불러오세요.</p>
          ) : (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-2">
                {availableModels.map((model) => {
                  const selected = pendingModel === model;
                  return (
                    <button
                      key={model}
                      type="button"
                      onClick={() => setPendingModel(model)}
                      className={selected ? 'pill-option pill-option-active' : 'pill-option'}
                    >
                      {model}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {runtime.llmProvider !== 'openclaw' && (
                  <button
                    type="button"
                    className="button-primary"
                    disabled={!pendingModel}
                    onClick={applySelectedModel}
                  >
                    선택 모델 적용
                  </button>
                )}
                {pendingModel && <p className="text-xs text-[var(--text-muted)]">선택됨: {pendingModel}</p>}
                {modelApplyStatus && <p className="text-xs text-emerald-700">적용됨: {modelApplyStatus.model} ({modelApplyStatus.appliedAt})</p>}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="panel space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="section-title">AI 운영 현황</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">현재 선택한 엔진 기준으로 사용 가능 상태와 한도 정보를 보여줍니다.</p>
          </div>
          <button
            type="button"
            className="button-secondary"
            onClick={() => void refreshLlmOpsStatus(runtime.llmProvider)}
            disabled={llmOpsLoading}
          >
            {llmOpsLoading ? '새로고침 중...' : '현황 새로고침'}
          </button>
        </div>

        <div className="surface-note">
          실행 모드: <span className="font-semibold uppercase">{runtime.runProfile}</span>
          {' · '}
          {runtime.runProfile === 'free' ? (
            <span>자동 선택 (OpenClaw → Groq → Gemini → Local)</span>
          ) : (
            <span>
              현재 provider: <span className="font-semibold uppercase">{runtime.llmProvider}</span>
            </span>
          )}
        </div>

        {runtime.llmProvider === 'openclaw' && (
          <div className="space-y-2">
            <div className="surface-note">
              OpenClaw는 API 토큰 기반 사용량 수치를 제공하지 않습니다. 대신 설치/작동 상태를 기준으로 운영 상태를 확인합니다.
            </div>
            {openclawStatus && (
              <div
                className={`rounded-xl border px-3 py-2 text-xs ${
                  openclawStatus.ready
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-amber-300 bg-amber-50 text-amber-900'
                }`}
              >
                <p>{openclawStatus.message}</p>
                {openclawStatus.version && <p className="mt-1">버전: {openclawStatus.version}</p>}
                {typeof openclawStatus.modelCount === 'number' && <p className="mt-1">사용 가능 모델: {openclawStatus.modelCount}개</p>}
                {!openclawStatus.ready && openclawStatus.suggestedProvider && (
                  <p className="mt-1">권장 대체 provider: {openclawStatus.suggestedProvider.toUpperCase()}</p>
                )}
              </div>
            )}
          </div>
        )}

        {runtime.llmProvider === 'openai' && (
          <div className="space-y-2">
            {!quota && <p className="text-sm text-[var(--text-muted)]">OpenAI 한도 정보를 불러오는 중...</p>}
            {quota && !quota.available && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {quota.message || 'OpenAI 한도 정보를 조회할 수 없습니다.'}
              </p>
            )}
            {quota?.available && (
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="status-tile">
                  <p className="metric-label">이번 달 사용액</p>
                  <p className="mt-1 font-semibold text-[var(--text-strong)]">${quota.usedUsd?.toFixed(2)}</p>
                </div>
                <div className="status-tile">
                  <p className="metric-label">월 예산</p>
                  <p className="mt-1 font-semibold text-[var(--text-strong)]">
                    {quota.budgetUsd != null ? `$${quota.budgetUsd.toFixed(2)}` : '미설정'}
                  </p>
                </div>
                <div className="status-tile">
                  <p className="metric-label">잔여(예산 기준)</p>
                  <p className="mt-1 font-semibold text-[var(--text-strong)]">
                    {quota.remainingUsd != null ? `$${quota.remainingUsd.toFixed(2)}` : '계산 불가'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {runtime.llmProvider === 'gemini' && (
          <div className="space-y-2">
            {!geminiUsage && <p className="text-sm text-[var(--text-muted)]">Gemini 요청 예측치를 불러오는 중...</p>}
            {geminiUsage && !geminiUsage.available && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {geminiUsage.message || 'Gemini 요청 예측치를 조회할 수 없습니다.'}
              </p>
            )}
            {geminiUsage?.available && (
              <div className="soft-panel">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--text-strong)]">오늘 남은 Gemini 요청 예측치</p>
                  <span className="accent-pill">
                    예측치
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--text-base)]">
                  {geminiUsage.estimatedRemaining} / {geminiUsage.dailyLimit} 요청 남음 (사용 {geminiUsage.estimatedUsed})
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{geminiUsage.note}</p>
              </div>
            )}
          </div>
        )}

        {runtime.llmProvider === 'local' && (
          <div className="surface-note">
            Local(OpenAI 호환) provider는 서버별 과금/한도 체계가 달라 앱에서 공통 한도 지표를 제공하지 않습니다.
          </div>
        )}

        {runtime.llmProvider === 'groq' && (
          <div className="surface-note">
            Groq는 API 정책에 따라 요청 제한이 변동될 수 있습니다. 무료 티어 사용 시 모델별 속도/한도 차이를 고려해 운영하세요.
          </div>
        )}
      </section>

      <section className="panel space-y-3">
        <h3 className="section-title">도메인 에이전트 운영</h3>
        <p className="text-sm text-[var(--text-muted)]">
          JSON 대신 카드 기반 관리자에서 도메인별 에이전트를 켜고 끌 수 있습니다.
        </p>
        <div className="flex flex-wrap gap-2">
          {DOMAIN_KEYS.map((domain) => (
            <button
              key={domain}
              type="button"
              className={activeDomain === domain ? 'pill-option pill-option-active' : 'pill-option'}
              onClick={() => setActiveDomain(domain)}
            >
              {DOMAIN_LABELS[domain]}
            </button>
          ))}
        </div>
        <div className="surface-note">
          현재 도메인: <span className="font-semibold">{DOMAIN_LABELS[activeDomain]}</span>
          {' · '}
          활성 에이전트 {managedDomainPool[activeDomain]?.length || 0}명
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {activeDomainCatalog.map((profile) => {
            const active = (managedDomainPool[activeDomain] || []).some((item) => item.id === profile.id);
            return (
              <div key={profile.id} className={active ? 'list-card list-card-active' : 'list-card'}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{profile.id}</p>
                    <p className="mt-1 text-base font-semibold text-[var(--text-strong)]">{profile.name}</p>
                    {profile.roleSummary && <p className="mt-1 text-sm text-[var(--text-muted)]">{profile.roleSummary}</p>}
                  </div>
                  <button
                    type="button"
                    className={active ? 'accent-pill' : 'pill-option'}
                    onClick={() => toggleDomainAgent(activeDomain, profile)}
                  >
                    {active ? '활성' : '비활성'}
                  </button>
                </div>
                <p className="mt-3 text-xs text-[var(--text-muted)]">전문분야</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {profile.specialty.map((item) => (
                    <span key={`${profile.id}-${item}`} className="pill-option">
                      {item}
                    </span>
                  ))}
                </div>
                {profile.frameworks?.length ? (
                  <>
                    <p className="mt-3 text-xs text-[var(--text-muted)]">프레임워크</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{profile.frameworks.join(' · ')}</p>
                  </>
                ) : null}
                <p className="mt-3 text-xs text-[var(--text-muted)]">기대 산출물</p>
                <p className="mt-1 text-sm text-[var(--text-base)]">{profile.expectedOutput}</p>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="button-primary" onClick={saveDomainPoolOverrides}>
            도메인 풀 저장
          </button>
          <button type="button" className="button-secondary" onClick={applyDomainPoolTemplate}>
            템플릿 불러오기
          </button>
          <button type="button" className="button-secondary" onClick={clearDomainPoolOverrides}>
            커스터마이징 초기화
          </button>
        </div>
        {domainPoolMessage && <p className="text-xs text-emerald-700">{domainPoolMessage}</p>}
        {domainPoolError && <p className="text-xs text-rose-700">{domainPoolError}</p>}
      </section>

      <section className="panel space-y-3">
        <h3 className="section-title">비즈니스 컨텍스트</h3>
        <p className="text-sm text-[var(--text-muted)]">
          회사 단계, 현재 우선순위, 제약조건을 저장하면 모든 에이전트 프롬프트에 공통 컨텍스트로 주입됩니다.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">회사 단계</label>
            <select
              className="input"
              value={managedBusinessContext.companyStage || ''}
              onChange={(e) => updateBusinessContextField('companyStage', e.target.value)}
            >
              <option value="">미설정</option>
              <option value="startup">startup</option>
              <option value="growth">growth</option>
              <option value="mature">mature</option>
              <option value="enterprise">enterprise</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">비즈니스 모델</label>
            <input
              className="input"
              value={managedBusinessContext.businessModel || ''}
              onChange={(e) => updateBusinessContextField('businessModel', e.target.value)}
              placeholder="예: hybrid_online_offline_service"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">현재 우선순위</label>
            <input
              className="input"
              value={managedBusinessContext.currentPriority || ''}
              onChange={(e) => updateBusinessContextField('currentPriority', e.target.value)}
              placeholder="예: revenue_growth_and_retention"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">의사결정 기간</label>
            <input
              className="input"
              value={managedBusinessContext.decisionHorizon || ''}
              onChange={(e) => updateBusinessContextField('decisionHorizon', e.target.value)}
              placeholder="예: next_90_days"
            />
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-[var(--text-muted)]">제약조건</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CONSTRAINT_OPTIONS.map((item) => {
              const active = (managedBusinessContext.constraints || []).includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  className={active ? 'pill-option pill-option-active' : 'pill-option'}
                  onClick={() => toggleBusinessArrayField('constraints', item)}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-[var(--text-muted)]">응답 기대치</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {RESPONSE_EXPECTATION_OPTIONS.map((item) => {
              const active = (managedBusinessContext.responseExpectation || []).includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  className={active ? 'pill-option pill-option-active' : 'pill-option'}
                  onClick={() => toggleBusinessArrayField('responseExpectation', item)}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="button-primary" onClick={saveBusinessContext}>
            비즈니스 컨텍스트 저장
          </button>
          <button type="button" className="button-secondary" onClick={applyBusinessContextTemplate}>
            템플릿 불러오기
          </button>
          <button type="button" className="button-secondary" onClick={clearBusinessContext}>
            초기화
          </button>
        </div>
        {businessContextMessage && <p className="text-xs text-emerald-700">{businessContextMessage}</p>}
        {businessContextError && <p className="text-xs text-rose-700">{businessContextError}</p>}
      </section>

      <section className="panel space-y-3">
        <h3 className="section-title">응답 설계 정책</h3>
        <p className="text-sm text-[var(--text-muted)]">
          기본 선택 도메인, 강제 투입 에이전트, `multi_agent_synthesis` 같은 실행 모드를 정의합니다.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">기본 도메인</label>
            <select
              className="input"
              value={managedAgentExecution.selectedDomain || 'AUTO'}
              onChange={(e) => updateAgentExecutionField('selectedDomain', e.target.value as AgentExecutionConfig['selectedDomain'])}
            >
              <option value="AUTO">AUTO</option>
              {DOMAIN_KEYS.map((domain) => (
                <option key={domain} value={domain}>
                  {DOMAIN_LABELS[domain]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">실행 모드</label>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ['multi_agent_synthesis', 'Multi-Agent'],
                ['adaptive_domain_auto', 'Adaptive'],
                ['single_domain_focus', 'Single Domain']
              ].map(([value, label]) => {
                const active = managedAgentExecution.taskMode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-sm transition ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'border-[var(--surface-border)] bg-[var(--surface)] text-[var(--text-base)] hover:bg-[var(--surface-sub)]'
                    }`}
                    onClick={() => updateAgentExecutionField('taskMode', value as AgentExecutionConfig['taskMode'])}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="surface-note">
          선택 에이전트가 비어 있으면 해당 도메인의 상위 에이전트를 자동 투입합니다.
        </div>
        {executionAgentCatalog.length === 0 && (
          <p className="text-xs text-[var(--text-muted)]">먼저 위 도메인 에이전트 풀에서 에이전트를 활성화한 뒤 선택하세요.</p>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          {executionAgentCatalog.map((profile) => {
            const active = (managedAgentExecution.selectedAgents || []).includes(profile.id);
            return (
              <button
                key={`selected-${profile.id}`}
                type="button"
                className={`${active ? 'list-card list-card-active' : 'list-card'} text-left`}
                onClick={() => toggleSelectedAgent(profile.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{profile.id}</p>
                    <p className="mt-1 text-base font-semibold text-[var(--text-strong)]">{profile.name}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{profile.specialty.slice(0, 3).join(' · ')}</p>
                  </div>
                  <span className={active ? 'accent-pill' : 'pill-option'}>
                    {active ? '선택됨' : '선택'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="button-primary" onClick={saveAgentExecution}>
            실행 정책 저장
          </button>
          <button type="button" className="button-secondary" onClick={applyAgentExecutionTemplate}>
            템플릿 불러오기
          </button>
          <button type="button" className="button-secondary" onClick={clearAgentExecution}>
            초기화
          </button>
        </div>
        {agentExecutionMessage && <p className="text-xs text-emerald-700">{agentExecutionMessage}</p>}
        {agentExecutionError && <p className="text-xs text-rose-700">{agentExecutionError}</p>}
      </section>
      </>)}

      {activeTab === 'connections' && (<>
      <MetaConnectionPanel mode="settings" />

      {/* 외부 연동 */}
      <div className="panel space-y-4">
        <h3 className="section-title">외부 연동</h3>
        <p className="text-xs text-[var(--text-muted)]">환경변수로 설정하거나 아래에서 직접 입력할 수 있습니다.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Slack Webhook URL</label>
            <input className="input" placeholder="https://hooks.slack.com/services/..."
              defaultValue={typeof window !== 'undefined' ? localStorage.getItem('garnet_slack_webhook') || '' : ''}
              onChange={e => localStorage.setItem('garnet_slack_webhook', e.target.value)} />
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">Slack 앱 → Incoming Webhooks → URL 복사</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Notion API Key</label>
            <input className="input" type="password" placeholder="secret_..."
              defaultValue={typeof window !== 'undefined' ? localStorage.getItem('garnet_notion_key') || '' : ''}
              onChange={e => localStorage.setItem('garnet_notion_key', e.target.value)} />
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">Notion → 설정 → 내 연결 → Internal Integration → Secret</p>
          </div>
        </div>
      </div>
      </>)}

      {activeTab === 'mcp' && (<>
      <McpConnectionHub onActiveConnectionChange={setActiveMcpConnection} onHubChange={setMcpHub} />
      <McpInspector connection={activeMcpConnection} />
      </>)}

      {activeTab === 'dev' && (<>
      <section className="panel space-y-4">
        <h3 className="section-title">앱 업데이트</h3>
        <p className="text-sm text-[var(--text-muted)]">새 버전이 있으면 여기서 확인하고, 다운로드 후 앱 재시작으로 설치할 수 있습니다.</p>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="status-tile">
            <p className="metric-label">현재 상태</p>
            <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{updateSummary}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{updateStatus?.currentVersion ? `현재 버전 ${updateStatus.currentVersion}` : '아직 점검하지 않았습니다.'}</p>
          </div>
          <div className="status-tile">
            <p className="metric-label">다음 액션</p>
            <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">
              {updateStatus?.status === 'available'
                ? '다운로드'
                : updateStatus?.status === 'downloaded'
                  ? '설치'
                  : '확인'}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {updateStatus?.availableVersion ? `새 버전 ${updateStatus.availableVersion} 준비` : '업데이트 확인 버튼으로 새 버전을 조회하세요.'}
            </p>
          </div>
          <div className="status-tile">
            <p className="metric-label">배포 채널</p>
            <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">
              {updateConfigSource === 'saved'
                ? '앱 저장값'
                : updateConfigSource === 'env'
                  ? '.env'
                  : updateConfigSource === 'bundled'
                    ? '내장 설정'
                    : '미설정'}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">상세 피드 주소 변경은 개발 점검 모드에서 관리합니다.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="button-secondary" onClick={onCheckUpdate} disabled={checkingUpdate}>
            {checkingUpdate ? '확인 중...' : '업데이트 확인'}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={onDownloadUpdate}
            disabled={downloadingUpdate || updateStatus?.status !== 'available'}
          >
            {downloadingUpdate ? '다운로드 중...' : '업데이트 다운로드'}
          </button>
          <button
            type="button"
            className="button-primary"
            onClick={onInstallUpdate}
            disabled={installingUpdate || updateStatus?.status !== 'downloaded'}
          >
            {installingUpdate ? '설치 준비 중...' : '다운로드 후 설치'}
          </button>
        </div>
        <div className="soft-panel text-sm text-[var(--text-base)]">
          {updateStatus ? (
            <span>
              {updateStatus.message}
              {updateStatus.currentVersion ? ` | 현재: ${updateStatus.currentVersion}` : ''}
              {updateStatus.availableVersion ? ` | 새 버전: ${updateStatus.availableVersion}` : ''}
            </span>
          ) : (
            <span>현재 설치된 앱에서 바로 업데이트 상태를 조회할 수 있습니다.</span>
          )}
        </div>
      </section>

      <section className="panel space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Advanced</p>
            <h3 className="mt-2 text-[1.25rem] font-semibold tracking-[-0.03em] text-[var(--text-strong)]">개발 점검 모드</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              MCP 연결 허브, AI 연결 센터, Playwright 자동 점검, 업데이트 피드 관리, 로컬 복구 명령은 평소 운영에 필요하지 않아
              별도 모드에 모아두었습니다.
            </p>
          </div>
          <button
            type="button"
            className={developerMode ? 'button-primary' : 'button-secondary'}
            onClick={() => setDeveloperMode((prev) => !prev)}
          >
            {developerMode ? '개발 점검 모드 닫기' : '개발 점검 모드 열기'}
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="status-tile">
            <p className="metric-label">현재 연결</p>
            <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{activeConnectionName}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">개발 점검 모드에서만 MCP 연결과 자동화 검사를 다룹니다.</p>
          </div>
          <div className="status-tile">
            <p className="metric-label">Playwright QA</p>
            <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{playwrightConnection?.enabled ? '연결 준비됨' : '비활성'}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">홈, 설정, 데이터, 세미나 흐름을 자동으로 점검할 수 있습니다.</p>
          </div>
          <div className="status-tile">
            <p className="metric-label">환경 진단</p>
            <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">
              {envStatus?.ok ? '정상' : developerMode ? '확인 필요' : '숨김'}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {envStatus?.ok ? '현재 실행 환경 키 상태가 정상입니다.' : '세부 누락 항목은 개발 점검 모드 안에서만 표시합니다.'}
            </p>
          </div>
        </div>

        {!developerMode ? (
          <div className="surface-note">
            <strong>평소에는 이 모드를 열지 않아도 됩니다.</strong> 운영자는 위의 실행 환경, 컨텍스트, 에이전트 정책, 업데이트만 관리하면
            충분합니다.
          </div>
        ) : (
          <div className="space-y-6">
            {envStatus && !envStatus.ok && (
              <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                실행 환경 누락 항목: {envStatus.missing.join(', ')}
              </div>
            )}

            <McpConnectionHub onActiveConnectionChange={setActiveMcpConnection} onHubChange={setMcpHub} />

            <McpInspector connection={activeMcpConnection} />

            <PlaywrightSmokePack connection={playwrightConnection} />

            <div className="grid gap-4 xl:grid-cols-2">
              <section className="soft-panel space-y-3">
                <h4 className="text-lg font-semibold text-[var(--text-strong)]">업데이트 피드 관리</h4>
                <p className="text-sm leading-6 text-[var(--text-muted)]">
                  배포 채널 주소 변경이나 테스트용 피드 전환은 이 영역에서만 조정합니다.
                </p>
                <label className="space-y-2 text-sm text-[var(--text-base)]">
                  <span>업데이트 피드 URL</span>
                  <input
                    className="input"
                    value={updateFeedUrl}
                    onChange={(e) => setUpdateFeedUrl(e.target.value)}
                    placeholder="https://your-company-cdn.example.com/ai-marketing/mac"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="button-secondary" onClick={onSaveUpdateConfig} disabled={savingUpdateConfig}>
                    {savingUpdateConfig ? '저장 중...' : 'URL 저장'}
                  </button>
                  <p className="text-xs text-[var(--text-muted)]">
                    현재 소스:{' '}
                    {updateConfigSource === 'saved'
                      ? '앱 저장값'
                      : updateConfigSource === 'env'
                        ? '.env(APP_UPDATE_URL)'
                        : updateConfigSource === 'bundled'
                          ? '내장 설정(app-update.yml)'
                          : '미설정'}
                  </p>
                </div>
              </section>

              <section className="soft-panel space-y-3">
                <h4 className="text-lg font-semibold text-[var(--text-strong)]">로컬 복구 도구</h4>
                <p className="text-sm leading-6 text-[var(--text-muted)]">
                  `./638.js` 또는 `next-font-manifest` 같은 오류는 대부분 Next 캐시 손상입니다. 로컬 개발 환경 복구가 필요할 때만 사용하세요.
                </p>
                <button type="button" onClick={onCopyRecoveryCommand} className="button-secondary">
                  복구 명령 복사
                </button>
                <p className="text-xs text-[var(--text-muted)]">
                  터미널 실행: <code>npm run dev:clean</code>
                  {copied ? ' (복사됨)' : ''}
                </p>
              </section>
            </div>
          </div>
        )}
      </section>
      </>)}
    </div>
  );
}
