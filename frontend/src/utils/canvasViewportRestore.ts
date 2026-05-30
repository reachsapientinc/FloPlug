import type { Node, ReactFlowInstance } from '@xyflow/react';
import { getNodesBounds } from '@xyflow/react';
import type { CanvasViewport } from './tenantUiState';

const ZOOM_MIN = 0.12;
const ZOOM_MAX = 2;

export function clampCanvasViewport(vp: CanvasViewport): CanvasViewport {
  return {
    x: vp.x,
    y: vp.y,
    zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, vp.zoom)),
  };
}

/** True if at least one node center is roughly inside the visible canvas area. */
export function viewportShowsAnyNode(
  instance: ReactFlowInstance,
  nodes: Node[],
  containerWidth: number,
  containerHeight: number,
): boolean {
  if (nodes.length === 0 || containerWidth < 1 || containerHeight < 1) return true;

  const { x, y, zoom } = instance.getViewport();
  const margin = 80;

  return nodes.some(n => {
    const px = n.position.x * zoom + x;
    const py = n.position.y * zoom + y;
    return (
      px >= -margin
      && px <= containerWidth + margin
      && py >= -margin
      && py <= containerHeight + margin
    );
  });
}

/**
 * Apply saved pan/zoom after nodes are mounted; fall back to fitView if off-screen.
 */
export function restoreCanvasViewport(
  instance: ReactFlowInstance,
  viewport: CanvasViewport,
  nodes: Node[],
  container: HTMLElement | null,
): void {
  const clamped = clampCanvasViewport(viewport);

  const apply = () => {
    instance.setViewport(clamped, { duration: 0 });
    requestAnimationFrame(() => {
      const w = container?.clientWidth ?? 0;
      const h = container?.clientHeight ?? 0;
      if (!viewportShowsAnyNode(instance, nodes, w, h)) {
        const bounds = getNodesBounds(nodes);
        if (bounds.width > 0 || bounds.height > 0) {
          instance.fitView({ padding: 0.22, duration: 200, maxZoom: 1.1 });
        }
      }
    });
  };

  requestAnimationFrame(() => requestAnimationFrame(apply));
}

export function fitCanvasToFlow(instance: ReactFlowInstance): void {
  instance.fitView({ padding: 0.22, duration: 200, maxZoom: 1.1 });
}
