/**
 * Execution Hub — write/read full node JSON in Firebase Storage.
 * Firestore holds a slim index; Storage holds untruncated before/after/httpTrace.
 */

import { getStorage } from 'firebase-admin/storage';
import {
  executionNodeStoragePath,
  executionRunManifestPath,
  executionRunStorageRoot,
  type FloExecutionNodeStorageRecord,
  type PersistNodeExecutionInput,
  type NodeHttpTrace,
} from '@floplug/shared';

const STORAGE_VERSION = 1;

function getBucket() {
  return getStorage().bucket();
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function previewBody(body: string, max = 800): string {
  if (body.length <= max) return body;
  return `${body.slice(0, max)}\n… [${body.length} chars total — see Storage for full body]`;
}

/** Slim httpTrace for Firestore index (previews only). */
export function slimHttpTraceForIndex(trace?: NodeHttpTrace): NodeHttpTrace | undefined {
  if (!trace) return undefined;
  const req = trace.requestBody ?? trace.requestBodyPreview ?? '';
  const res = trace.responseBody ?? trace.responseBodyPreview ?? '';
  return {
    method:               trace.method,
    url:                  trace.url,
    requestHeaders:       trace.requestHeaders,
    requestBodyPreview:   previewBody(req, 800),
    status:               trace.status,
    statusText:           trace.statusText,
    responseBodyPreview:  previewBody(res, 800),
    responseContentType:  trace.responseContentType,
  };
}

export async function writeNodeExecutionToStorage(
  input: PersistNodeExecutionInput,
): Promise<{ storagePath: string; bucket: string }> {
  const storagePath = executionNodeStoragePath(
    input.hubId, input.tenantId, input.runId, input.nodeId,
  );

  const fullRecord: FloExecutionNodeStorageRecord = {
    runId:       input.runId,
    floId:       input.floId,
    nodeId:      input.nodeId,
    nodeType:    input.nodeType,
    nodeLabel:   input.nodeLabel,
    status:      input.status,
    durationMs:  input.durationMs,
    logLine:     input.logLine,
    error:       input.error,
    before:      input.before ? cloneJson(input.before) : undefined,
    after:       input.after ? cloneJson(input.after) : undefined,
    httpTrace:   input.httpTrace ? cloneJson(input.httpTrace) : undefined,
    persistedAt: new Date().toISOString(),
    storageVersion: STORAGE_VERSION,
    storagePath,
    hasFullPayload: true,
  };

  const bucket = getBucket();
  await bucket.file(storagePath).save(JSON.stringify(fullRecord, null, 2), {
    contentType: 'application/json',
    metadata: {
      metadata: {
        hubId:    input.hubId,
        tenantId: input.tenantId,
        runId:    input.runId,
        nodeId:   input.nodeId,
        floId:    input.floId,
      },
    },
  });

  return { storagePath, bucket: bucket.name };
}

export async function readNodeExecutionFromStorage(
  storagePath: string,
): Promise<FloExecutionNodeStorageRecord | null> {
  try {
    const bucket = getBucket();
    const [buf] = await bucket.file(storagePath).download();
    return JSON.parse(buf.toString('utf8')) as FloExecutionNodeStorageRecord;
  } catch {
    return null;
  }
}

export interface RunManifestEntry {
  nodeId:      string;
  nodeType:    string;
  nodeLabel?:  string;
  status:      string;
  storagePath: string;
}

export interface RunManifest {
  runId:       string;
  floId:       string;
  hubId:       string;
  tenantId:    string;
  storageRoot: string;
  updatedAt:   string;
  nodes:       RunManifestEntry[];
}

export async function appendRunManifestEntry(
  hubId: string,
  tenantId: string,
  runId: string,
  floId: string,
  entry: RunManifestEntry,
): Promise<void> {
  const manifestPath = executionRunManifestPath(hubId, tenantId, runId);
  const bucket = getBucket();
  const file = bucket.file(manifestPath);

  let manifest: RunManifest;
  try {
    const [buf] = await file.download();
    manifest = JSON.parse(buf.toString('utf8')) as RunManifest;
  } catch {
    manifest = {
      runId,
      floId,
      hubId,
      tenantId,
      storageRoot: executionRunStorageRoot(hubId, tenantId, runId),
      updatedAt:   new Date().toISOString(),
      nodes:       [],
    };
  }

  const idx = manifest.nodes.findIndex(n => n.nodeId === entry.nodeId);
  if (idx >= 0) manifest.nodes[idx] = entry;
  else manifest.nodes.push(entry);
  manifest.updatedAt = new Date().toISOString();

  await file.save(JSON.stringify(manifest, null, 2), {
    contentType: 'application/json',
  });
}

export async function getSignedDownloadUrl(storagePath: string, hours = 1): Promise<string> {
  const bucket = getBucket();
  const [url] = await bucket.file(storagePath).getSignedUrl({
    action: 'read',
    expires: Date.now() + hours * 60 * 60 * 1000,
  });
  return url;
}

export function runManifestStoragePath(hubId: string, tenantId: string, runId: string): string {
  return executionRunManifestPath(hubId, tenantId, runId);
}
