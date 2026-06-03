import type { FloExecutionNodeRecord } from '@floplug/shared';

export type HubNodeExecStatus =
  | 'ok'
  | 'error'
  | 'skipped'
  | 'pending'
  | 'running';

export interface HubNodeExecInfo {
  status:     HubNodeExecStatus;
  error?:     string;
  logLine?:   string;
  durationMs?: number;
  /** Number of error events this node caught as a catcher. */
  caughtCount?: number;
  /** Indicates this node acted as the flo-level/global catcher. */
  isGlobalCatcher?: boolean;
}

/** Merge Firestore node records + execution log into per-canvas-node status. */
export function buildNodeExecutionMap(
  canvasNodeIds: string[],
  records:       FloExecutionNodeRecord[],
  log:           string[] = [],
): Record<string, HubNodeExecInfo> {
  const map: Record<string, HubNodeExecInfo> = {};
  for (const id of canvasNodeIds) {
    map[id] = { status: 'pending' };
  }

  for (const r of records) {
    map[r.nodeId] = {
      status:     r.status === 'error' ? 'error' : 'ok',
      error:      r.error,
      logLine:    r.logLine,
      durationMs: r.durationMs,
    };
  }

  let pendingNodeId: string | null = null;
  for (const line of log) {
    const enter = line.match(/↳\s+\S+\s+\(([^)]+)\)/);
    if (enter) {
      pendingNodeId = enter[1].trim();
    }

    const err = line.match(/Error in ([^:]+):/);
    if (err) {
      const nodeId = err[1].trim();
      const msg = line.match(/Error in [^:]+:\s*(.+)/)?.[1]?.trim();
      map[nodeId] = {
        ...map[nodeId],
        status: 'error',
        error:  msg ?? map[nodeId]?.error,
      };
      pendingNodeId = null;
    }

    if (line.includes('path terminated') && pendingNodeId) {
      if (!map[pendingNodeId] || map[pendingNodeId].status === 'pending') {
        map[pendingNodeId] = { status: 'skipped', logLine: 'Path terminated upstream' };
      }
      pendingNodeId = null;
    }

    const caught = line.match(/Error caught at ([^\s]+)\s+→\s+error path/);
    if (caught) {
      const catcherId = caught[1].trim();
      const prev = map[catcherId] ?? { status: 'pending' as const };
      map[catcherId] = {
        ...prev,
        caughtCount: (prev.caughtCount ?? 0) + 1,
        isGlobalCatcher: catcherId === 'start-node' || prev.isGlobalCatcher === true,
        logLine: catcherId === 'start-node'
          ? 'Flo Error Handler (Global Catch)'
          : (prev.logLine ?? 'Caught propagated error'),
      };
    }
  }

  return map;
}
