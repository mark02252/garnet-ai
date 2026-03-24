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

  const loadVideos = () => {
    fetch('/api/video').then(r => r.json()).then(d => setVideos(d.videos || [])).catch(() => {});
  };

  useEffect(() => { loadVideos(); }, []);

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), format, platform }),
      });
      const result = await res.json();
      if (result.id) {
        setPrompt('');
        loadVideos();
      }
    } catch {} finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 900 }}>
      <h1 className="dashboard-title">영상 스튜디오</h1>
      <p className="dashboard-copy" style={{ marginBottom: 24 }}>
        마케팅 영상을 AI가 자동으로 만들어드립니다. 원하는 내용을 설명하세요.
      </p>

      {/* 생성 폼 */}
      <div className="panel" style={{ padding: 24, marginBottom: 32 }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="어떤 영상을 만들까요? 예: '신제품 런칭 티저 릴스, 세련된 분위기로 만들어줘'"
          style={{
            width: '100%', minHeight: 100, padding: 14, fontSize: 15,
            border: '1px solid var(--border, #e5e7eb)', borderRadius: 'var(--radius-sm, 8px)',
            background: 'var(--surface, #fff)', color: 'var(--text-strong, #333)',
            resize: 'vertical', fontFamily: 'inherit', outline: 'none',
          }}
        />

        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)' }}>포맷</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {FORMATS.map(f => (
              <button key={f.key} className={`pill-option ${format === f.key ? 'pill-option-active' : ''}`}
                onClick={() => setFormat(f.key)}>{f.label}</button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)' }}>플랫폼</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {PLATFORMS.map(p => (
              <button key={p.key} className={`pill-option ${platform === p.key ? 'pill-option-active' : ''}`}
                onClick={() => setPlatform(p.key)}>{p.label}</button>
            ))}
          </div>
        </div>

        <button className="button-primary" onClick={handleGenerate} disabled={!prompt.trim() || generating}
          style={{ marginTop: 20, width: '100%', padding: '12px 0', fontSize: 15 }}>
          {generating ? '생성 중...' : '영상 스크립트 생성'}
        </button>
      </div>

      {/* 이전 생성 목록 */}
      <h2 className="section-title" style={{ marginBottom: 16 }}>생성 기록</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {videos.map(v => {
          const statusInfo = STATUS_LABELS[v.status] || STATUS_LABELS.PENDING;
          const isExpanded = expandedId === v.id;
          return (
            <div key={v.id} className="list-card" style={{ cursor: 'pointer' }}
              onClick={() => setExpandedId(isExpanded ? null : v.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <span className={`status-badge ${statusInfo.className}`}>{statusInfo.label}</span>
                    <span className="accent-pill" style={{ fontSize: 10 }}>{v.format.replace('_', ' ')}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{v.platform}</span>
                  </div>
                  <p style={{ fontWeight: 600, fontSize: 14 }}>{v.prompt.slice(0, 120)}</p>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {new Date(v.createdAt).toLocaleDateString('ko-KR')}
                </span>
              </div>
              {isExpanded && v.script && (
                <div style={{ marginTop: 12, padding: 16, background: 'var(--surface-alt, #f9fafb)', borderRadius: 8 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)' }}>생성된 스크립트</p>
                  <pre style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-strong)' }}>
                    {v.script}
                  </pre>
                </div>
              )}
              {isExpanded && v.error && (
                <p style={{ marginTop: 8, fontSize: 13, color: 'var(--status-error, #ef4444)' }}>{v.error}</p>
              )}
            </div>
          );
        })}
        {videos.length === 0 && (
          <div className="soft-card" style={{ textAlign: 'center', padding: 40 }}>
            <p className="dashboard-copy">아직 생성된 영상이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
