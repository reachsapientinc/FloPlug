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
  /** Inline auth — used when connectionId is absent (legacy) */
  credentials?:   PlugCredentialValues;
  urlVariables?:  Record<string, PlugVariableBinding>; // dev fills on node
  isActive:       boolean;
  createdBy:      string;
  updatedBy:      string;                        // added for audit
  createdAt?:     any;
  updatedAt?:     any;
}

export interface RunContext {
  hubId:    string;
  tenantId: string;
  wsId:     string;
  runId:    string;
  store:    { global: Record<string, any>; local: Record<string, any> };
  log:      string[];
  depth:    number;
}