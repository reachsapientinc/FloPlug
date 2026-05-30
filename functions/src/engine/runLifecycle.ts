/**
 * Run lifecycle — kill, fatal (platform) vs error (application), orphan reconciliation.
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  HUB_COLLECTIONS,
  type ExecutionRunStatus,
  failureCategoryForStatus,
  resolveStatusFromLog,
  logLineForUncaughtError,
} from '@floplug/shared';

const db = getFirestore();

export class RunKilledError extends Error {
  constructor(message = 'Run cancelled by user') {
    super(message);
    this.name = 'RunKilledError';
  }
}

export class RunFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunFatalError';
  }
}

function execLogPath(hubId: string, tenantId: string, runId: string): string {
  return `${COLLECTIONS.HUBS}/${hubId}/${HUB_COLLECTIONS.TENANTS}/${tenantId}/${HUB_COLLECTIONS.EXEC_LOG}/${runId}`;
}

export async function isRunKillRequested(
  hubId: string,
  tenantId: string,
  runId: string,
): Promise<boolean> {
  const snap = await db.doc(execLogPath(hubId, tenantId, runId)).get();
  if (!snap.exists) return false;
  const data = snap.data() ?? {};
  if (data.status === 'killed') return true;
  return data.killRequested === true;
}

/** Lightweight heartbeat so orphan reconciliation can detect dead workers. */
export async function touchRunHeartbeat(
  hubId: string,
  tenantId: string,
  runId: string,
): Promise<void> {
  try {
    await db.doc(execLogPath(hubId, tenantId, runId)).update({
      lastHeartbeatAt: FieldValue.serverTimestamp(),
      updatedAt:       FieldValue.serverTimestamp(),
    });
  } catch {
    /* run doc may not exist yet */
  }
}

export interface FinalizeRunInput {
  hubId:         string;
  tenantId:      string;
  runId:         string;
  log:           string[];
  output:        unknown;
  killed?:       boolean;
  forcedFatal?:  boolean;
  errorMessage?: string;
}

/** Persist terminal run state; never downgrade `killed` set by user. */
export async function finalizeRunRecord(input: FinalizeRunInput): Promise<ExecutionRunStatus> {
  const runRef = db.doc(execLogPath(input.hubId, input.tenantId, input.runId));
  const snap   = await runRef.get();
  const existing = snap.data() ?? {};

  let killed = input.killed === true;
  if (!killed) {
    killed = existing.status === 'killed' || existing.killRequested === true;
  }

  const status = resolveStatusFromLog(input.log, {
    killed,
    forcedFatal: input.forcedFatal,
  });

  const errorMessage = status === 'killed'
    ? (typeof existing.errorMessage === 'string' ? existing.errorMessage : 'Run cancelled by user')
    : input.errorMessage;

  const failureCategory = failureCategoryForStatus(status);

  const patch: Record<string, unknown> = {
    log:         input.log,
    output:      input.output,
    updatedAt:   FieldValue.serverTimestamp(),
    completedAt: FieldValue.serverTimestamp(),
  };

  if (existing.status !== 'killed') {
    patch.status = status;
    if (errorMessage) patch.errorMessage = errorMessage;
    if (failureCategory) patch.failureCategory = failureCategory;
    if (killed) patch.killRequested = true;
  } else if (!existing.completedAt) {
    patch.completedAt = FieldValue.serverTimestamp();
  }

  await runRef.update(patch);
  return existing.status === 'killed' ? 'killed' : status;
}

/**
 * Safety net: if the worker is still alive but status was never finalized, persist terminal state.
 * Does not help when the process is OOM-killed (use reconcileStaleRuns).
 */
export async function ensureRunFinalizedIfStillRunning(
  input: FinalizeRunInput,
): Promise<void> {
  const runRef = db.doc(execLogPath(input.hubId, input.tenantId, input.runId));
  const snap   = await runRef.get();
  if (!snap.exists) return;
  if (snap.data()?.status !== 'running') return;
  await finalizeRunRecord(input);
}

export { logLineForUncaughtError };

export interface KillRunInput {
  hubId:    string;
  tenantId: string;
  runId:    string;
  killedByUid?: string | null;
}

