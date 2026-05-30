const STORAGE_KEY = 'floplug.exprFnUsage';

const DEFAULT_FREQUENT = ['concat', 'upper', 'exists', 'iif', 'format', 'length'];

function readCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeCounts(counts: Record<string, number>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
  } catch { /* ignore quota */ }
}

/** Bump usage when user inserts a function (library or context menu). */
export function recordFloExprFnUsage(fnName: string): void {
  const counts = readCounts();
  counts[fnName] = (counts[fnName] ?? 0) + 1;
  writeCounts(counts);
}

/** Top function names for this browser user (falls back to defaults). */
export function getFrequentFloExprFnNames(limit = 8): string[] {
  const counts = readCounts();
  const ranked = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  if (ranked.length === 0) return DEFAULT_FREQUENT.slice(0, limit);
  const merged = [...ranked];
  for (const d of DEFAULT_FREQUENT) {
    if (!merged.includes(d)) merged.push(d);
  }
  return merged.slice(0, limit);
}
