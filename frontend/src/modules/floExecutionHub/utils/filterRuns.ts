import type { FloExecutionRunSummary } from '@floplug/shared';
import { sortRunsByStartedDesc } from '@floplug/shared';

export interface ExecutionRunFilters {
  floQuery:      string;
  dateFrom:      string;
  dateTo:        string;
  floRunsOnly:   boolean;
  /** '' = all, 'draft', or published version number as string e.g. '3' */
  versionFilter: string;
}

export const DEFAULT_RUN_FILTERS: ExecutionRunFilters = {
  floQuery:      '',
  dateFrom:      '',
  dateTo:        '',
  floRunsOnly:   true,
  versionFilter: '',
};

function runMatchesVersion(r: FloExecutionRunSummary, versionFilter: string): boolean {
  if (!versionFilter) return true;
  if (versionFilter === 'draft') {
    return r.executedGraph === 'draft' || r.floVersion === 0;
  }
  const want = Number(versionFilter);
  if (Number.isNaN(want)) return true;
  return r.floVersion === want && r.executedGraph !== 'draft';
}

export function filterExecutionRuns(
  runs: FloExecutionRunSummary[],
  filters: ExecutionRunFilters,
): FloExecutionRunSummary[] {
  let out = runs;

  if (filters.floRunsOnly) {
    out = out.filter(r => Boolean(r.floId?.trim()));
  }

  const q = filters.floQuery.trim().toLowerCase();
  if (q) {
    out = out.filter(r =>
      r.floId.toLowerCase().includes(q) ||
      (r.floName ?? '').toLowerCase().includes(q),
    );
  }

  if (filters.versionFilter) {
    out = out.filter(r => runMatchesVersion(r, filters.versionFilter));
  }

  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom).getTime();
    if (!Number.isNaN(from)) {
      out = out.filter(r => {
        if (!r.startedAt) return false;
        return new Date(r.startedAt).getTime() >= from;
      });
    }
  }

  if (filters.dateTo) {
    const to = new Date(`${filters.dateTo}T23:59:59.999`).getTime();
    if (!Number.isNaN(to)) {
      out = out.filter(r => {
        if (!r.startedAt) return false;
        return new Date(r.startedAt).getTime() <= to;
      });
    }
  }

  return sortRunsByStartedDesc(out);
}
