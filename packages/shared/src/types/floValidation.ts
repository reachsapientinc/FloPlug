/**
 * FloValidation — design-time graph validation (shared client + server).
 */

import type { FloNode, FloEdge } from './nodeTypes.js';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export type FloValidationCode =
  | 'REQUIRED_FIELD_MISSING'
  | 'REQUIRED_BINDING_MISSING'
  | 'TEMPLATE_PLACEHOLDER_UNBOUND'
  | 'URL_VARIABLE_UNBOUND'
  | 'GRAPH_DISCONNECTED'
  | 'GRAPH_NO_START'
  | 'GRAPH_NO_END'
  | 'REFERENCE_MISSING'
  | 'REFERENCE_INACTIVE'
  | 'ACTION_NOT_CONFIGURED'
  | 'MAPPING_INCOMPLETE'
  | 'EMPTY_TEMPLATE'
  | 'SUB_FLO_NOT_SELECTED';

export interface FloValidationIssue {
  nodeId:     string;
  nodeType:   string;
  nodeLabel:  string;
  field:      string;
  code:       FloValidationCode;
  message:    string;
  severity:   ValidationSeverity;
}

/** Per-node validation snapshot stored as JSON on flo / execution hub. */
export interface FloNodeValidationSnapshot {
  nodeId:    string;
  nodeType:  string;
  nodeLabel: string;
  valid:     boolean;
  issues:    FloValidationIssue[];
  /** Optional metrics (e.g. mapping stats) — hub UI only */
  metrics?:  Record<string, unknown>;
}

export interface FloValidationReport {
  floId?:           string;
  floName?:         string;
  validatedAt:      string;
  nodeSnapshots:    FloNodeValidationSnapshot[];
  errors:           FloValidationIssue[];
  warnings:         FloValidationIssue[];
  infos:            FloValidationIssue[];
  canSave:          boolean;
  canPublish:       boolean;
  canRunProduction: boolean;
}

export type FloPublishState   = 'draft' | 'published';
export type FloValidationStatus = 'valid' | 'invalid' | 'warnings' | 'unknown';

/** Per-plug connection policy configured by hub admin. */
export interface PlugConnectionPolicy {
  allowedConnectionIds: string[];
  defaultConnectionId?: string;
}

/** External refs the server can verify (plugs, connections, sub-flos). */
export interface FloValidationResourceContext {
  plugIds?:           Set<string>;
  activePlugIds?:     Set<string>;
  connectionIds?:     Set<string>;
  activeConnectionIds?: Set<string>;
  floIds?:            Set<string>;
  publishedFloIds?:   Set<string>;
  floKitIds?:         Set<string>;
  hubActionNodeIds?:  Set<string>;
  /** plugId → allowed connections + default (hub admin plug definition) */
  plugConnectionPolicy?: Record<string, PlugConnectionPolicy>;
}

export interface ValidateFloGraphInput {
  floId?:       string;
  floName?:     string;
  nodes:        FloNode[];
  edges:        FloEdge[];
  resources?:   FloValidationResourceContext;
  /** When true, REFERENCE_* checks run against resources */
  checkResources?: boolean;
}

export function buildFloValidationReport(
  issues: FloValidationIssue[],
  nodeSnapshots: FloNodeValidationSnapshot[],
  meta?: { floId?: string; floName?: string },
): FloValidationReport {
  const errors   = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const infos    = issues.filter(i => i.severity === 'info');

  return {
    floId:            meta?.floId,
    floName:          meta?.floName,
    validatedAt:      new Date().toISOString(),
    nodeSnapshots,
    errors,
    warnings,
    infos,
    canSave:          true,
    canPublish:       errors.length === 0,
    canRunProduction: errors.length === 0,
  };
}

export function summarizeValidation(report: FloValidationReport): {
  errorCount:   number;
  warningCount: number;
  nodeCount:    number;
} {
  return {
    errorCount:   report.errors.length,
    warningCount: report.warnings.length,
    nodeCount:    report.nodeSnapshots.length,
  };
}
