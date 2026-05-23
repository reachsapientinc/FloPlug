
import type { HubRole } from "./types.js";
import type {HubPermission} from '../constants/constants.js';
export type FieldType = 'text' | 'password' | 'url' | 'textarea' | 'select';

export interface AuthField {
  name:            string;
  label:           string;
  required:        boolean;
  requiresMasking: boolean;
}

export interface AuthType {
  name:     string;
  label:    string;
  isActive: boolean;
  fields:   AuthField[];
}

export type AuthStyle =
  | 'httpBasic'        // Authorization: Basic base64(user:pass)
  | 'wsseHeader'       // WSSE UsernameToken in SOAP envelope
  | 'bearerToken'      // Authorization: Bearer {token}
  | 'apiKeyHeader'     // custom header name from config
  | 'apiKeyQuery'      // ?apiKey=xxx query param
  | 'oauth2ClientCreds'; // token exchange then bearer

export interface AuthProtocolField {
  name:            string;
  label:           string;
  fieldType:       FieldType;
  required:        boolean;
  requiresMasking: boolean;
  placeholder?:    string;
  helpText?:       string;
  options?:        string[];   // for fieldType === 'select'
}

export interface RuntimeConfig {
  placementType:             'bearer' | 'basic' | 'header' | 'query';
  headerName?:               string;
  headerFormat?:             string;
  tokenEndpointField?:       string;
  staticTokenEndpoint?:      string;
  clientIdField?:            string;
  clientSecretField?:        string;
  usernameField?:            string;
  passwordField?:            string;
  scopeField?:               string;
  authEndpointField?:        string;
  redirectUriField?:         string;
  issuerField?:              string;
  audienceField?:            string;
  privateKeyField?:          string;
  headerNameField?:          string;
  placementField?:           string;
  refreshStrategy:           'none' | 'auto' | 'on_expiry';
  assertionLifetime?:        number;
  requiresInteractiveSetup?: boolean;
  tokenResponseMapping?: {
    accessToken?:  string;
    refreshToken?: string;
    expiresIn?:    string;
    tokenType?:    string;
  };
}

export interface AuthProtocol {
  name:           string;
  label:          string;
  description?:   string;
  isActive:       boolean;
  sortOrder?:     number;
  grantType?:     string;
  authStyle?:     AuthStyle;              // optional until patch script runs
  headerName?:    string;                 // for apiKeyHeader
  paramName?:     string;                 // for apiKeyQuery
  tokenUrl?:      string;                 // for oauth2ClientCreds
  runtimeConfig?: Record<string, any>;   // existing seed data
  fields:         AuthProtocolField[];
}

// ── Connector-level auth override ─────────────────────────────────────────────
// Stored on the ConnectorDoc so product admins can configure connector-specific
// deviations from the generic protocol without touching the seed script.
// authEngine merges this over the base protocol's runtimeConfig at runtime.
 
export interface ConnectorAuthOverride {
  // Override the grant type (e.g. Workday uses 'refresh_token' not 'password')
  grantType?:     string;
  // Body encoding for token requests: 'form' (default) | 'json'
  bodyFormat?:    'form' | 'json';
  // Extra static params always sent in the token request body
  extraBodyParams?: Record<string, string>;
  // Map credential field names to token request param names
  // e.g. { refreshToken: 'refresh_token', clientId: 'client_id' }
  fieldMappings?: Record<string, string>;
  // Override token response field names if non-standard
  tokenResponseMapping?: {
    accessToken?:  string;
    refreshToken?: string;
    expiresIn?:    string;
  };
  extraFields?: AuthProtocolField[];
  // Free-text notes shown in ConnectorManagement UI
  notes?: string;
}
 
// ── Connector doc ─────────────────────────────────────────────────────────────
 
