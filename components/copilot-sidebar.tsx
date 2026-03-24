'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function CopilotSidebar() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === '.' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages.slice(-6) }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || '응답을 생성하지 못했습니다.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '오류가 발생했습니다. 다시 시도해주세요.' }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  if (!open) return null;

  return (
    <div className="copilot-sidebar">
      <div className="copilot-header">
        <span style={{ fontWeight: 700, fontSize: 15 }}>AI 코파일럿</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
      </div>

      <div className="copilot-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            마케팅에 대해 무엇이든 물어보세요.
            <br />예: &quot;이번 주 추천 액션은?&quot;, &quot;경쟁사 분석해줘&quot;
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`copilot-msg copilot-msg-${msg.role}`}>
            <p style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
          </div>
        ))}
        {loading && (
          <div className="copilot-msg copilot-msg-assistant">
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>생각 중...</p>
          </div>
        )}
      </div>

      <div className="copilot-input-area">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="메시지를 입력하세요..."
          style={{
            flex: 1, padding: '10px 14px', border: '1px solid var(--border, #e5e7eb)',
            borderRadius: 'var(--radius-sm, 8px)', fontSize: 14, outline: 'none',
            background: 'var(--surface, #fff)', color: 'var(--text-strong)',
          }}
        />
        <button className="button-primary" onClick={sendMessage} disabled={!input.trim() || loading}
          style={{ padding: '10px 16px', fontSize: 13 }}>전송</button>
      </div>
    </div>
  );
}