export async function killRunRecord(input: KillRunInput): Promise<{
  ok: boolean;
  status: string;
  alreadyTerminal?: boolean;
}> {
  const runRef = db.doc(execLogPath(input.hubId, input.tenantId, input.runId));
  const snap   = await runRef.get();
  if (!snap.exists) {
    throw new Error(`Run ${input.runId} not found`);
  }

  const data   = snap.data() ?? {};
  const status = String(data.status ?? 'unknown');

  if (status === 'killed') {
    return { ok: true, status: 'killed', alreadyTerminal: true };
  }
  if (status !== 'running') {
    return { ok: true, status, alreadyTerminal: true };
  }

  const killLine = 'Run killed by user (cancel requested)';
  const existingLog = Array.isArray(data.log) ? (data.log as string[]) : [];
  const log = existingLog.includes(killLine) ? existingLog : [...existingLog, killLine];

  await runRef.update({
    killRequested:    true,
    killRequestedAt:  FieldValue.serverTimestamp(),
    killedByUid:      input.killedByUid ?? null,
    status:           'killed',
    failureCategory:  'user_cancel',
    errorMessage:     'Run cancelled by user',
    log,
    completedAt:      FieldValue.serverTimestamp(),
    updatedAt:        FieldValue.serverTimestamp(),
  });

  return { ok: true, status: 'killed' };
}

const ORPHAN_FATAL_MESSAGE =
  'Worker terminated before the run could finalize (likely Firebase memory/CPU limit or function timeout). ' +
  'Cloud Functions does not resume this flow on a new instance — start a new run.';

function tsToMs(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === 'string') {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v === 'object' && v !== null && 'toDate' in v) {
    try {
      return (v as { toDate: () => Date }).toDate().getTime();
    } catch {
      return null;
    }
  }
  return null;
}

export interface ReconcileStaleRunsInput {
  hubId:           string;
  tenantId:        string;
  runId?:          string;
  maxAgeMinutes?:  number;
  heartbeatMinutes?: number;
}

/** Mark orphaned `running` rows as `fatal` (OOM/crash — never reached finalize). */
export async function reconcileStaleRuns(
  input: ReconcileStaleRunsInput,
): Promise<{ reconciled: string[]; skipped: string[] }> {
  const maxAgeMs = (input.maxAgeMinutes ?? 20) * 60_000;
  const heartbeatStaleMs = (input.heartbeatMinutes ?? 10) * 60_000;
  const now = Date.now();
  const reconciled: string[] = [];
  const skipped: string[] = [];

  const col = db.collection(
    `${COLLECTIONS.HUBS}/${input.hubId}/${HUB_COLLECTIONS.TENANTS}/${input.tenantId}/${HUB_COLLECTIONS.EXEC_LOG}`,
  );

  const docs = input.runId
    ? [await col.doc(input.runId).get()].filter(s => s.exists)
    : (await col.where('status', '==', 'running').get()).docs;

  for (const doc of docs) {
    const data = doc.data() ?? {};
    if (data.status !== 'running') {
      skipped.push(doc.id);
      continue;
    }

    const startedMs = tsToMs(data.startedAt ?? data.timestamp);
    const heartbeatMs = tsToMs(data.lastHeartbeatAt);
    const ageMs = startedMs != null ? now - startedMs : null;
    const heartbeatAgeMs = heartbeatMs != null ? now - heartbeatMs : null;

    const staleByAge = ageMs != null && ageMs > maxAgeMs;
    const staleByHeartbeat = heartbeatMs != null && heartbeatAgeMs != null && heartbeatAgeMs > heartbeatStaleMs;
    const staleNoHeartbeat = heartbeatMs == null && ageMs != null && ageMs > maxAgeMs;

    if (!input.runId && !staleByAge && !staleByHeartbeat && !staleNoHeartbeat) {
      skipped.push(doc.id);
      continue;
    }

    const line = `Platform error: ${ORPHAN_FATAL_MESSAGE}`;
    const existingLog = Array.isArray(data.log) ? (data.log as string[]) : [];
    const log = existingLog.includes(line) ? existingLog : [...existingLog, line];

    await doc.ref.update({
      status:          'fatal',
      failureCategory: 'platform',
      errorMessage:    ORPHAN_FATAL_MESSAGE,
      log,
      completedAt:     FieldValue.serverTimestamp(),
      updatedAt:       FieldValue.serverTimestamp(),
    });
    reconciled.push(doc.id);
  }

  return { reconciled, skipped };
}
