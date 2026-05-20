import type { Edge, Node } from '@xyflow/react';

/** Fields never stored in undo/redo snapshots (runtime callbacks / UI). */
const STRIP_NODE_KEYS = new Set([
  'functions', 'onLogEntry', 'onUpdate', 'onDelete', '__rf', 'measured',
  'availablePlugs', 'availableFlos',
  'actionIds', 'allowedConnectionIds', 'templateActionId', 'defaultConnectionId',
  'floActionName', 'connectorId', 'flaLabel',
  '_loading', '_isError', '_result', '_placeholders',
]);

export interface CanvasSnapshot {
  nodes: Node[];
  edges: Edge[];
}

function stripNodeData(data: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    if (STRIP_NODE_KEYS.has(k)) continue;
    if (typeof v === 'function') continue;
    if (v === undefined) continue;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      try { JSON.stringify(v); clean[k] = v; } catch { /* skip cyclic */ }
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

export function stripNodeForSnapshot(node: Node): Node {
  return {
    id:       node.id,
    type:     node.type ?? 'default',
    position: { ...node.position },
    data:     stripNodeData(node.data as Record<string, unknown>),
    ...(node.width  != null ? { width:  node.width }  : {}),
    ...(node.height != null ? { height: node.height } : {}),
  };
}

export function stripEdgeForSnapshot(edge: Edge): Edge {
  return {
    id:           edge.id,
    source:       edge.source,
    target:       edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    type:         edge.type ?? 'deletable',
    animated:     edge.animated ?? true,
    reconnectable: edge.reconnectable ?? true,
    style:        edge.style ?? { stroke: '#4f8ef7', strokeWidth: 1.5 },
  };
}

export function snapshotCanvas(nodes: Node[], edges: Edge[]): CanvasSnapshot {
  return {
    nodes: nodes.map(stripNodeForSnapshot),
    edges: edges.map(stripEdgeForSnapshot),
  };
}

export function cloneSnapshot(snap: CanvasSnapshot): CanvasSnapshot {
  return JSON.parse(JSON.stringify(snap)) as CanvasSnapshot;
}
