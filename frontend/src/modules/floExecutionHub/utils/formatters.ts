export function formatDuration(ms?: number): string {
  if (ms == null || ms < 0) return '0ms';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

/** Duration with fixed decimal places (Pulse KPIs). */
export function formatDurationFixed(ms?: number, decimals = 2): string {
  if (ms == null || ms < 0) return `0.${'0'.repeat(decimals)}s`;
  if (ms < 1000) return `${ms.toFixed(decimals)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(decimals)}s`;
  const minutes = ms / 60_000;
  if (minutes < 60) return `${minutes.toFixed(decimals)}m`;
  const hours = minutes / 60;
  return `${hours.toFixed(decimals)}h`;
}

export function formatTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${date} ${time}`;
  } catch {
    return iso;
  }
}

export function formatRunStartTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatRunStartDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return iso;
  }
}

export type RunStatusKind = 'running' | 'success' | 'warning' | 'error' | 'killed' | 'fatal' | 'unknown';

export function normalizeRunStatus(status?: string): RunStatusKind {
  const s = (status ?? '').toLowerCase();
  if (s === 'running' || s === 'in_progress') return 'running';
  if (s === 'success' || s === 'ok' || s === 'completed') return 'success';
  if (s === 'warning' || s === 'partial' || s === 'partial_failure') return 'warning';
  if (s === 'killed' || s === 'cancelled' || s === 'canceled') return 'killed';
  if (s === 'fatal' || s === 'core_error' || s === 'platform') return 'fatal';
  if (s === 'error' || s === 'failed' || s === 'failure') return 'error';
  if (s === 'queued' || s === 'pending' || s === 'waiting') return 'unknown';
  return 'unknown';
}

/** Run may be orphaned (function OOM/timeout) while Firestore still says running. */
export function isStaleRunningRun(
  status?: string,
  startedAt?: string,
  staleMinutes = 15,
): boolean {
  if (normalizeRunStatus(status) !== 'running' || !startedAt) return false;
  try {
    const ageMs = Date.now() - new Date(startedAt).getTime();
    return ageMs > staleMinutes * 60_000;
  } catch {
    return false;
  }
}

export function statusLabel(status?: string): string {
  const k = normalizeRunStatus(status);
  if (k === 'running') return 'Running';
  if (k === 'success') return 'Success';
  if (k === 'warning') return 'Warning';
  if (k === 'killed') return 'Killed';
  if (k === 'fatal') return 'Fatal';
  if (k === 'error') return 'Failed';
  if (k === 'unknown') return 'Queued';
  return status ?? 'Unknown';
}

export type TriggerKind = 'webhook' | 'scheduled' | 'manual';

export function mapTriggerType(source?: string): TriggerKind {
  const s = (source ?? '').toLowerCase();
  if (s.includes('webhook')) return 'webhook';
  if (s.includes('sched') || s.includes('cron') || s.includes('production')) return 'scheduled';
  return 'manual';
}

export function triggerLabel(source?: string): string {
  const k = mapTriggerType(source);
  if (k === 'webhook') return 'Webhook';
  if (k === 'scheduled') return 'Scheduled';
  return 'Manual';
}

export function truncateId(id: string, len = 8): string {
  if (id.length <= len) return id;
  return `${id.slice(0, len)}…`;
}

export function jsonPreview(obj: unknown, max = 1200): string {
  try {
    const s = JSON.stringify(obj, null, 2);
    return s.length > max ? `${s.slice(0, max)}\n…` : s;
  } catch {
    return String(obj);
  }
}

export function formatNumber(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function formatPercent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}
