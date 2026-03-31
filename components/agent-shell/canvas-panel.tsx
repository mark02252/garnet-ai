'use client';

import { motion } from 'framer-motion';
import { Rnd } from 'react-rnd';
import { useCanvasStore, type CanvasPanel as CanvasPanelType } from '@/lib/canvas-store';

const panelVariants = {
  hidden:  { opacity: 0, scale: 0.92, y: 8 },
  visible: { opacity: 1, scale: 1,    y: 0,
             transition: { type: 'spring' as const, stiffness: 300, damping: 25 } },
  exit:    { opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.15 } }
};

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
        style={{ width: '100%', height: '100%' }}
      >
        <div
          className="canvas-panel flex flex-col h-full"
          data-status={panel.status}
        >
          {/* Panel header */}
          <div
            className="flex items-center justify-between px-3 py-2 cursor-move"
            style={{ borderBottom: '1px solid var(--shell-border)', flexShrink: 0 }}
          >
            <div className="flex items-center gap-2">
              {panel.status === 'loading' && (
                <span className="dot-running text-[var(--shell-accent)] text-[10px]">●</span>
              )}
              {panel.status === 'completed' && (
                <span className="text-[var(--shell-status-success)] text-[10px]">●</span>
              )}
              {panel.status === 'error' && (
                <span className="text-[var(--shell-status-error)] text-[10px]">●</span>
              )}
              <span className="text-[12px] font-semibold text-[var(--shell-text-primary)]">
                {panel.title}
              </span>
            </div>
            <button
              onClick={() => removePanel(panel.id)}
              className="text-[var(--shell-text-muted)] hover:text-[var(--shell-text-primary)] transition-colors text-[16px] leading-none"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
            >
              ×
            </button>
          </div>

          {/* Panel content — generic panels show loading spinner or markdown */}
          {/* Typed panels (ga4/seminar/intel/video/approval) will be wired in Task 14 */}
          <div className="flex-1 overflow-auto p-3">
            {panel.type === 'generic' ? (
              panel.status === 'loading' ? (
                <div className="flex items-center gap-2 text-[var(--shell-text-muted)] text-[12px]">
                  <span className="dot-running text-[var(--shell-accent)]">●</span>
                  처리 중...
                </div>
              ) : (
                <p className="text-[13px] text-[var(--shell-text-secondary)] whitespace-pre-wrap">
                  {panel.data.markdown}
                </p>
              )
            ) : (
              <div className="text-[12px] text-[var(--shell-text-muted)]">
                {panel.type} panel — Task 14에서 구현
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </Rnd>
  );
}
