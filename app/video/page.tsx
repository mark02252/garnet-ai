'use client';

import { useEffect, useState } from 'react';

const FORMATS = [
  { key: 'REELS_9_16', label: 'Reels (9:16)' },
  { key: 'SHORTS_9_16', label: 'Shorts (9:16)' },
  { key: 'TIKTOK_9_16', label: 'TikTok (9:16)' },
  { key: 'SQUARE_1_1', label: '정사각형 (1:1)' },
  { key: 'LANDSCAPE_16_9', label: '가로 (16:9)' },
];

const PLATFORMS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'tiktok', label: 'TikTok' },
];

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: '대기', className: 'status-badge-neutral' },
  GENERATING: { label: '생성 중', className: 'status-badge-running' },
  EDITING: { label: '편집 중', className: 'status-badge-running' },
  COMPLETED: { label: '완료', className: 'status-badge-success' },
  FAILED: { label: '실패', className: 'status-badge-error' },
};

interface VideoRecord {
  id: string;
  prompt: string;
  format: string;
  platform: string;
  status: string;
  script?: string;
  videoUrl?: string;
  createdAt: string;
  error?: string;
}

export default function VideoStudioPage() {
  const [prompt, setPrompt] = useState('');
  const [format, setFormat] = useState('REELS_9_16');
  const [platform, setPlatform] = useState('instagram');
  const [generating, setGenerating] = useState(false);
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hasFalKey, setHasFalKey] = useState<boolean | null>(null);

  const loadVideos = () => {
    fetch('/api/video').then(r => r.json()).then(d => setVideos(d.videos || [])).catch(() => {});
  };

  useEffect(() => {
    loadVideos();
    fetch('/api/video/status').then(r => r.json()).then(d => setHasFalKey(Boolean(d.hasVideoGeneration))).catch(() => setHasFalKey(false));
  }, []);

  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError('');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch('/api/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), format, platform }),
        signal: controller.signal,
      });
      const result = await res.json();
      if (result.error) {
        setError(result.error);
      } else if (result.id) {
        setPrompt('');
        loadVideos();
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('요청 시간이 초과되었습니다. LLM API 키가 설정되어 있는지 확인하세요.');
      } else {
        setError('영상 생성 중 오류가 발생했습니다.');
      }
    } finally {
      clearTimeout(timeout);
      setGenerating(false);
    }
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 900 }}>
      {/* Hero */}
      <div className="dashboard-hero" style={{ marginBottom: 32 }}>
        <p className="dashboard-eyebrow">Video Studio</p>
        <h1 className="dashboard-title">영상 스튜디오</h1>
        <p className="dashboard-copy">
          AI가 마케팅 영상 스크립트를 자동 생성합니다
        </p>
        <div style={{
          marginTop: 16,
          padding: '14px 20px',
          borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(59,130,246,0.12) 100%)',
          border: '1px solid rgba(139,92,246,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: '50%',
            background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
            flexShrink: 0,
          }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
              <path d="M15 10l4.553-2.276A1 1 0 0121 8.72v6.56a1 1 0 01-1.447.896L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 2 }}>
              릴스·쇼츠·틱톡 포맷 지원
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              프롬프트를 입력하면 플랫폼에 최적화된 스크립트를 자동 생성합니다
            </p>
          </div>
        </div>
      </div>

      {/* 생성 폼 */}
      <div className="panel" style={{ padding: 24, marginBottom: 32 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>
          어떤 영상을 만들까요?
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="예: '신제품 런칭 티저 릴스, 세련된 분위기로 만들어줘'"
          style={{
            width: '100%', minHeight: 100, padding: 14, fontSize: 15,
            border: '1px solid var(--border, #e5e7eb)', borderRadius: 'var(--radius-sm, 8px)',
            background: 'var(--surface, #fff)', color: 'var(--text-strong, #333)',
            resize: 'vertical', fontFamily: 'inherit', outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>포맷</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {FORMATS.map(f => (
              <button key={f.key} className={`pill-option ${format === f.key ? 'pill-option-active' : ''}`}
                onClick={() => setFormat(f.key)}>{f.label}</button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>플랫폼</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {PLATFORMS.map(p => (
              <button key={p.key} className={`pill-option ${platform === p.key ? 'pill-option-active' : ''}`}
                onClick={() => setPlatform(p.key)}>{p.label}</button>
            ))}
          </div>
        </div>

        <button
          className="button-primary"
          onClick={handleGenerate}
          disabled={!prompt.trim() || generating}
          style={{
            marginTop: 20, width: '100%', padding: '14px 0', fontSize: 15,
            background: generating ? undefined : 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
            border: 'none',
            borderRadius: 10,
            fontWeight: 700,
            letterSpacing: '0.02em',
          }}
        >
          {generating ? (hasFalKey ? '영상 생성 중...' : '스크립트 생성 중...') : (hasFalKey ? '✦ 영상 생성 (LTX-2.3)' : '✦ 영상 스크립트 생성')}
        </button>

        {error && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
            <p style={{ fontSize: 13, color: '#ef4444' }}>{error}</p>
          </div>
        )}
      </div>

      {/* 영상 생성 상태 안내 카드 */}
      <div style={{
        marginBottom: 32, padding: '14px 18px',
        background: hasFalKey
          ? 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(59,130,246,0.08) 100%)'
          : 'var(--surface-sub, #f8fafc)',
        border: hasFalKey
          ? '1px solid rgba(139,92,246,0.25)'
          : '1px solid var(--surface-border, #e2e8f0)',
        borderRadius: 10,
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{hasFalKey ? '✅' : 'ℹ️'}</span>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 3 }}>
            {hasFalKey ? 'LTX-2.3 영상 생성이 활성화되어 있습니다' : '영상 렌더링 MCP 연동'}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {hasFalKey
              ? 'Fal.ai LTX-Video 2.3 모델로 실제 영상을 자동 생성합니다. 스크립트와 영상을 함께 제공합니다.'
              : '현재는 AI 스크립트만 제공됩니다. FAL_KEY를 설정하면 LTX-2.3 영상 자동 생성이 활성화됩니다.'}
          </p>
        </div>
      </div>

      {/* 생성 기록 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 className="section-title">생성 기록</h2>
        {videos.length > 0 && (
          <span className="accent-pill" style={{ fontSize: 11 }}>{videos.length}개</span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {videos.map(v => {
          const statusInfo = STATUS_LABELS[v.status] || STATUS_LABELS.PENDING;
          const isExpanded = expandedId === v.id;
          const formatLabel = FORMATS.find(f => f.key === v.format)?.label ?? v.format.replace('_', ' ');
          return (
            <div key={v.id} className="list-card" style={{ cursor: 'pointer', transition: 'box-shadow 0.15s' }}
              onClick={() => setExpandedId(isExpanded ? null : v.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className={`status-badge ${statusInfo.className}`}>{statusInfo.label}</span>
                    <span className="accent-pill" style={{ fontSize: 10 }}>{formatLabel}</span>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 100,
                      background: 'var(--surface-sub)', color: 'var(--text-muted)',
                      border: '1px solid var(--surface-border)',
                    }}>{v.platform}</span>
                  </div>
                  <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)' }}>
                    {v.prompt.slice(0, 120)}{v.prompt.length > 120 ? '...' : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {new Date(v.createdAt).toLocaleDateString('ko-KR')}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {isExpanded ? '▲ 접기' : '▼ 펼치기'}
                  </span>
                </div>
              </div>

              {isExpanded && v.script && (
                <div style={{ marginTop: 14, padding: 16, background: 'var(--surface-alt, #f9fafb)', borderRadius: 10, border: '1px solid var(--surface-border)' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, marginBottom: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    생성된 스크립트
                  </p>
                  <pre style={{
                    fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    color: 'var(--text-strong)', margin: 0, fontFamily: 'inherit',
                  }}>
{v.script}
                  </pre>
                </div>
              )}
              {isExpanded && v.videoUrl && (
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, marginBottom: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    생성된 영상
                  </p>
                  <video
                    src={v.videoUrl}
                    controls
                    style={{ width: '100%', maxHeight: 400, borderRadius: 10, background: '#000' }}
                  />
                  <a
                    href={v.videoUrl}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button-secondary"
                    style={{ marginTop: 10, display: 'inline-block', fontSize: 13 }}
                  >
                    영상 다운로드
                  </a>
                </div>
              )}
              {isExpanded && v.error && (
                <p style={{ marginTop: 10, fontSize: 13, color: '#ef4444', padding: '8px 12px', background: '#fef2f2', borderRadius: 8 }}>
                  {v.error}
                </p>
              )}
            </div>
          );
        })}
        {videos.length === 0 && (
          <div className="soft-card" style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🎬</div>
            <p style={{ fontWeight: 600, color: 'var(--text-strong)', marginBottom: 6 }}>
              아직 생성된 영상 스크립트가 없습니다
            </p>
            <p className="dashboard-copy" style={{ fontSize: 13 }}>
              위 폼에서 첫 번째 스크립트를 생성해 보세요.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
