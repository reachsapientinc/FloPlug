/**
 * Classify run failures: application `error` vs platform `fatal` vs user `killed`.
 */

import type { ExecutionRunStatus } from '../types/floExecutionHub.js';

export type RunFailureCategory = 'application' | 'platform' | 'user_cancel';

const PLATFORM_PATTERNS = [
  /memory limit/i,
  /mib exceeded/i,
  /deadline exceeded/i,
  /deadline-exceeded/i,
  /resource-exhausted/i,
  /function execution took too long/i,
  /server shut down/i,
  /process exited/i,
  /cpu time/i,
  /out of memory/i,
  /^internal$/i,
  /the server responded with an error/i,
  /worker terminated/i,
  /orphaned/i,
];

/** True when the message looks like Firebase / Cloud Functions infrastructure, not app logic. */
export function isPlatformFailureMessage(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  return PLATFORM_PATTERNS.some(rx => rx.test(m));
}

export function classifyUncaughtError(err: unknown): 'fatal' | 'error' {
  const message = err instanceof Error ? err.message : String(err);
  if (isPlatformFailureMessage(message)) return 'fatal';

  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: unknown }).code).toLowerCase();
    if (
      code === 'resource-exhausted' ||
      code === 'deadline-exceeded' ||
      code === 'unavailable' ||
      code === 'internal' ||
      code === 'aborted'
    ) {
      return 'fatal';
    }
  }
  return 'error';
}

export function logLineForUncaughtError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const kind = classifyUncaughtError(err);
  if (kind === 'fatal') {
    return `Platform error: ${message}`;
  }
  return `Unhandled error: ${message}`;
}

export function resolveStatusFromLog(
  log: string[],
  options: { killed?: boolean; forcedFatal?: boolean },
): ExecutionRunStatus {
  if (options.killed) return 'killed';
  if (options.forcedFatal) return 'fatal';
  if (log.some(l => l.includes('Platform error:') || l.includes('Worker terminated'))) {
    return 'fatal';
  }
  if (log.some(l => l.includes('Error in') || l.includes('Unhandled error:'))) {
    return 'error';
  }
  return 'success';
}

export function failureCategoryForStatus(status: ExecutionRunStatus): RunFailureCategory | undefined {
  if (status === 'killed') return 'user_cancel';
  if (status === 'fatal') return 'platform';
  if (status === 'error') return 'application';
  return undefined;
}
