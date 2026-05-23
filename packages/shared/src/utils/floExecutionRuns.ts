/**
 * Flo execution run list helpers — version labels and sort order.
 */

import type { FloExecutionRunSummary } from '../types/floExecutionHub.js';

export type ExecutedGraphKind = 'draft' | 'published';

/** Human-readable version label for hub UI */
export function formatFloRunVersion(
  floVersion?: number,
  executedGraph?: ExecutedGraphKind | string,
): string {
  if (executedGraph === 'draft') return 'draft';
  if (typeof floVersion === 'number' && floVersion > 0) return `v${floVersion}`;
  if (floVersion === 0) return 'draft';
  return '—';
}

/** Newest execution first (by startedAt, then runId). */
export function sortRunsByStartedDesc(
  runs: FloExecutionRunSummary[],
): FloExecutionRunSummary[] {
  return [...runs].sort((a, b) => {
    const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0;
    const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return b.runId.localeCompare(a.runId);
  });
}

/** Unique version keys present in runs (for filter dropdown). */
export function collectRunVersionOptions(
  runs: FloExecutionRunSummary[],
): { value: string; label: string }[] {
  const keys = new Set<string>();
  for (const r of runs) {
    if (r.executedGraph === 'draft' || r.floVersion === 0) {
      keys.add('draft');
    } else if (typeof r.floVersion === 'number' && r.floVersion > 0) {
      keys.add(String(r.floVersion));
    }
  }
  const numeric = [...keys].filter(k => k !== 'draft').map(Number).sort((a, b) => b - a);
  const out: { value: string; label: string }[] = [{ value: '', label: 'All versions' }];
  for (const n of numeric) {
    out.push({ value: String(n), label: `v${n}` });
  }
  if (keys.has('draft')) {
    out.push({ value: 'draft', label: 'draft (designer)' });
  }
  return out;
}

/** Last fatal or per-node error line from an execution log. */
export function extractRunErrorFromLog(log: string[]): string | undefined {
  for (let i = log.length - 1; i >= 0; i--) {
    const line = log[i];
    if (line.includes('Fatal error:')) {
      const m = line.match(/Fatal error:\s*(.+)/);
      return m?.[1]?.trim() ?? line.trim();
    }
    if (line.includes('Error in ')) {
      const m = line.match(/Error in [^:]+:\s*(.+)/);
      return m?.[1]?.trim() ?? line.trim();
    }
  }
  return undefined;
}

/** Remove undefined fields before writing to Firestore. */
export function omitUndefinedFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}
