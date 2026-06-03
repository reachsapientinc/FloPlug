/**
 * Error catch resolution + backward propagation along the executed success path.
 */

import { NODE_TYPES } from '../constants/constants.js';
import {
  ERROR_HANDLE,
  type CatchErrorScope,
  type ErrorPathDataSource,
  type FloErrorDefaults,
  type FloException,
  type ExecutionPathState,
} from '../types/errorHandling.js';
import { nodeLabel } from '../validation/bindings.js';

export interface ErrorGraphNode {
  id:   string;
  type: string;
  data: Record<string, unknown>;
}

export interface ErrorGraphEdge {
  source:       string;
  target:       string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

const CATCHING_SCOPES = new Set<CatchErrorScope>(['self', 'subtree']);

export function effectiveCatchScope(
  node: ErrorGraphNode,
  defaults: FloErrorDefaults | undefined,
): CatchErrorScope {
  const raw = (node.data.catchErrorScope as CatchErrorScope | undefined) ?? 'inherit';
  if (raw !== 'inherit') return raw;
  return defaults?.catchScope ?? 'none';
}

export function effectiveErrorDataSource(
  node: ErrorGraphNode,
  defaults: FloErrorDefaults | undefined,
): ErrorPathDataSource {
  const raw = (node.data.errorDataSource as ErrorPathDataSource | undefined) ?? 'inherit';
  if (raw !== 'inherit') return raw;
  return defaults?.errorDataSource ?? 'cStreamAtError';
}

export function catchScopeEnabled(scope: CatchErrorScope): boolean {
  return scope === 'self' || scope === 'subtree';
}

export function showErrorHandleOnCanvas(
  nodeData: Record<string, unknown>,
  defaults?: FloErrorDefaults,
): boolean {
  return catchScopeEnabled(effectiveCatchScope(
    { id: '', type: '', data: nodeData },
    defaults,
  ));
}

/** Walk parent chain from node up — true if ancestorId is on the path. */
export function isOnExecutedPath(
  ancestorId: string,
  nodeId: string,
  parentOnPath: Record<string, string | null>,
): boolean {
  let current: string | null = nodeId;
  while (current) {
    if (current === ancestorId) return true;
    current = parentOnPath[current] ?? null;
  }
  return false;
}

/**
 * Nearest catcher walking backward from raised node along executed path.
 * First match wins (innermost compartment / downstream catcher first).
 */
export function findNearestCatcher(
  raisedNodeId: string,
  nodes: ErrorGraphNode[],
  parentOnPath: Record<string, string | null>,
  defaults: FloErrorDefaults | undefined,
): ErrorGraphNode | undefined {
  const byId = new Map(nodes.map(n => [n.id, n]));
  let current: string | null = raisedNodeId;

  while (current) {
    const node = byId.get(current);
    if (node) {
      const scope = effectiveCatchScope(node, defaults);
      if (scope === 'self' && current === raisedNodeId) return node;
      if (scope === 'subtree' && isOnExecutedPath(current, raisedNodeId, parentOnPath)) {
        return node;
      }
    }
    current = parentOnPath[current] ?? null;
  }

  return undefined;
}

export function findErrorPathEdge(
  catcherId: string,
  edges: ErrorGraphEdge[],
): ErrorGraphEdge | undefined {
  return edges.find(
    e => e.source === catcherId && (e.sourceHandle ?? '') === ERROR_HANDLE,
  );
}

/** Forward reachability from a node (error-path subgraph). */
export function collectForwardReachable(
  startId: string,
  edges: ErrorGraphEdge[],
): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const seen = new Set<string>();
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const nxt of adj.get(id) ?? []) {
      if (!seen.has(nxt)) queue.push(nxt);
    }
  }
  return seen;
}

export function buildFloException(
  err: unknown,
  node: ErrorGraphNode,
  cStreamAtError: unknown,
  httpTrace?: Record<string, unknown>,
): FloException {
  const message = err instanceof Error ? err.message : String(err);
  let statusCode: number | undefined;
  if (httpTrace && typeof httpTrace.status === 'number') {
    statusCode = httpTrace.status;
  }
  return {
    statusCode,
    message,
    nodeId: node.id,
    nodeCanvasName: nodeLabel(node.data, node.id),
    nodeType: node.type,
    cStream: cStreamAtError,
    dateTime: new Date().toISOString(),
    httpTrace,
  };
}

export function resolveErrorPathCStream(
  catcher: ErrorGraphNode,
  exception: FloException,
  pathState: ExecutionPathState,
  store: { local: Record<string, unknown>; global: Record<string, unknown> },
  defaults: FloErrorDefaults | undefined,
): unknown {
  const source = effectiveErrorDataSource(catcher, defaults);
  switch (source) {
    case 'cStreamAtCatcher':
      return pathState.cStreamAtNode[catcher.id] ?? exception.cStream;
    case 'cStreamAtError':
      return exception.cStream;
    case 'local': {
      const ref = String(catcher.data.errorDataRef ?? defaults?.errorDataRef ?? '').trim();
      if (ref && store.local[ref] !== undefined) return store.local[ref];
      return exception.cStream;
    }
    case 'global': {
      const ref = String(catcher.data.errorDataRef ?? defaults?.errorDataRef ?? '').trim();
      if (ref && store.global[ref] !== undefined) return store.global[ref];
      return exception.cStream;
    }
    default:
      return exception.cStream;
  }
}

export function getStartErrorDefaults(nodes: ErrorGraphNode[]): FloErrorDefaults | undefined {
  const start = nodes.find(n => n.type === NODE_TYPES.START);
  if (!start) return undefined;
  return (start.data.floErrorDefaults as FloErrorDefaults | undefined);
}

export { ERROR_HANDLE };
