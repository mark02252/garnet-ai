'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  canInspectMcpConnection,
  createDefaultMcpHubDraft,
  describeMcpConnectionReadiness,
  getActiveMcpConnection,
  getMcpConnectionById,
  getMcpConnectionPhaseLabel,
  type McpConnectionDraft,
  type McpHubDraft
} from '@/lib/mcp-connections';
import { loadStoredMcpHubDraft, saveStoredMcpHubDraft } from '@/lib/mcp-hub-storage';

type ConnectionHealth = {
  ok: boolean;
  message: string;
  checkedAt: string;
  durationMs?: number;
  toolCount?: number;
  resourceCount?: number;
  promptCount?: number;
};

type McpConnectionHubProps = {
  onActiveConnectionChange?: (connection: McpConnectionDraft | null) => void;
  onHubChange?: (hub: McpHubDraft) => void;
};

function phaseOrder(phase: 0 | 1 | 2 | 3) {
  return phase;
}

function readinessToneClass(tone: 'ready' | 'setup' | 'planned') {
  if (tone === 'ready') return 'bg-emerald-100 text-emerald-700';
  if (tone === 'setup') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-600';
}

export function McpConnectionHub({ onActiveConnectionChange, onHubChange }: McpConnectionHubProps) {
  const [hub, setHub] = useState<McpHubDraft>(createDefaultMcpHubDraft());
  const [selectedId, setSelectedId] = useState('aimd-local');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [checkingId, setCheckingId] = useState('');
  const [healthById, setHealthById] = useState<Record<string, ConnectionHealth>>({});

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await loadStoredMcpHubDraft();
      if (cancelled) return;

      setHub(result.value);
      setSelectedId(result.value.activeConnectionId || 'aimd-local');
      setLoading(false);

      if (result.source === 'migrated_local') {
        setSaveMessage('기존 연결 허브 설정을 안전 저장소로 이관했습니다.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onActiveConnectionChange?.(getActiveMcpConnection(hub));
    onHubChange?.(hub);
  }, [hub, onActiveConnectionChange, onHubChange]);

  const selectedConnection = useMemo(
    () => getMcpConnectionById(hub, selectedId) || getActiveMcpConnection(hub),
    [hub, selectedId]
  );

  const groupedConnections = useMemo(() => {
    const groups = new Map<number, McpConnectionDraft[]>();
    for (const connection of hub.connections) {
      const next = groups.get(connection.phase) || [];
      next.push(connection);
      groups.set(connection.phase, next);
    }
    return Array.from(groups.entries())
      .sort((a, b) => phaseOrder(a[0] as 0 | 1 | 2 | 3) - phaseOrder(b[0] as 0 | 1 | 2 | 3))
      .map(([phase, connections]) => ({ phase: phase as 0 | 1 | 2 | 3, connections }));
  }, [hub.connections]);

  function updateConnection(connectionId: string, updater: (current: McpConnectionDraft) => McpConnectionDraft) {
    setHub((prev) => ({
      ...prev,
      connections: prev.connections.map((connection) => (connection.id === connectionId ? updater(connection) : connection))
    }));
  }

  async function saveHub() {
    setSaving(true);
    setSaveError('');
    setSaveMessage('');
    const result = await saveStoredMcpHubDraft(hub);
    setSaving(false);

    if (!result.ok) {
      setSaveError(result.message || '연결 허브 저장에 실패했습니다.');
      return;
    }

    setSaveMessage(
      result.source === 'secure'
        ? `연결 허브를 안전 저장소에 저장했습니다. (${new Date().toLocaleString('ko-KR')})`
        : `연결 허브를 로컬 저장소에 저장했습니다. (${new Date().toLocaleString('ko-KR')})`
    );
  }

  function restoreTemplates() {
    const defaults = createDefaultMcpHubDraft();
    setHub(defaults);
    setSelectedId(defaults.activeConnectionId);
    setSaveError('');
    setSaveMessage('기본 연결 템플릿을 불러왔습니다. 저장 버튼으로 반영하세요.');
  }

  async function checkConnection(connection: McpConnectionDraft) {
    setCheckingId(connection.id);
    try {
      const res = await fetch('/api/mcp/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || '연결 점검 실패');
      }

      setHealthById((prev) => ({
        ...prev,
        [connection.id]: {
          ok: true,
          message: `${(data.tools || []).length}개 도구, ${(data.resources || []).length}개 리소스, ${(data.prompts || []).length}개 프롬프트 확인`,
          checkedAt: new Date().toLocaleString('ko-KR'),
          durationMs: data.durationMs,
          toolCount: (data.tools || []).length,
          resourceCount: (data.resources || []).length,
          promptCount: (data.prompts || []).length
        }
      }));
    } catch (error) {
      setHealthById((prev) => ({
        ...prev,
        [connection.id]: {
          ok: false,
          message: error instanceof Error ? error.message : '연결 점검 실패',
          checkedAt: new Date().toLocaleString('ko-KR')
        }
      }));
    } finally {
      setCheckingId('');
    }
  }

  if (loading) {
    return <section className="panel text-sm text-slate-500">연결 허브를 불러오는 중...</section>;
  }

  return (
    <section className="panel space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Connection Hub</p>
          <h3 className="mt-2 text-[1.25rem] font-semibold tracking-[-0.03em] text-slate-950">MCP 연결 허브</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            앞으로 붙일 Notion, Figma, Playwright, Sentry 같은 외부 MCP를 한 곳에서 관리합니다. 지금은 연결 레지스트리와 점검
            기반을 먼저 만들고, Wave 순서대로 실제 연결을 확장합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="button-secondary" onClick={restoreTemplates}>
            기본 템플릿 불러오기
          </button>
          <button type="button" className="button-primary" onClick={() => void saveHub()} disabled={saving}>
            {saving ? '저장 중...' : '연결 허브 저장'}
          </button>
        </div>
      </div>

      {saveMessage && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{saveMessage}</p>}
      {saveError && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{saveError}</p>}

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          {groupedConnections.map((group) => (
            <div key={group.phase} className="soft-panel">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-950">{getMcpConnectionPhaseLabel(group.phase)}</p>
                <span className="text-xs text-slate-400">{group.connections.length}개 연결</span>
              </div>
              <div className="mt-3 space-y-2">
                {group.connections.map((connection) => {
                  const readiness = describeMcpConnectionReadiness(connection);
                  const health = healthById[connection.id];
                  const active = hub.activeConnectionId === connection.id;
                  const selected = selectedConnection?.id === connection.id;
                  return (
                    <button
                      key={connection.id}
                      type="button"
                      onClick={() => setSelectedId(connection.id)}
                      className={`w-full rounded-[22px] border px-4 py-3 text-left transition ${
                        selected ? 'border-sky-200 bg-sky-50/80' : 'border-slate-200 bg-white/88 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">{connection.name}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{connection.description}</p>
                        </div>
                        {active && <span className="accent-pill">활성</span>}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${readinessToneClass(readiness.tone)}`}>
                          {readiness.label}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                          {connection.transport}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                          {connection.scope}
                        </span>
                      </div>
                      {health && (
                        <p className={`mt-3 text-xs ${health.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                          최근 점검: {health.message} ({health.checkedAt})
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {selectedConnection && (
          <div className="soft-panel space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{selectedConnection.id}</p>
                <h4 className="mt-2 text-[1.15rem] font-semibold text-slate-950">{selectedConnection.name}</h4>
                <p className="mt-2 text-sm leading-6 text-slate-500">{selectedConnection.description}</p>
              </div>
              <button
                type="button"
                className={hub.activeConnectionId === selectedConnection.id ? 'button-primary' : 'button-secondary'}
                onClick={() => setHub((prev) => ({ ...prev, activeConnectionId: selectedConnection.id }))}
              >
                {hub.activeConnectionId === selectedConnection.id ? '현재 활성 연결' : '이 연결을 활성으로 선택'}
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="status-tile">
                <p className="text-xs text-slate-400">Wave</p>
                <p className="mt-2 font-semibold text-slate-950">{getMcpConnectionPhaseLabel(selectedConnection.phase)}</p>
              </div>
              <div className="status-tile">
                <p className="text-xs text-slate-400">권장 화면</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{selectedConnection.recommendedScreens.join(' · ') || '미지정'}</p>
              </div>
              <div className="status-tile">
                <p className="text-xs text-slate-400">준비 상태</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{describeMcpConnectionReadiness(selectedConnection).detail}</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">연결 사용 여부</label>
                <button
                  type="button"
                  className={`pill-option ${selectedConnection.enabled ? 'pill-option-active' : ''}`}
                  disabled={selectedConnection.readonly}
                  onClick={() =>
                    updateConnection(selectedConnection.id, (current) => ({
                      ...current,
                      enabled: !current.enabled
                    }))
                  }
                >
                  {selectedConnection.enabled ? '사용 중' : '비활성'}
                </button>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">문서</label>
                {selectedConnection.documentationUrl ? (
                  <a
                    className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[var(--accent)]"
                    href={selectedConnection.documentationUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    공식 문서 열기
                  </a>
                ) : (
                  <p className="text-sm text-slate-500">내부 연결이라 별도 문서가 필요하지 않습니다.</p>
                )}
              </div>
            </div>

            {selectedConnection.transport === 'stdio' && (
              <div className="grid gap-3 lg:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">실행 명령</label>
                  <input
                    className="input"
                    value={selectedConnection.command}
                    onChange={(e) =>
                      updateConnection(selectedConnection.id, (current) => ({
                        ...current,
                        command: e.target.value
                      }))
                    }
                    disabled={selectedConnection.readonly}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">인자</label>
                  <input
                    className="input"
                    value={selectedConnection.args.join(' ')}
                    onChange={(e) =>
                      updateConnection(selectedConnection.id, (current) => ({
                        ...current,
                        args: e.target.value
                          .split(/\s+/)
                          .map((item) => item.trim())
                          .filter(Boolean)
                      }))
                    }
                    disabled={selectedConnection.readonly}
                  />
                </div>
              </div>
            )}

            {selectedConnection.transport === 'streamable-http' && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Endpoint URL</label>
                  <input
                    className="input"
                    value={selectedConnection.url}
                    onChange={(e) =>
                      updateConnection(selectedConnection.id, (current) => ({
                        ...current,
                        url: e.target.value
                      }))
                    }
                    disabled={selectedConnection.setupMode === 'oauth'}
                    placeholder={selectedConnection.setupMode === 'manual' ? 'https://...' : ''}
                  />
                </div>

                {selectedConnection.setupMode !== 'oauth' && selectedConnection.authMode === 'bearer' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Bearer Token</label>
                    <input
                      className="input"
                      type="password"
                      value={selectedConnection.bearerToken}
                      onChange={(e) =>
                        updateConnection(selectedConnection.id, (current) => ({
                          ...current,
                          bearerToken: e.target.value
                        }))
                      }
                    />
                  </div>
                )}

                {selectedConnection.setupMode !== 'oauth' && selectedConnection.authMode === 'basic' && (
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Username</label>
                      <input
                        className="input"
                        value={selectedConnection.basicUsername}
                        onChange={(e) =>
                          updateConnection(selectedConnection.id, (current) => ({
                            ...current,
                            basicUsername: e.target.value
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Password / Access Key</label>
                      <input
                        className="input"
                        type="password"
                        value={selectedConnection.basicPassword}
                        onChange={(e) =>
                          updateConnection(selectedConnection.id, (current) => ({
                            ...current,
                            basicPassword: e.target.value
                          }))
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="surface-note">
              <strong>설정 가이드</strong> {selectedConnection.setupHint}
            </div>

            {selectedConnection.note && (
              <div className="rounded-[22px] border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-500">{selectedConnection.note}</div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="button-secondary"
                disabled={!canInspectMcpConnection(selectedConnection) || checkingId === selectedConnection.id}
                onClick={() => void checkConnection(selectedConnection)}
              >
                {checkingId === selectedConnection.id ? '연결 점검 중...' : '연결 점검'}
              </button>
              {!canInspectMcpConnection(selectedConnection) && (
                <span className="text-xs text-slate-500">이 연결은 아직 점검할 준비가 되지 않았습니다.</span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
