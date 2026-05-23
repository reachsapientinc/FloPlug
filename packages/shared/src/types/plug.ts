export type PlugCredentialValues = Record<string, string>;

export interface PlugVariableHint {
  name:          string;
  hint:          string;
  defaultValue?: string;
}

export interface PlugVariableBinding {
  source: 'static' | 'cStream' | 'global' | 'local';
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
  urlPattern:     string;                        // was baseUrl
  variableHints:  PlugVariableHint[];            // admin hints per {{variable}}
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

export interface RunContext {
  hubId:    string;
  tenantId: string;
  wsId:     string;
  runId:    string;
  floId?:   string;
  store:    { global: Record<string, any>; local: Record<string, any> };
  log:      string[];
  depth:    number;
  /** When set, engine persists per-node before/after JSON for Execution Hub */
  onNodeComplete?: (payload: NodeExecutionHubPayload) => void | Promise<void>;
}