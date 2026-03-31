import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasStore } from './canvas-store';

// Vitest environment is 'node' (see vitest.config.ts) — no DOM, no act() needed
// Zustand setState is synchronous, so direct calls work without act()

beforeEach(() => {
  useCanvasStore.setState({ panels: [], history: [] });
});

describe('canvas store', () => {
  it('spawns a panel with generated id and timestamp', () => {
    useCanvasStore.getState().spawnPanel({
      type: 'generic',
      title: 'Test',
      position: { x: 0, y: 0 },
      size: { width: 380, height: 260 },
      data: { markdown: 'hello' }
    });
    const { panels } = useCanvasStore.getState();
    expect(panels).toHaveLength(1);
    expect(panels[0].id).toBeTruthy();
    expect(panels[0].spawnedAt).toBeTypeOf('number');
  });

  it('updatePanel merges partial fields', () => {
    const id = useCanvasStore.getState().spawnPanel({
      type: 'generic',
      title: 'T',
      position: { x: 0, y: 0 },
      size: { width: 380, height: 260 },
      data: { markdown: '' }
    });
    useCanvasStore.getState().updatePanel(id, { status: 'completed' });
    expect(useCanvasStore.getState().panels[0].status).toBe('completed');
  });

  it('removePanel removes by id and archives to history', () => {
    const id = useCanvasStore.getState().spawnPanel({
      type: 'generic',
      title: 'T',
      position: { x: 0, y: 0 },
      size: { width: 380, height: 260 },
      data: { markdown: '' }
    });
    useCanvasStore.getState().removePanel(id);
    expect(useCanvasStore.getState().panels).toHaveLength(0);
    expect(useCanvasStore.getState().history).toHaveLength(1);
  });

  it('limits panels to MAX_PANELS', () => {
    for (let i = 0; i < 12; i++) {
      useCanvasStore.getState().spawnPanel({
        type: 'generic',
        title: `P${i}`,
        position: { x: 0, y: 0 },
        size: { width: 380, height: 260 },
        data: { markdown: '' }
      });
    }
    expect(useCanvasStore.getState().panels.length).toBeLessThanOrEqual(10);
  });
});
