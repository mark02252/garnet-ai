'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '@/lib/canvas-store';
import { CanvasPanel } from './canvas-panel';
import { GarnetGem } from '@/components/garnet-gem';

function ArcReactorIdle() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {/* 3D Garnet Crystal */}
      <GarnetGem size={1.2} className="h-48 w-48" />
      <p
        style={{
          fontSize: 10,
          letterSpacing: '0.3em',
          color: 'var(--shell-text-muted)',
          margin: 0,
        }}
      >
        STANDBY
      </p>
    </div>
  );
}

export function Canvas() {
  const panels = useCanvasStore((s) => s.panels);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setDims({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="canvas-hex-grid canvas-noise flex-1 relative overflow-hidden"
      style={{ background: 'var(--shell-bg)' }}
      data-canvas-width={dims.width}
      data-canvas-height={dims.height}
    >
      {/* Arc ring overlay — two rotating concentric circles */}
      <svg
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        <g style={{ transformOrigin: 'center', animation: 'arc-rotate 60s linear infinite' }}>
          <circle
            cx="50%"
            cy="50%"
            r="42%"
            fill="none"
            stroke="rgba(201,53,69,0.06)"
            strokeWidth="1"
          />
        </g>
        <g style={{ transformOrigin: 'center', animation: 'arc-rotate 40s linear reverse infinite' }}>
          <circle
            cx="50%"
            cy="50%"
            r="27%"
            fill="none"
            stroke="rgba(201,53,69,0.04)"
            strokeWidth="0.5"
          />
        </g>
      </svg>

      <AnimatePresence mode="popLayout">
        {panels.map((panel) => (
          <CanvasPanel key={panel.id} panel={panel} />
        ))}
      </AnimatePresence>

      {panels.length === 0 && <ArcReactorIdle />}
    </div>
  );
}
