
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
    STORAGESETTING: 'FloPlugGlobalSettings/StorageSettings'
} as const;

export const SUB_COLLECTIONS = {
  TENANT_TYPES: 'TenantTypes',
  AUTH_TYPES :      'AuthenticationTypes',
  STORAGE_SETTINGS : 'StorageSettings',
  FLOPLUG_ROLES: 'FloPlugRoles',
  FLOPLUGHUBROLES : 'HubRoles',
  GLOBALLOOKUPS: 'GlobalLookUps'
} as const;

// ── Sub-collection names ──────────────────────────────────────────────────────
export const HUB_COLLECTIONS = {
  TENANTS:     'Tenants',
  WORKSPACES:  'Workspaces',
  FLOWS:       'Flows',   //Deprecated do not use.
  FLOS:        'Flos',
  PLUGS:       'Plugs',
  USERS:       'Users',
  EXEC_LOG:    'ExecutionLog',
  CONNECTORS:  'ConnectorCredentials',
  EMAIL_LOG:   'EmailLog',
  SCHEMAS:     'Schemas',
} as const;

// ── Hub roles ─────────────────────────────────────────────────────────────────
export const HUB_ROLES = {
  ADMIN:     'hub_admin',
  USER:      'user',
} as const;

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