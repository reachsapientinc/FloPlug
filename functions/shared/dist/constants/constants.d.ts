export declare const COLLECTIONS: {
    readonly CONNECTORS: "FloPlugConnectors";
    readonly GLOBAL_SETTINGS: "FloPlugGlobalSettings";
    readonly HUBS: "FloPlugHubs";
    readonly AUTH_TYPES: "FloPlugGlobalSettings/AuthenticationTypes";
    readonly FLOPLUGUSERS: "FloPlugUsers";
    readonly GLOBALLOOKUPS: "FloPlugGlobalSettings/GlobalLookUps";
    readonly TENANTTYPES: "FloPlugGlobalSettings/GlobalLookUps/TenantTypes";
    readonly FLOPLUGTIERS: "FloPlugTiers";
    readonly FLOPLUGROLES: "FloPlugGlobalSettings/FloPlugRoles";
    readonly FLOPLUGHUBROLES: "FloPlugGlobalSettings/HubRoles";
    readonly STORAGESETTING: "FloPlugGlobalSettings/StorageSettings";
    readonly FLOPLUGCONNECTORS: "FloPlugConnectors";
};
export declare const SUB_COLLECTIONS: {
    readonly TENANT_TYPES: "TenantTypes";
    readonly AUTH_TYPES: "AuthenticationTypes";
    readonly STORAGE_SETTINGS: "StorageSettings";
    readonly FLOPLUG_ROLES: "FloPlugRoles";
    readonly FLOPLUGHUBROLES: "HubRoles";
    readonly GLOBALLOOKUPS: "GlobalLookUps";
    readonly FLOKITS: "FloKits";
    readonly SCHEMAS: "Schemas";
    /** Connector-level actions (manual / legacy) */
    readonly ACTIONS: "Actions";
    /** Kit-scoped operations — FloPlugConnectors/{id}/FloKits/{kitId}/FloKitActions */
    readonly FLOKITACTIONS: "FloKitActions";
    /**
     * DEPRECATED:
     * Product templates path under a FloKit.
     * Kept only for backward compatibility with older code.
     * Prefer tenant-scoped HUB_COLLECTIONS.FLOACTIONNODES.
     */
    /** Preferred action-node registry label used by newer flows */
    readonly FLOACTIONNODES: "FloActionNodes";
};
export declare const HUB_COLLECTIONS: {
    readonly TENANTS: "Tenants";
    readonly WORKSPACES: "Workspaces";
    readonly FLOWS: "Flows";
    readonly FLOS: "Flos";
    readonly PLUGS: "Plugs";
    readonly FLO_CONNECTIONS: "FloConnections";
    readonly USERS: "Users";
    /** Flo run log: FloPlugHubs/{hubId}/Tenants/{tenantId}/FloExecutionLog/{runId} */
    readonly EXEC_LOG: "FloExecutionLog";
    /** Per-run node JSON: …/FloExecutionLog/{runId}/FloNodeRecords/{nodeId} */
    readonly EXEC_NODE_RECORDS: "FloNodeRecords";
    /** Latest validation per flo: …/Tenants/{tenantId}/FloValidation/{floId} */
    readonly FLO_VALIDATION: "FloValidation";
    /** Tenant alerts: …/Tenants/{tenantId}/FloAlerts/{alertId} */
    readonly FLO_ALERTS: "FloAlerts";
    /** Immutable publish snapshots: …/Flos/{floId}/Versions/{version} */
    readonly FLO_VERSIONS: "Versions";
    readonly CONNECTORS: "ConnectorCredentials";
    readonly EMAIL_LOG: "EmailLog";
    readonly SCHEMAS: "Schemas";
    readonly ENTITLEMENTS: "Entitlements";
    readonly FLOACTIONNODES: "FloActionNodes";
    /**
     * Tenant-scoped registry for dedup checks.
     * Path: FloPlugHubs/{hubId}/Tenants/{tenantId}/Registry
     * All FloConnection entries are stored with key prefix "flc_" e.g. "flc_prod-gmail-smtp"
     */
    readonly REGISTRY: "Registry";
};
/**
 * Prefix applied to FloConnection ids before writing to the tenant Registry.
 * Example: connectionId "prod-gmail-smtp" → registry docId "flc_prod-gmail-smtp"
 */
