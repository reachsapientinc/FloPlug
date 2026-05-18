import type { PlugCredentialValues } from './plug.js';
import '../constants/constants.js';

/**
 * FloConnection — hub-scoped credentials + endpoint context for a connector.
 * Path: FloPlugHubs/{hubId}/Tenants/{tenantId}/FloConnections/{connectionId}
 *
 * Plugs reference a connection via PlugConfig.connectionId instead of embedding credentials.
 */
export interface FloConnectionDoc {
  id:               string;
  hubId:            string;
  tenantId:         string;
  connectorId:      string;
  connectorLabel?:  string;
  name:             string;
  authProtocol:     string;
  /** Human label, e.g. "Production", "Sandbox" */
  environmentLabel?: string;
  hostname?:        string;
  /** Target-system tenant / company id */
  tenantKey?:       string;
  credentials:      PlugCredentialValues;
  isActive:         boolean;
  createdBy?:       string;
  updatedBy?:       string;
  createdAt?:       unknown;
  updatedAt?:       unknown;
}

/**
 * What the frontend receives — credentials are always stripped server-side.
 */
export type FloConnectionSummary = Omit<FloConnectionDoc, 'credentials'>;
 
/**
 * Registry entry written alongside the FloConnection doc.
 * Path: FloPlugHubs/{hubId}/Tenants/{tenantId}/Registry/flc_{connectionId}
 */
export interface FloConnectionRegistryEntry {
  /** Same as the connectionId — without the flc_ prefix */
  connectionId:   string;
  connectorId:    string;
  authProtocol:   string;
  name:           string;
  tenantId:       string;
  hubId:          string;
  isActive:       boolean;
  createdAt?:     unknown;
}

/**
 * Helper — build the Registry document key for a FloConnection.
 * Always use this instead of constructing the key ad-hoc.
 */
// export const floConnectionKey = (connectionId: string) =>
//   `${FLC_REGISTRY_PREFIX}:${connectionId}` as const;