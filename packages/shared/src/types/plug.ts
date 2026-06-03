export type PlugCredentialValues = Record<string, string>;

import type { ConnectorUrlToken } from '../utils/connectorUrlTokens.js';

export interface PlugVariableHint {
  name:          string;
  hint:          string;
  defaultValue?: string;
}

export interface PlugVariableBinding {
  source: 'static' | 'cStream' | 'global' | 'local' | 'expression';
  /** Static text, dot-path, or FloExpression when source is expression */
  value:  string;
}

export interface PlugConfig {
  id:             string;
  hubId:          string;
  tenantId:       string;
  connectorId:    string;
  connectorLabel: string;
  authProtocol:   string;
  nodeType?:      string;
  name:           string;
  urlPattern:     string;                        // resolved preview (default connection) for legacy compat
  variableHints?: PlugVariableHint[];            // derived from plugNodeUrlTokens for designer hints
  /** Snapshot of connector urlTokens at save time (designer URL preview without connector fetch) */
  urlTokensSnapshot?:        ConnectorUrlToken[];
  /** Hub-admin plug token values per allowed connection (connectionId → tokenKey → value) */
  plugUrlValuesByConnection?: Record<string, Record<string, string>>;
  /** Snapshot of plug-node URL tokens from connector (for designer inspector) */
  plugNodeUrlTokens?:        { key: string; label?: string; description?: string; field?: string }[];
  /**
   * When set, credentials are read from FloConnections/{connectionId}.
   * Legacy plugs may still store credentials inline until migrated (Phase 4).
   */
  connectionId?:  string;
  /** Hub-admin default connection for this plug (developer may override on canvas) */
  defaultConnectionId?: string;
  /** Connections developers may choose (empty = any active connection for authProtocol) */
  allowedConnectionIds?: string[];
  /** Inline auth — used when connectionId is absent (legacy) */
  credentials?:   PlugCredentialValues;
  urlVariables?:  Record<string, PlugVariableBinding>; // dev fills on node
  isActive:       boolean;
  createdBy:      string;
  updatedBy:      string;                        // added for audit
  createdAt?:     any;
  updatedAt?:     any;
}

import type { NodeHttpTrace } from './floExecutionHub.js';

export interface NodeExecutionHubPayload {
  nodeId:     string;
  nodeType:   string;
  nodeLabel?: string;
  status:     'ok' | 'error' | 'skipped' | 'running';
  before?:    Record<string, unknown>;
  after?:     Record<string, unknown>;
  logLine?:   string;
  httpTrace?: NodeHttpTrace;
  error?:     string;
  durationMs?: number;
}

import type { FloRunMeta } from './floRunMeta.js';

export interface RunContext {
  hubId:    string;
  tenantId: string;
  wsId:     string;
  runId:    string;
  floId?:   string;
  /** Engine-owned run metadata — read-only in flows; use floRunMeta.* in expressions */
  floRunMeta?: Readonly<FloRunMeta>;
  store:    { global: Record<string, any>; local: Record<string, any> };
  log:      string[];
  depth:    number;
  /**
   * When true, remote I/O (HTTP, SMTP, connector calls) is simulated only —
   * requests are built but not sent. Test node always runs with dryRun.
   */
  dryRun?:  boolean;
  /** When set, engine persists per-node before/after JSON for Execution Hub */
  onNodeComplete?: (payload: NodeExecutionHubPayload) => void | Promise<void>;
  /** Per-run cache for hub FloActionNodes doc lookups (floActionNode runtime) */
  hubFloActionCache?: Map<string, Record<string, unknown> | null>;
  /** When set, engine checks between nodes and aborts if kill was requested */
  shouldAbort?: () => Promise<boolean>;
  /** Full flo graph for InvokeSubFlo / Loop (set on first executeFloNodes call). */
  graphNodes?: { id: string; type: string; data: Record<string, unknown> }[];
  graphEdges?: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }[];
  /** Success-path parent + cStream snapshots for error propagation. */
  executionPath?: import('./errorHandling.js').ExecutionPathState;
  /** When executing a compartment/loop body, parent for entry nodes with no incoming edge. */
  entryParentNodeId?: string;
}