export declare const FLC_REGISTRY_PREFIX: "flc_";
export declare const FL_REGISTRY_PREFIX: "fl_";
export declare const WS_REGISTRY_PREFIX: "ws_";
/** Document id for hub-wide entitlements under each tenant */
export declare const HUB_ENTITLEMENTS_DOC_ID: "HubFloActions";
export declare const FLOPLUG_ROLES: {
    readonly ADMIN: "product_admin";
    readonly DEVELOPER: "developer";
    readonly ADMIN_SALES: "admin_sales";
};
export declare const HUB_ROLES: {
    readonly ADMIN: "hub_admin";
    readonly USER: "user";
};
export declare const ROLES: {
    readonly FLOPLUG_ROLES: {
        readonly ADMIN: "product_admin";
        readonly DEVELOPER: "developer";
        readonly ADMIN_SALES: "admin_sales";
    };
    readonly HUB_ROLES: {
        readonly ADMIN: "hub_admin";
        readonly USER: "user";
    };
};
export declare const PERMISSIONS: {
    readonly MANAGE_PLUGS: "manage:plugs";
    readonly MANAGE_USERS: "manage:users";
    readonly RUN_FLOS: "run:flows";
    readonly INVOKE_FLOS: "invoke:flows";
    readonly DESIGN_FLOS: "design:flows";
    readonly VIEW_LOGS: "view:logs";
    readonly MANAGE_SETTINGS: "manage:settings";
};
export type HubPermission = typeof PERMISSIONS[keyof typeof PERMISSIONS];
export declare const ROLE_PERMISSIONS: Record<string, HubPermission[]>;
export declare const STORAGE_PURPOSES: {
    readonly SCHEMAS: "schemas";
    readonly BRAND_ASSETS: "brandAssets";
    readonly EXPORTS: "exports";
    readonly DOCUMENTS: "documents";
};
export declare const AUTH_STYLES: {
    readonly HTTP_BASIC: "httpBasic";
    readonly WSSE_HEADER: "wsseHeader";
    readonly BEARER_TOKEN: "bearerToken";
    readonly API_KEY_HEADER: "apiKeyHeader";
    readonly API_KEY_QUERY: "apiKeyQuery";
    readonly OAUTH2_CLIENT_CREDS: "oauth2ClientCreds";
};
export declare const EXECUTION: {
    readonly MAX_DEPTH: 5;
    readonly MAX_LOOP_ITER: 1000;
};
export declare const NODE_TYPES: {
    readonly START: "startNode";
    readonly END: "endNode";
    readonly MAPPER: "mapperNode";
    readonly FILTER: "filterNode";
    readonly SWITCH: "floSwitchNode";
    readonly TEMPLATE: "templateNode";
    readonly FUNCTION: "functionNode";
    readonly VAR_STORE: "variableStoreNode";
    readonly PLUG: "plugNode";
    readonly WORKDAY: "workdayNode";
    readonly SALESFORCE: "salesforceNode";
    readonly SAP: "sapNode";
    readonly ORACLE: "oracleNode";
    readonly FIF: "fifNode";
    readonly LOOP: "loopNode";
    readonly SUB_FLO: "subFloNode";
    readonly SUB_FLO_RETURN: "subFloReturnNode";
    readonly INVOKE_SUB_FLO: "invokeSubFloNode";
    readonly EMAIL: "emailNode";
};
export declare const HTTP_METHOD_GET = "GET";
export declare const HTTP_METHOD_POST = "POST";
export declare const HTTP_METHOD_PATCH = "PATH";
export declare const HTTP_METHOD_PUT = "PUT";
export declare const HTTP_METHOD_DELETE = "DELETE";
export declare const HTTP_METHODS: readonly ["GET", "POST", "PUT", "PATH", "DELETE"];
export declare const SCHEMA_TYPES: readonly ["wsdl", "xsd", "openapi"];
export declare const SCHEMA_SOURCE_OPTIONS: {
    value: string;
    label: string;
}[];
export declare const CATEGORIES: string[];
