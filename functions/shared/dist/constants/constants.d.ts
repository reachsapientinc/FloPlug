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
};
export declare const SUB_COLLECTIONS: {
    readonly TENANT_TYPES: "TenantTypes";
    readonly AUTH_TYPES: "AuthenticationTypes";
    readonly STORAGE_SETTINGS: "StorageSettings";
    readonly FLOPLUG_ROLES: "FloPlugRoles";
    readonly FLOPLUGHUBROLES: "HubRoles";
    readonly GLOBALLOOKUPS: "GlobalLookUps";
};
export declare const HUB_COLLECTIONS: {
    readonly TENANTS: "Tenants";
    readonly WORKSPACES: "Workspaces";
    readonly FLOWS: "Flows";
    readonly FLOS: "Flos";
    readonly PLUGS: "Plugs";
    readonly USERS: "Users";
    readonly EXEC_LOG: "ExecutionLog";
    readonly CONNECTORS: "ConnectorCredentials";
    readonly EMAIL_LOG: "EmailLog";
    readonly SCHEMAS: "Schemas";
};
export declare const HUB_ROLES: {
    readonly ADMIN: "hub_admin";
    readonly USER: "user";
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
    readonly EMAIL: "emailNode";
};
