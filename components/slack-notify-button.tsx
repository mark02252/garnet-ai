'use client';

import { useState, useEffect } from 'react';
import { loadStoredMcpHubDraft } from '@/lib/mcp-hub-storage';

const STORAGE_KEY = 'slack_notify_channel_id';

type SlackNotifyProps = {
  title: string;
  content: string;
  /** 발행 컨텍스트에 맞는 이모지 */
  emoji?: string;
};

type SendState = 'idle' | 'loading-channels' | 'selecting' | 'sending' | 'success' | 'error' | 'not-connected';

type SlackChannel = { id: string; name: string };

function SlackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"
        fill="currentColor"
      />
    </svg>
  );
}

export function SlackNotifyButton({ title, content, emoji = '📣' }: SlackNotifyProps) {
  const [state, setState] = useState<SendState>('idle');
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [channelId, setChannelId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setChannelId(saved);
    } catch {
      // ignore
    }
  }, []);

  function saveChannelId(val: string) {
    setChannelId(val);
    try {
      localStorage.setItem(STORAGE_KEY, val);
    } catch {
      // ignore
    }
  }

  async function getSlackConnection() {
    const stored = await loadStoredMcpHubDraft();
    return stored.value.connections.find((c) => c.id === 'slack') ?? null;
  }

  async function callSlackTool(name: string, args: Record<string, unknown>, connection: object) {
    const res = await fetch('/api/mcp/tool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, arguments: args, connection })
    });
    const json = await res.json() as {
      ok: boolean;
      result?: { content?: Array<{ type: string; text: string }>; isError?: boolean };
      error?: string;
    };
    if (!json.ok) throw new Error(json.error || `${name} 호출 실패`);
    if (json.result?.isError) {
      const errText = json.result.content?.find(c => c.type === 'text')?.text || 'Slack API 오류';
      throw new Error(errText);
    }
    const text = json.result?.content?.find(c => c.type === 'text')?.text ?? '';
    try { return JSON.parse(text) as Record<string, unknown>; } catch { return { text }; }
  }

  async function handleClick() {
    const slack = await getSlackConnection();
    if (!slack || !slack.bearerToken.trim()) {
      setState('not-connected');
      return;
    }

    // 채널이 이미 선택돼 있으면 바로 전송
    if (channelId.trim()) {
      await sendMessage(slack);
      return;
    }

    // 채널 목록 로드
    setState('loading-channels');
    setErrorMsg('');
    try {
      const data = await callSlackTool('slack_list_channels', { limit: 100 }, slack);
      const list = (data.channels as Array<{ id: string; name: string }> | undefined) ?? [];
      setChannels(list);
      setState('selecting');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '채널 목록을 불러오지 못했습니다.');
      setState('error');
    }
  }

  async function sendMessage(slack: object) {
    if (!channelId.trim()) return;
    setState('sending');
    setErrorMsg('');
    try {
      const text = `${emoji} *${title}*\n\n${content.slice(0, 3000)}`;
      await callSlackTool('slack_post_message', { channel_id: channelId.trim(), text }, slack);
      setState('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Slack 전송 중 오류가 발생했습니다.');
      setState('error');
    }
  }

  async function handleSelectAndSend(id: string) {
    saveChannelId(id);
    const slack = await getSlackConnection();
    if (!slack) return;
    setState('sending');
    setErrorMsg('');
    try {
      const text = `${emoji} *${title}*\n\n${content.slice(0, 3000)}`;
      await callSlackTool('slack_post_message', { channel_id: id, text }, slack);
      setState('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Slack 전송 중 오류가 발생했습니다.');
      setState('error');
    }
  }

  function handleReset() {
    setState('idle');
    setErrorMsg('');
  }

  if (state === 'not-connected') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
        <SlackIcon />
        Slack 미연결 —{' '}
        <a href="/settings" className="text-[var(--accent)] underline">
          설정에서 연결
        </a>
      </span>
    );
  }

  if (state === 'success') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-emerald-700">
          <SlackIcon />
          Slack 전송 완료
        </span>
        <button type="button" className="button-secondary flex items-center gap-1.5 text-xs" onClick={handleReset}>
          다시 보내기
        </button>
      </div>
    );
  }

  if (state === 'selecting') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-[var(--text-muted)]">전송할 Slack 채널을 선택하세요</p>
        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-[var(--surface-border)] bg-[var(--surface-sub)] p-1">
          {channels.length === 0 && (
            <p className="px-3 py-2 text-xs text-[var(--text-muted)]">연결된 채널이 없습니다.</p>
          )}
          {channels.map((ch) => (
            <button
              key={ch.id}
              type="button"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[var(--text-base)] hover:bg-[var(--surface-hover)]"
              onClick={() => void handleSelectAndSend(ch.id)}
            >
              <span className="text-[var(--text-muted)]">#</span>
              {ch.name}
            </button>
          ))}
        </div>
        <button type="button" className="button-secondary text-xs" onClick={handleReset}>
          취소
        </button>
      </div>
    );
  }

  const isLoading = state === 'loading-channels' || state === 'sending';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="button-secondary flex items-center gap-1.5 text-sm"
        disabled={isLoading}
        onClick={() => void handleClick()}
      >
        <SlackIcon />
        {state === 'loading-channels'
          ? '채널 불러오는 중...'
          : state === 'sending'
            ? '전송 중...'
            : 'Slack 공유'}
      </button>
      {channelId && !isLoading && (
        <button
          type="button"
          className="text-xs text-[var(--text-muted)] underline"
          onClick={() => { saveChannelId(''); setState('idle'); setChannels([]); }}
        >
          채널 변경
        </button>
      )}
      {state === 'error' && (
        <span className="text-xs text-rose-600">{errorMsg}</span>
      )}
    </div>
  );
}
