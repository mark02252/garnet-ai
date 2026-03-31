'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '@/lib/canvas-store';
import { CanvasPanel } from './canvas-panel';

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
        gap: 16,
        pointerEvents: 'none',
      }}
    >
      {/* Concentric rings */}
      <div className="arc-reactor-breathe" style={{ position: 'relative', width: 112, height: 112 }}>
        {/* Outer ring */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '1px solid rgba(0,212,255,0.15)',
          }}
        />
        {/* Middle ring */}
        <div
          style={{
            position: 'absolute',
            inset: 16,
            borderRadius: '50%',
            border: '1px solid rgba(0,212,255,0.3)',
            boxShadow: '0 0 12px rgba(0,212,255,0.2)',
          }}
        />
        {/* Inner ring */}
        <div
          style={{
            position: 'absolute',
            inset: 32,
            borderRadius: '50%',
            border: '1px solid rgba(0,212,255,0.5)',
            boxShadow: '0 0 8px rgba(0,212,255,0.4), inset 0 0 8px rgba(0,212,255,0.2)',
          }}
        />
        {/* Center dot */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#00d4ff',
            boxShadow: '0 0 12px #00d4ff',
          }}
        />
      </div>
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
            stroke="rgba(0,212,255,0.06)"
            strokeWidth="1"
          />
        </g>
        <g style={{ transformOrigin: 'center', animation: 'arc-rotate 40s linear reverse infinite' }}>
          <circle
            cx="50%"
            cy="50%"
            r="27%"
            fill="none"
            stroke="rgba(0,212,255,0.04)"
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
