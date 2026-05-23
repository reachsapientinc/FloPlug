/**
 * FloExecution Hub — persisted run + validation records (JSON per node).
 */

import type { FloValidationReport, FloNodeValidationSnapshot } from './floValidation.js';

export type ExecutionRunStatus = 'running' | 'success' | 'error';

/** Summary row for Pulse / Dashboard lists */
export interface FloExecutionRunSummary {
  runId:        string;
  floId:        string;
  floName?:     string;
  floVersion?:  number;
  /** Whether this run used draft canvas or published graph */
  executedGraph?: 'draft' | 'published';
  status:       ExecutionRunStatus | string;
  source?:      string;
  startedAt?:   string;
  completedAt?: string;
  durationMs?:  number;
  nodeCount?:   number;
  logLineCount?: number;
  /** Primary error message when status is error */
  errorMessage?: string;
}

export type FloAlertType =
  | 'FLO_INVALIDATED'
  | 'FLO_PUBLISH_BLOCKED'
  | 'FLO_RUN_FAILED'
  | 'FLO_REFERENCE_DRIFT';

export type FloAlertSeverity = 'critical' | 'warning' | 'info';

/** HTTP / API trace captured at execution time (credentials redacted). */
export interface NodeHttpTrace {
  method:               string;
  url:                  string;
  requestHeaders?:      Record<string, string>;
  /** Full request body (Storage); previews may be truncated for Firestore index */
  requestBody?:         string;
  requestBodyPreview?:  string;
  status?:              number;
  statusText?:          string;
  responseBody?:        string;
  responseBodyPreview?: string;
  responseContentType?: string;
}

/** One document per node: FloPlugHubs/…/Tenants/…/FloExecutionLog/{runId}/FloNodeRecords/{nodeId} */
export interface FloExecutionNodeRecord {
  runId:       string;
  floId:       string;
  nodeId:      string;
  nodeType:    string;
  nodeLabel?:  string;
  status:      'ok' | 'error' | 'skipped' | 'running';
  startedAt?:  string;
  completedAt?: string;
  durationMs?: number;
  logLine?:    string;
  /** Snapshot before node execution (Firestore index may be truncated) */
  before?:     Record<string, unknown>;
  /** Snapshot after node execution */
  after?:      Record<string, unknown>;
  httpTrace?:  NodeHttpTrace;
  error?:      string;
  /** GCS path to full JSON (before/after/httpTrace untruncated) */
  storagePath?: string;
  hasFullPayload?: boolean;
}

/** Full node execution JSON written to Storage (no truncation). */
export interface FloExecutionNodeStorageRecord extends FloExecutionNodeRecord {
  persistedAt?: string;
  storageVersion?: number;
}

/** Stored on flo doc after validation / publish */
export interface FloValidationPersisted {
  report:           FloValidationReport;
  nodeSnapshots:    FloNodeValidationSnapshot[];
  publishState:     'draft' | 'published';
  validationStatus: 'valid' | 'invalid' | 'warnings' | 'unknown';
  validatedAt:      string;
}

/** Tenant-level alert for Execution Hub Alerts tab */
export interface FloAlertDoc {
  id?:              string;
  hubId:            string;
  tenantId:         string;
  floId:            string;
  floName?:         string;
  workspaceId?:     string;
  type:             FloAlertType;
  severity:         FloAlertSeverity;
  title:            string;
  message:          string;
  errorCount?:      number;
  warningCount?:    number;
  /** Top issues for UI */
  issues?:          { nodeId: string; message: string; code?: string }[];
  acknowledged?:    boolean;
  createdAt?:       unknown;
  updatedAt?:       unknown;
  resolvedAt?:      unknown;
}

export interface PersistNodeExecutionInput {
  hubId:      string;
  tenantId:   string;
  runId:      string;
  floId:      string;
  nodeId:     string;
  nodeType:   string;
  nodeLabel?: string;
  status:     FloExecutionNodeRecord['status'];
  before?:    Record<string, unknown>;
  after?:     Record<string, unknown>;
  logLine?:   string;
  httpTrace?: NodeHttpTrace;
  error?:     string;
  durationMs?: number;
}

export interface PersistValidationEventInput {
  hubId:           string;
  tenantId:        string;
  workspaceId:     string;
  floId:           string;
  floName?:        string;
  report:          FloValidationReport;
  publishState:    'draft' | 'published';
  validationStatus: FloValidationPersisted['validationStatus'];
  trigger:         'publish' | 'save' | 'scheduled' | 'manual';
}
