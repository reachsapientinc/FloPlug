import type { FloExecutionRunSummary } from '@floplug/shared';
import { sortRunsByStartedDesc } from '@floplug/shared';
import { mapTriggerType, normalizeRunStatus, type RunStatusKind } from './formatters';

export type PulseStatusTab = 'all' | RunStatusKind;
export type PulseDatePreset = 'today' | '7d' | '30d' | 'custom' | '';
export type PulseTriggerFilter = 'all' | 'webhook' | 'scheduled' | 'manual';

export interface PulseFilterState {
  statusTab: PulseStatusTab;
  datePreset: PulseDatePreset;
  dateFrom: string;
  dateTo: string;
  triggerFilter: PulseTriggerFilter;
  searchQuery: string;
  floIds: string[];
  statuses: RunStatusKind[];
  triggers: PulseTriggerFilter[];
  page: number;
  pageSize: number;
}

export const DEFAULT_PULSE_FILTERS: PulseFilterState = {
  statusTab: 'all',
  datePreset: '7d',
  dateFrom: '',
  dateTo: '',
  triggerFilter: 'all',
  searchQuery: '',
  floIds: [],
  statuses: [],
  triggers: [],
  page: 1,
  pageSize: 10,
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function resolveDateRange(filters: PulseFilterState): { from: number | null; to: number | null } {
  const now = new Date();
  if (filters.datePreset === 'today') {
    return { from: startOfDay(now).getTime(), to: endOfDay(now).getTime() };
  }
  if (filters.datePreset === '7d') {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { from: startOfDay(from).getTime(), to: endOfDay(now).getTime() };
  }
  if (filters.datePreset === '30d') {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return { from: startOfDay(from).getTime(), to: endOfDay(now).getTime() };
  }
  if (filters.datePreset === 'custom' || filters.dateFrom || filters.dateTo) {
    let from: number | null = null;
    let to: number | null = null;
    if (filters.dateFrom) {
      const t = new Date(filters.dateFrom).getTime();
      if (!Number.isNaN(t)) from = t;
    }
    if (filters.dateTo) {
      const t = new Date(filters.dateTo).getTime();
      if (!Number.isNaN(t)) to = t;
    }
    return { from, to };
  }
  return { from: null, to: null };
}

function matchesStatusTab(run: FloExecutionRunSummary, tab: PulseStatusTab): boolean {
  if (tab === 'all') return true;
  return normalizeRunStatus(run.status) === tab;
}

function matchesTrigger(run: FloExecutionRunSummary, trigger: PulseTriggerFilter): boolean {
  if (trigger === 'all') return true;
  return mapTriggerType(run.source) === trigger;
}

export function filterPulseRuns(
  runs: FloExecutionRunSummary[],
  filters: PulseFilterState,
  floFilter: string | null,
): FloExecutionRunSummary[] {
  let out = runs.filter(r => Boolean(r.floId?.trim()));

  if (floFilter) {
    out = out.filter(r => r.floId === floFilter);
  }

  out = out.filter(r => matchesStatusTab(r, filters.statusTab));

  const { from, to } = resolveDateRange(filters);
  if (from != null) {
    out = out.filter(r => r.startedAt && new Date(r.startedAt).getTime() >= from);
  }
  if (to != null) {
    out = out.filter(r => r.startedAt && new Date(r.startedAt).getTime() <= to);
  }

  if (filters.triggerFilter !== 'all') {
    out = out.filter(r => matchesTrigger(r, filters.triggerFilter));
  }

  if (filters.triggers.length > 0) {
    out = out.filter(r => filters.triggers.includes(mapTriggerType(r.source)));
  }

  if (filters.statuses.length > 0) {
    out = out.filter(r => filters.statuses.includes(normalizeRunStatus(r.status)));
  }

  if (filters.floIds.length > 0) {
    out = out.filter(r => filters.floIds.includes(r.floId));
  }

  const q = filters.searchQuery.trim().toLowerCase();
  if (q) {
    out = out.filter(r =>
      r.runId.toLowerCase().includes(q) ||
      r.floId.toLowerCase().includes(q) ||
      (r.floName ?? '').toLowerCase().includes(q) ||
      (r.runLabel ?? '').toLowerCase().includes(q),
    );
  }

  return sortRunsByStartedDesc(out);
}

export function paginateRuns<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function countByStatus(runs: FloExecutionRunSummary[]): Record<RunStatusKind | 'all', number> {
  const counts = { all: runs.length, running: 0, success: 0, warning: 0, error: 0, killed: 0, fatal: 0, unknown: 0 };
  for (const r of runs) {
    counts[normalizeRunStatus(r.status)] += 1;
  }
  return counts;
}