export interface ConnectorDoc {
  id:                 string;
  label:              string;
  category:           string;
  supportedAuthTypes: string[];
  description:        string;
  isActive:           boolean;
  authOverride?:      ConnectorAuthOverride;
  allowActionNodes?: boolean;   // enables FloKit/PreDefinedNode creation
  tierControlled?:            boolean;    // access gated by hub tier
  availableForTiers?:         string[]; 
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema types (FloPlugConnectors/{id}/Schemas/{id})
// Uploaded WSDL/XSD/OpenAPI files stored in Cloud Storage, indexed here.
// ─────────────────────────────────────────────────────────────────────────────
 
export type SchemaType = 'wsdl' | 'xsd' | 'openapi' | 'graphql';
 
export interface ConnectorSchema {
  id:           string;
  connectorId:  string;
  label:        string;           // e.g. "Human Resources v42.2"
  version:      string;           // e.g. "v42.2"
  schemaType:   SchemaType;
  storagePath:  string;           // gs://floplug-schemas/workday/v42/HR.wsdl
  isActive:     boolean;
  uploadedAt?:  Date;
  uploadedBy?:  string;
  /** Operations extracted at upload / listSchemaOperations — names only */
  operations?:  string[];
  /** Rich metadata per operation (method, path) for OpenAPI and UI */
  operationsMeta?: Array<{
    name:      string;
    label:     string;
    method?:   string;
    endpoint?: string;
  }>;
  operationsParsedAt?: unknown;
  /** Pre-compiled mapper index (JSON in Cloud Storage) — built at upload */
  flattenStoragePath?: string;
  flattenCompiledAt?:  unknown;
  /** Product registry key (FloPlugRegistry/GlobalConfig/Registry/sch__...) */
  registryKey?:        string;
  /** Set when duplicate schema doc was superseded by canonical registry entry */
  supersededBy?:       string;
}
 
// ─────────────────────────────────────────────────────────────────────────────
// ParsedField — returned by resolveActionSchema Cloud Function
// Also used in ActionDoc.inputSchema for simple/manual actions.
// ─────────────────────────────────────────────────────────────────────────────
 
export interface ParsedField {
  path:         string;     // dot-path: "Worker_Data.Personal_Data.Name_Data.First_Name"
  label:        string;     // human-readable: "First Name"
  xsdType:      string;     // "xsd:string" | "xsd:date" | "xsd:decimal" | ...
  required:     boolean;    // from minOccurs in XSD / required in OpenAPI
  repeating:    boolean;    // maxOccurs > 1 or array in OpenAPI
  enumValues?:  string[];   // if xsd:enumeration or OpenAPI enum
  helpText?:    string;     // from xsd:documentation or description
}
 
// ─────────────────────────────────────────────────────────────────────────────
// Action types (FloPlugConnectors/{id}/Actions/{id})
// ─────────────────────────────────────────────────────────────────────────────
 
export type ActionSchemaSource = 'wsdl' | 'xsd' | 'openapi' | 'graphql' | 'manual';
 
export interface ActionDoc {
  id:              string;
  connectorId:     string;
  label:           string;          // "Create Worker"
  category:        string;          // "Human Resources"
  description?:    string;
  isActive:        boolean;
 
  // HTTP config
  method:          'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint:        string;          // "/v1/workers" or "/Human_Resources/v42.2"
  soapAction?:     string;          // SOAP only: "urn:com.workday/bsvc/Put_Worker"
  contentType?:    string;          // default: "application/json" or "text/xml"
 
  // Schema derivation
  schemaSource:    ActionSchemaSource;
  schemaRef?:      string;          // ConnectorSchema.id — required if source is wsdl/xsd/openapi
  operationName?:  string;          // exact name in the WSDL/OpenAPI spec
 
  /**
   * inputSchema is populated one of two ways:
   *   - Automatically: resolveActionSchema parses WSDL/XSD and caches here
   *   - Manually: product admin fills it in for simple REST actions
   * For WSDL/XSD actions with hundreds of fields, leave empty and rely on
   * the cache in Actions/{id}/Cache/parsedSchema
   */
  inputSchema?:    ParsedField[];
 
  /** What keys this action writes back into cStream after a successful call */
  outputKeys?:     string[];        // e.g. ["workerId", "_actionStatus", "_rawResponse"]
 
  /** Body template with {{cStream.field}} placeholders — used by actionEngine */
  bodyTemplate?:   string;          // JSON or XML string
 
  /** Map response paths back to cStream keys */
  responseMapping?: Array<{
    cStreamKey:    string;          // "workerId"
    responsePath:  string;          // "Worker_Data.Worker_ID"
  }>;
 
  createdAt?:  Date;
  updatedAt?:  Date;
  createdBy?:  string;
  floKitId?: string;

  /** Optional precomputed WSDL request binding for faster mapping-target resolution. */
  requestBinding?: {
    inputMessageName?: string;
    requestRootElement?: string;
    requestTypeName?: string;
    resolvedAt?: unknown;
    servicesSchemaId?: string;
    servicesSchemaVersion?: string;
  };
}

// ── Permission doc — FloPlugGlobalSettings/GlobalLookups/Permissions/{id} ──────

export type PermissionCategory = 'plugs' | 'users' | 'flos' | 'logs' | 'settings';

export interface PermissionDoc {
  label:       string;
  description: string;
  category:    PermissionCategory;
  isActive:    boolean;
  sortOrder:   number;
}

// ── HubRole doc — FloPlugGlobalSettings/GlobalLookups/HubRoles/{roleId} ────────

export interface HubRoleDoc {
  label:         string;
  isActive:      boolean;
  sortOrder:     number;
  permissionIds: HubPermission[];   // refs into Permissions collection
}

// ── FloPlugRole doc — FloPlugGlobalSettings/GlobalLookups/FloPlugRoles/{roleId} ─

export interface FloPlugRoleDoc {
  label:     string;
  isActive:  boolean;
  sortOrder: number;
}

// ── Resolved shape — what the UI and token work with after joining ────────────

export interface ResolvedHubRole extends HubRoleDoc {
  id:          string;
  permissions: PermissionDoc[];   // joined from Permissions collection
}
