
// packages/shared/src/constants/constants.ts

// ── Firestore collection paths ────────────────────────────────────────────────
export const COLLECTIONS = {
  CONNECTORS:   "FloPlugConnectors",
  GLOBAL_SETTINGS:  'FloPlugGlobalSettings',
  HUBS:             'FloPlugHubs',
  AUTH_TYPES :      'FloPlugGlobalSettings/AuthenticationTypes',
  FLOPLUGUSERS:            'FloPlugUsers',         // product-level admin users
   GLOBALLOOKUPS : 'FloPlugGlobalSettings/GlobalLookUps',
    TENANTTYPES : 'FloPlugGlobalSettings/GlobalLookUps/TenantTypes',
    FLOPLUGTIERS: 'FloPlugTiers',
    FLOPLUGROLES: 'FloPlugGlobalSettings/FloPlugRoles',
    FLOPLUGHUBROLES: 'FloPlugGlobalSettings/HubRoles',
    STORAGESETTING: 'FloPlugGlobalSettings/StorageSettings',
    FLOPLUGCONNECTORS: 'FloPlugConnectors',

} as const;

export const SUB_COLLECTIONS = {
  TENANT_TYPES: 'TenantTypes',
  AUTH_TYPES :      'AuthenticationTypes',
  STORAGE_SETTINGS : 'StorageSettings',
  FLOPLUG_ROLES: 'FloPlugRoles',
  FLOPLUGHUBROLES : 'HubRoles',
  GLOBALLOOKUPS: 'GlobalLookUps',
  FLOKITS: 'FloKits',
  SCHEMAS: 'Schemas',
  /** Connector-level actions (manual / legacy) */
  ACTIONS: 'Actions',
  /** Kit-scoped operations — FloPlugConnectors/{id}/FloKits/{kitId}/FloKitActions */
  FLOKITACTIONS: 'FloKitActions',
  /**
   * DEPRECATED:
   * Product templates path under a FloKit.
   * Kept only for backward compatibility with older code.
   * Prefer tenant-scoped HUB_COLLECTIONS.FLOACTIONNODES.
   */
  // ACTIONNODES: 'ActionNodes',
  /** Preferred action-node registry label used by newer flows */
  FLOACTIONNODES: 'FloActionNodes',
} as const;

// ── Sub-collection names (under FloPlugHubs/{hubId}/Tenants/{tenantId}/…) ───────
// Flo* = flo/runtime data scoped to one hub environment (tenant).
// Product-wide config uses FloPlug* top-level collections (FloPlugConnectors, …).
export const HUB_COLLECTIONS = {
  TENANTS:     'Tenants',
  WORKSPACES:  'Workspaces',
  FLOWS:       'Flows',   //Deprecated do not use.
  FLOS:        'Flos',
  PLUGS:           'Plugs',
  FLO_CONNECTIONS: 'FloConnections',
  USERS:       'Users',
  /** Flo run log: FloPlugHubs/{hubId}/Tenants/{tenantId}/FloExecutionLog/{runId} */
  EXEC_LOG:    'FloExecutionLog',
  /** Per-run node JSON: …/FloExecutionLog/{runId}/FloNodeRecords/{nodeId} */
  EXEC_NODE_RECORDS: 'FloNodeRecords',
  /** Latest validation per flo: …/Tenants/{tenantId}/FloValidation/{floId} */
  FLO_VALIDATION: 'FloValidation',
  /** Tenant alerts: …/Tenants/{tenantId}/FloAlerts/{alertId} */
  FLO_ALERTS: 'FloAlerts',
  /** Immutable publish snapshots: …/Flos/{floId}/Versions/{version} */
  FLO_VERSIONS: 'Versions',
  CONNECTORS:  'ConnectorCredentials',
  EMAIL_LOG:   'EmailLog',
  SCHEMAS:     'Schemas',
  ENTITLEMENTS: 'Entitlements',
  FLOACTIONNODES: 'FloActionNodes',
  /**
   * Tenant-scoped registry for dedup checks.
   * Path: FloPlugHubs/{hubId}/Tenants/{tenantId}/Registry
   * All FloConnection entries are stored with key prefix "flc_" e.g. "flc_prod-gmail-smtp"
   */
  REGISTRY:        'Registry',
} as const;

/**
 * Prefix applied to FloConnection ids before writing to the tenant Registry.
 * Example: connectionId "prod-gmail-smtp" → registry docId "flc_prod-gmail-smtp"
 */
export const FLC_REGISTRY_PREFIX = 'flc_' as const;
export const FL_REGISTRY_PREFIX = 'fl_' as const;
export const WS_REGISTRY_PREFIX = 'ws_' as const;
/** Document id for hub-wide entitlements under each tenant */
export const HUB_ENTITLEMENTS_DOC_ID = 'HubFloActions' as const;


