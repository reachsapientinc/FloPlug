/** Where a FloAction node reads / writes flow data (canvas + engine). */
export type StreamSource = 'cStream' | 'local' | 'global';

import type { ConnectorUrlToken } from '../utils/connectorUrlTokens.js';
import type { KitUrlContext } from '../utils/connectorUrlTokens.js';

/** MIME types supported when parsing non-cStream input (phase-2 engine). */
export const ACTION_INPUT_CONTENT_TYPES = [
  { value: 'application/json', label: 'JSON' },
  { value: 'application/xml',  label: 'XML' },
  { value: 'text/csv',         label: 'CSV' },
  { value: 'text/plain',       label: 'Plain Text' },
  { value: 'text/html',        label: 'HTML' },
] as const;

/** Developer-configured fields persisted on the flo canvas node. */
export interface FloActionCanvasData {
  actionId?:            string;
  connectionId?:        string;
  inputSource?:         StreamSource;
  inputVarName?:        string;
  inputContentType?:    string;
  outputTarget?:        StreamSource;
  outputVarName?:       string;
  /** Developer-filled URL segment bindings (floActionNode-classified tokens) */
  urlVariables?:        Record<string, { source: string; value: string }>;
}

/**
 * Product-level action node template — materialized when a FloKit is saved.
 * Path: FloPlugConnectors/{connectorId}/FloKits/{floKitId}/ActionNodes/{actionId}
 */
export interface FloKitActionNodeDoc {
  id:                  string;
  floKitId:            string;
  connectorId:         string;
  actionId:            string;
  actionLabel:         string;
  servicesSchemaId:        string;
  servicesSchemaVersion:   string;
  dataModelSchemaId:       string;
  dataModelSchemaVersion:  string;
  /** @deprecated Use servicesSchemaId */
  wsdlSchemaId?:           string;
  /** @deprecated Use servicesSchemaVersion */
  wsdlSchemaVersion?:      string;
  /** @deprecated Use servicesSchemaId */
  schemaId?:               string;
  /** @deprecated Use servicesSchemaVersion */
  schemaVersion?:          string;
  kitVersion:          string;
  category?:           string;
  isActive:            boolean;
  createdAt?:          unknown;
  updatedAt?:          unknown;
}

/**
 * Hub-scoped action node instance — enabled for developers on a specific hub/tenant.
 * Path: FloPlugHubs/{hubId}/Tenants/{tenantId}/ActionNodes/{instanceId}
 * (Phase 5 — types defined now for downstream work.)
 */
export interface HubActionNodeDoc {
  id:                     string;
  hubId:                  string;
  tenantId:               string;
  floKitId:               string;
  kitVersion?:            string;
  /** Entitled actions enabled for this kit on the hub */
  actionIds?:             string[];
  /** @deprecated Use actionIds — kept for older docs */
  templateActionId?:      string;
  connectorId:            string;
  /** Admin-defined name for this FloAction instance (not tied to FloKit label) */
  floActionName?:         string;
  /** Unique short label shown on the designer node palette */
  flaLabel?:              string;
  /** Hub-admin notes shown in the palette bubble */
  description?:           string;
  /** @deprecated Use floActionName */
  displayName?:           string;
  allowedConnectionIds?:  string[];
  defaultConnectionId?:   string;
  /** Hub-admin FloAction token values per allowed connection */
  floActionUrlValuesByConnection?: Record<string, Record<string, string>>;
  /** Snapshot of FloAction-node URL tokens from connector (for designer inspector) */
  floActionNodeUrlTokens?:        { key: string; label?: string; description?: string; field?: string }[];
  /** Snapshot of connector urlTokens for designer URL preview */
  urlTokensSnapshot?:     ConnectorUrlToken[];
  /** Kit URL segment values from FloKit at save time */
  kitUrlContext?:         KitUrlContext;
  outputTarget?:          'cStream' | 'local' | 'global';
  varName?:               string;
  enabledForDevelopers?:  boolean;
  isActive?:              boolean;
  createdAt?:             unknown;
  updatedAt?:             unknown;
}

/** Resolved display fields for palette / inspector (handles legacy docs). */
export function resolveFloActionFields(doc: Pick<
  HubActionNodeDoc,
  'floActionName' | 'displayName' | 'flaLabel' | 'floKitId' | 'description'
>) {
  const floActionName = doc.floActionName?.trim()
    || doc.displayName?.trim()
    || doc.floKitId;
  const flaLabel = doc.flaLabel?.trim() || floActionName;
  return { floActionName, flaLabel, description: doc.description?.trim() ?? '' };
}

/** Subset passed to the designer node palette */
export interface FloActionPaletteItem {
  id:                     string;
  floActionName:          string;
  flaLabel:               string;
  description?:           string;
  connectorId:            string;
  floKitId:               string;
  actionIds:              string[];
  templateActionId?:    string;
  defaultConnectionId?:   string;
  allowedConnectionIds?:  string[];
}

export function toFloActionPaletteItem(doc: HubActionNodeDoc): FloActionPaletteItem {
  const { floActionName, flaLabel, description } = resolveFloActionFields(doc);
  return {
    id:                   doc.id,
    floActionName,
    flaLabel,
    description:          description || undefined,
    connectorId:          doc.connectorId,
    floKitId:             doc.floKitId,
    actionIds:            doc.actionIds ?? (doc.templateActionId ? [doc.templateActionId] : []),
    defaultConnectionId:  doc.defaultConnectionId,
    allowedConnectionIds: doc.allowedConnectionIds,
  };
}

export interface AddActionNodeParams {
  floKitId:             string;
  connectorId:          string;
  actionIds:            string[];
  /** All connections the developer may choose from in the designer inspector */
  allowedConnectionIds: string[];
  /** The ★ default — pre-selected when the node is dropped on canvas */
  defaultConnectionId:  string;
  outputTarget:         'cStream' | 'local' | 'global';
  varName?:             string;
  floActionName:        string;
  flaLabel:             string;
  description?:         string;
  floActionUrlValuesByConnection?: Record<string, Record<string, string>>;
  floActionNodeUrlTokens?:        { key: string; label?: string; description?: string; field?: string }[];
  /** @deprecated Use floActionName */
  displayName?:         string;
}
