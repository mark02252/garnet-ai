'use client';

import { useState } from 'react';
import { loadStoredMcpHubDraft } from '@/lib/mcp-hub-storage';

type NotionPublishProps = {
  title: string;
  content: string;
  contentType?: 'seminar-report' | 'playbook' | 'briefing';
};

type PublishState = 'idle' | 'loading' | 'success' | 'error' | 'not-connected';

function NotionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 100 100" fill="none" aria-hidden>
      <path
        d="M6 10.6c1.6 1.3 2.2 1.2 5.2 1l48.2-2.9c.6 0 .1-.6-.1-.7L51.5 3.4c-1.2-.9-2.8-2-5.6-1.8L4.2 4.7c-1.7.1-2 1-1.3 1.7l3.1 4.2z"
        fill="currentColor"
      />
      <path
        d="M7.7 20.7V76c0 2.7 1.3 3.7 4.4 3.5l53.3-3.1c3.1-.2 3.5-1.9 3.5-4.1V17.2c0-2.2-.9-3.3-2.8-3.1L10.7 17.4c-2.1.2-3 1.2-3 3.3z"
        fill="white"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="M60.6 21.4l-13.9.8c-.5 0-.6.3-.6.7v2.6c0 .4.1.5.4.5.3 0 1.2-.2 3.2-.3 2-.1 2.5.3 2.5 1.8V47c0 1.5-.5 2.2-1.7 2.7-1.2.5-2 .1-2.5-.6L32.6 25.7c-1.2-1.7-2.5-2.4-5.5-2.2L16 24.2c-.5 0-.7.3-.7.7v2.6c0 .4.2.6.5.5 3-.2 3.5 0 3.5 1.5v22.8c0 2.6-.7 3.5-3 3.7l-1.2.1c-.4 0-.5.2-.5.6v2.6c0 .4.2.6.7.5L28.6 58c.5 0 .7-.3.7-.7v-2.6c0-.4-.2-.5-.7-.6-1.4-.1-2-.4-2-1.9V31.8l17.7 27.1c.8 1.3 1.5 1.5 3 1.4l4-.2c1.5-.1 2.2-.6 2.2-2.4V25.4c0-1.5.5-2.1 3-2.3.4 0 .6-.2.6-.7v-2.7c0-.4-.2-.5-.5-.5h-.3z"
        fill="currentColor"
      />
    </svg>
  );
}

export function NotionPublishButton({ title, content, contentType = 'seminar-report' }: NotionPublishProps) {
  const [state, setState] = useState<PublishState>('idle');
  const [pageUrl, setPageUrl] = useState('');
  const [parentPageId, setParentPageId] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handlePublish() {
    const stored = await loadStoredMcpHubDraft();
    const notion = stored.value.connections.find((c) => c.id === 'notion');

    if (!notion || !notion.enabled || !notion.bearerToken.trim()) {
      setState('not-connected');
      return;
    }

    if (!parentPageId.trim()) {
      setShowInput(true);
      return;
    }

    setState('loading');
    setErrorMsg('');

    try {
      const emoji =
        contentType === 'seminar-report' ? '📋' : contentType === 'playbook' ? '📖' : '📰';

      const res = await fetch('/api/mcp/tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'API_create_a_page',
          arguments: {
            parent: { page_id: parentPageId.replace(/-/g, '').replace(/[^a-f0-9]/gi, '') || parentPageId },
            properties: {
              title: {
                title: [{ text: { content: `${emoji} ${title}` } }]
              }
            },
            children: [
              {
                object: 'block',
                type: 'paragraph',
                paragraph: {
                  rich_text: [{ type: 'text', text: { content: content.slice(0, 2000) } }]
                }
              }
            ]
          },
          connection: notion
        })
      });

      const json = await res.json() as { ok: boolean; result?: { url?: string }; error?: string };

      if (!json.ok) {
        throw new Error(json.error || 'Notion 발행 실패');
      }

      const url = (json.result as Record<string, unknown>)?.url as string | undefined;
      setPageUrl(url || '');
      setState('success');
      setShowInput(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Notion 발행 중 오류가 발생했습니다.');
      setState('error');
    }
  }

  if (state === 'not-connected') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
        <NotionIcon />
        Notion 미연결 —{' '}
        <a href="/settings" className="text-[var(--accent)] underline">
          설정에서 연결
        </a>
      </span>
    );
  }

  if (state === 'success') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-700">
        <NotionIcon />
        Notion 발행 완료
        {pageUrl && (
          <>
            {' — '}
            <a href={pageUrl} target="_blank" rel="noreferrer" className="underline">
              페이지 열기
            </a>
          </>
        )}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showInput && (
        <input
          className="input w-64 text-sm"
          placeholder="Notion 상위 페이지 ID 또는 URL 붙여넣기"
          value={parentPageId}
          onChange={(e) => setParentPageId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handlePublish();
          }}
          autoFocus
        />
      )}
      <button
        type="button"
        className="button-secondary flex items-center gap-1.5 text-sm"
        disabled={state === 'loading'}
        onClick={() => void handlePublish()}
      >
        <NotionIcon />
        {state === 'loading' ? '발행 중...' : 'Notion 발행'}
      </button>
      {state === 'error' && (
        <span className="text-xs text-rose-600">{errorMsg}</span>
      )}
    </div>
  );
}
