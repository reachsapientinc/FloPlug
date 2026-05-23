export function formatDuration(ms?: number): string {
  if (ms == null || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
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

export type RunStatusKind = 'running' | 'success' | 'error' | 'unknown';

export function normalizeRunStatus(status?: string): RunStatusKind {
  const s = (status ?? '').toLowerCase();
  if (s === 'running' || s === 'in_progress') return 'running';
  if (s === 'success' || s === 'ok' || s === 'completed') return 'success';
  if (s === 'error' || s === 'failed' || s === 'failure') return 'error';
  return 'unknown';
}

export function statusLabel(status?: string): string {
  const k = normalizeRunStatus(status);
  if (k === 'running') return 'Running';
  if (k === 'success') return 'Success';
  if (k === 'error') return 'Error';
  return status ?? 'Unknown';
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