export const FLOPLUG_ROLES = {
  ADMIN:     'product_admin',
  DEVELOPER: 'developer',
  ADMIN_SALES:      'admin_sales',
} as const;

// ── Hub roles ─────────────────────────────────────────────────────────────────
export const HUB_ROLES = {
  ADMIN:     'hub_admin',
  USER:      'user',
} as const;

export const ROLES = {
  FLOPLUG_ROLES,
  HUB_ROLES
} as const;

// FloPlugRoles


// ── Permissions ───────────────────────────────────────────────────────────────
export const PERMISSIONS = {
  MANAGE_PLUGS:     'manage:plugs',
  MANAGE_USERS:     'manage:users',
  RUN_FLOS:        'run:flows',
  INVOKE_FLOS:     'invoke:flows',
  DESIGN_FLOS:     'design:flows',
  VIEW_LOGS:        'view:logs',
  MANAGE_SETTINGS:  'manage:settings',
} as const;

export type HubPermission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// ── Role → permissions map ────────────────────────────────────────────────────
// Lives in shared so both validateTenantUser and hubFunctions use the same map
export const ROLE_PERMISSIONS: Record<string, HubPermission[]> = {
  [HUB_ROLES.ADMIN]: [
    PERMISSIONS.MANAGE_PLUGS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.RUN_FLOS,
    PERMISSIONS.INVOKE_FLOS,
    PERMISSIONS.DESIGN_FLOS,
    PERMISSIONS.VIEW_LOGS,
    PERMISSIONS.MANAGE_SETTINGS,
  ],
  [HUB_ROLES.USER]: [
    PERMISSIONS.DESIGN_FLOS,
    PERMISSIONS.VIEW_LOGS,
    // run:flows and invoke:flows added per-user via invokePermissions
  ],
} as const;

// ── Storage purposes ──────────────────────────────────────────────────────────
export const STORAGE_PURPOSES = {
  SCHEMAS:      'schemas',
  BRAND_ASSETS: 'brandAssets',
  EXPORTS:      'exports',
  DOCUMENTS:    'documents',
} as const;

// ── Auth styles ───────────────────────────────────────────────────────────────
export const AUTH_STYLES = {
  HTTP_BASIC:          'httpBasic',
  WSSE_HEADER:         'wsseHeader',
  BEARER_TOKEN:        'bearerToken',
  API_KEY_HEADER:      'apiKeyHeader',
  API_KEY_QUERY:       'apiKeyQuery',
  OAUTH2_CLIENT_CREDS: 'oauth2ClientCreds',
} as const;

// ── Flow execution ────────────────────────────────────────────────────────────
export const EXECUTION = {
  MAX_DEPTH:     5,
  MAX_LOOP_ITER: 1000,
} as const;

// ── Node types ────────────────────────────────────────────────────────────────
export const NODE_TYPES = {
  START:         'startNode',
  END:           'endNode',
  MAPPER:        'mapperNode',
  FILTER:        'filterNode',
  TEMPLATE:      'templateNode',
  FUNCTION:      'functionNode',
  VAR_STORE:     'variableStoreNode',
  PLUG:          'plugNode',
  WORKDAY:       'workdayNode',
  SALESFORCE:    'salesforceNode',
  SAP:           'sapNode',
  ORACLE:        'oracleNode',
  FIF:           'fifNode',
  LOOP:          'loopNode',
  EMAIL:          'emailNode',
} as const;

export const HTTP_METHOD_GET  = 'GET';
export const HTTP_METHOD_POST  = 'POST';
export const HTTP_METHOD_PATCH  = 'PATH';
export const HTTP_METHOD_PUT  = 'PUT';
export const HTTP_METHOD_DELETE  = 'DELETE';

export const HTTP_METHODS  = [HTTP_METHOD_GET, HTTP_METHOD_POST, HTTP_METHOD_PUT, HTTP_METHOD_PATCH, HTTP_METHOD_DELETE] as const;

export const SCHEMA_TYPES    = ['wsdl', 'xsd', 'openapi'] as const;
export const SCHEMA_SOURCE_OPTIONS = [
  { value: 'wsdl',   label: 'WSDL — parse operations from uploaded schema' },
  { value: 'xsd',    label: 'XSD  — parse element from uploaded schema' },
  { value: 'openapi',label: 'OpenAPI — parse operation from uploaded spec' },
  { value: 'manual', label: 'Manual — define input fields by hand' },
];
export const CATEGORIES = ['Human Resources', 'Finance', 'Procurement', 'CRM', 'Payroll', 'Custom'];