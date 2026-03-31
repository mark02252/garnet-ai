'use client';

import { motion } from 'framer-motion';
import { Rnd } from 'react-rnd';
import { useCanvasStore, type CanvasPanel as CanvasPanelType } from '@/lib/canvas-store';
import { GA4SummaryPanel } from '@/components/panels/ga4-summary-panel';
import { SeminarStatusPanel } from '@/components/panels/seminar-status-panel';
import { IntelBriefPanel } from '@/components/panels/intel-brief-panel';
import { VideoStatusPanel } from '@/components/panels/video-status-panel';
import { ApprovalPanel } from '@/components/panels/approval-panel';

const panelVariants = {
  hidden:  { opacity: 0, scale: 0.92, y: 8 },
  visible: { opacity: 1, scale: 1,    y: 0,
             transition: { type: 'spring' as const, stiffness: 300, damping: 25 } },
  exit:    { opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.15 } }
};

// L-bracket corner decorations — four cyan corner accents
function LBracketCorners() {
  return (
    <>
      <span className="lb-tl" />
      <span className="lb-tr" />
      <span className="lb-bl" />
      <span className="lb-br" />
    </>
  );
}

export function CanvasPanel({ panel }: { panel: CanvasPanelType }) {
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const removePanel = useCanvasStore((s) => s.removePanel);

  // IMPORTANT: Rnd owns absolute positioning (x, y). The motion.div handles
  // only opacity/scale animation — no left/top on motion.div to avoid double-offset.
  return (
    <Rnd
      position={{ x: panel.position.x, y: panel.position.y }}
      size={{ width: panel.size.width, height: panel.size.height }}
      minWidth={280}
      minHeight={180}
      bounds="parent"
      onDragStop={(_, d) => updatePanel(panel.id, { position: { x: d.x, y: d.y } })}
      onResizeStop={(_, __, ref, ___, pos) =>
        updatePanel(panel.id, {
          size: { width: ref.offsetWidth, height: ref.offsetHeight },
          position: { x: pos.x, y: pos.y }
        })
      }
      style={{ position: 'absolute', zIndex: 10 }}
    >
      <motion.div
        key={panel.id}
        variants={panelVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        style={{ width: '100%', height: '100%', position: 'relative' }}
      >
        {/* Spawn scan-line — sweeps top to bottom once on mount */}
        <motion.div
          initial={{ top: 0, opacity: 1 }}
          animate={{ top: '100%', opacity: 0 }}
          transition={{ duration: 0.3, ease: 'linear' }}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 2,
            background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.8), transparent)',
            pointerEvents: 'none',
            zIndex: 11,
          }}
        />

        <div
          className="canvas-panel flex flex-col h-full"
          data-status={panel.status}
        >
          <LBracketCorners />

          {/* Panel header */}
          <div
            className="flex items-center justify-between px-3 py-2 cursor-move"
            style={{ borderBottom: '1px solid rgba(0,212,255,0.1)', flexShrink: 0 }}
          >
            <div className="flex items-center gap-2">
              {(panel.status === 'loading' || panel.status === 'active') && (
                <span className="dot-running" style={{ color: 'var(--shell-accent)', fontSize: 10 }}>●</span>
              )}
              {panel.status === 'completed' && (
                <span style={{ color: 'var(--shell-status-success)', fontSize: 10 }}>●</span>
              )}
              {panel.status === 'error' && (
                <span style={{ color: 'var(--shell-status-error)', fontSize: 10 }}>●</span>
              )}
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--shell-text-primary)' }}>
                {panel.title}
              </span>
            </div>
            <button
              onClick={() => removePanel(panel.id)}
              style={{
                color: 'var(--shell-text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0 2px',
                fontSize: 16,
                lineHeight: 1,
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--shell-text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--shell-text-muted)')}
            >
              ×
            </button>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-auto p-3">
            {panel.type === 'generic' ? (
              panel.status === 'loading' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--shell-text-muted)', fontSize: 12 }}>
                  <span className="dot-running" style={{ color: 'var(--shell-accent)' }}>●</span>
                  처리 중...
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--shell-text-secondary)', whiteSpace: 'pre-wrap' }}>
                  {panel.data.markdown}
                </p>
              )
            ) : (
              <TypedPanelContent panel={panel} />
            )}
          </div>
        </div>
      </motion.div>
    </Rnd>
  );
}

function TypedPanelContent({ panel }: { panel: CanvasPanelType }) {
  switch (panel.type) {
    case 'ga4':      return <GA4SummaryPanel data={panel.data} />;
    case 'seminar':  return <SeminarStatusPanel data={panel.data} />;
    case 'intel':    return <IntelBriefPanel data={panel.data} />;
    case 'video':    return <VideoStatusPanel data={panel.data} />;
    case 'approval': return <ApprovalPanel data={panel.data} />;
    default:         return null;
  }
}
