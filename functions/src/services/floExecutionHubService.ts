/**
 * FloExecution Hub — persist per-node execution JSON and validation snapshots.
 *
 * Dual-write model:
 *  - Firebase Storage: full untruncated JSON per node (downloadable)
 *  - Firestore FloNodeRecords: slim index + previews + storagePath pointer
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  HUB_COLLECTIONS,
  executionRunStorageRoot,
  type PersistNodeExecutionInput,
  type PersistValidationEventInput,
  type FloAlertDoc,
  summarizeValidation,
  omitUndefinedFields,
} from '@floplug/shared';
import {
  appendRunManifestEntry,
  slimHttpTraceForIndex,
  writeNodeExecutionToStorage,
} from './executionHubStorageService.js';

const db = getFirestore();

function tenantPath(hubId: string, tenantId: string): string {
  return `${COLLECTIONS.HUBS}/${hubId}/${HUB_COLLECTIONS.TENANTS}/${tenantId}`;
}

function execRunRef(hubId: string, tenantId: string, runId: string) {
  return db.doc(`${tenantPath(hubId, tenantId)}/${HUB_COLLECTIONS.EXEC_LOG}/${runId}`);
}

function nodeRecordRef(hubId: string, tenantId: string, runId: string, nodeId: string) {
  return execRunRef(hubId, tenantId, runId)
    .collection(HUB_COLLECTIONS.EXEC_NODE_RECORDS)
    .doc(nodeId);
}

function floValidationRef(hubId: string, tenantId: string, floId: string) {
  return db.doc(`${tenantPath(hubId, tenantId)}/${HUB_COLLECTIONS.FLO_VALIDATION}/${floId}`);
}

function floAlertsCol(hubId: string, tenantId: string) {
  return db.collection(`${tenantPath(hubId, tenantId)}/${HUB_COLLECTIONS.FLO_ALERTS}`);
}

/** Redact large payloads for Firestore index preview (Storage has full copy). */
export function summarizeForHubRecord(
  value: unknown,
  maxLen = 4000,
): Record<string, unknown> | undefined {
  if (value === null || value === undefined) return undefined;
  try {
    const json = JSON.stringify(value);
    if (json.length <= maxLen) {
      return typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : { value };
    }
    return { _truncated: true, preview: json.slice(0, maxLen), _fullInStorage: true };
  } catch {
    return { _summary: String(value).slice(0, 500) };
  }
}

/**
 * Persist node execution: full JSON → Storage, slim index → Firestore.
 */
export async function persistNodeExecutionRecord(
  input: PersistNodeExecutionInput,
): Promise<void> {
  const now = new Date().toISOString();

  const { storagePath, bucket } = await writeNodeExecutionToStorage(input);

  await appendRunManifestEntry(input.hubId, input.tenantId, input.runId, input.floId, {
    nodeId:      input.nodeId,
    nodeType:    input.nodeType,
    nodeLabel:   input.nodeLabel,
    status:      input.status,
    storagePath,
  });

  const doc = omitUndefinedFields({
    runId:       input.runId,
    floId:       input.floId,
    nodeId:      input.nodeId,
    nodeType:    input.nodeType,
    nodeLabel:   input.nodeLabel,
    status:      input.status,
    completedAt: now,
    durationMs:  input.durationMs,
    logLine:     input.logLine,
    error:       input.error,
    before:      summarizeForHubRecord(input.before, 2000),
    after:       summarizeForHubRecord(input.after, 2000),
    httpTrace:   slimHttpTraceForIndex(input.httpTrace),
    storagePath,
    storageBucket: bucket,
    hasFullPayload: true,
  });

  await nodeRecordRef(input.hubId, input.tenantId, input.runId, input.nodeId).set({
    ...doc,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await execRunRef(input.hubId, input.tenantId, input.runId).set({
    storageRoot: executionRunStorageRoot(input.hubId, input.tenantId, input.runId),
    hasStoragePayload: true,
  }, { merge: true });
}

export async function persistValidationEvent(
  input: PersistValidationEventInput,
): Promise<void> {
  const { report, publishState, validationStatus, trigger } = input;
  const summary = summarizeValidation(report);

  await floValidationRef(input.hubId, input.tenantId, input.floId).set({
    floId:            input.floId,
    floName:          input.floName ?? '',
    workspaceId:      input.workspaceId,
    report,
    nodeSnapshots:    report.nodeSnapshots,
    publishState,
    validationStatus,
    trigger,
    errorCount:       summary.errorCount,
    warningCount:     summary.warningCount,
    validatedAt:      report.validatedAt,
    updatedAt:        FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function upsertFloInvalidAlert(params: {
  hubId:       string;
  tenantId:    string;
  workspaceId: string;
  floId:       string;
  floName:     string;
  report:      PersistValidationEventInput['report'];
}): Promise<string> {
  const { errorCount, warningCount } = summarizeValidation(params.report);
  const topIssues = params.report.errors.slice(0, 8).map(e => ({
    nodeId:  e.nodeId,
    message: e.message,
    code:    e.code,
  }));

  const alertId = `invalid-${params.floId}`;
  await floAlertsCol(params.hubId, params.tenantId).doc(alertId).set({
    hubId:       params.hubId,
    tenantId:    params.tenantId,
    workspaceId: params.workspaceId,
    floId:       params.floId,
    floName:     params.floName,
    type:        'FLO_INVALIDATED',
    severity:    errorCount > 0 ? 'critical' : 'warning',
    title:       `Flo "${params.floName}" validation failed`,
    message:     `${errorCount} error(s), ${warningCount} warning(s)`,
    errorCount,
    warningCount,
    issues:      topIssues,
    acknowledged: false,
    updatedAt:   FieldValue.serverTimestamp(),
  }, { merge: true });

  return alertId;
}

export async function resolveFloInvalidAlert(
  hubId: string,
  tenantId: string,
  floId: string,
): Promise<void> {
  const alertId = `invalid-${floId}`;
  await floAlertsCol(hubId, tenantId).doc(alertId).set({
    acknowledged: true,
    resolvedAt:   FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function resolveFloAlert(params: {
  hubId: string; tenantId: string; alertId: string;
}): Promise<void> {
  await floAlertsCol(params.hubId, params.tenantId).doc(params.alertId).set({
    acknowledged: true,
    resolvedAt:   FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function listFloAlerts(
  hubId: string,
  tenantId: string,
  includeResolved = false,
  limit = 50,
): Promise<FloAlertDoc[]> {
  const snap = await floAlertsCol(hubId, tenantId)
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as FloAlertDoc));
  if (includeResolved) return docs;
  return docs.filter(a => !a.acknowledged && !a.resolvedAt);
}
