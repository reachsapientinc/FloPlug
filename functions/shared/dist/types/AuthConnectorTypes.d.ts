import type { HubPermission } from '../constants/constants.js';
import type { ConnectorUrlToken, ConnectorUrlMode } from '../utils/connectorUrlTokens.js';
export type FieldType = 'text' | 'password' | 'url' | 'textarea' | 'select';
export interface AuthField {
    name: string;
    label: string;
    required: boolean;
    requiresMasking: boolean;
}
export interface AuthType {
    name: string;
    label: string;
    isActive: boolean;
    fields: AuthField[];
}
export type AuthStyle = 'httpBasic' | 'wsseHeader' | 'bearerToken' | 'apiKeyHeader' | 'apiKeyQuery' | 'oauth2ClientCreds';
export interface AuthProtocolField {
    name: string;
    label: string;
    fieldType: FieldType;
    required: boolean;
    requiresMasking: boolean;
    placeholder?: string;
    helpText?: string;
    options?: string[];
}
export interface RuntimeConfig {
    placementType: 'bearer' | 'basic' | 'header' | 'query';
    headerName?: string;
    headerFormat?: string;
    tokenEndpointField?: string;
    staticTokenEndpoint?: string;
    clientIdField?: string;
    clientSecretField?: string;
    usernameField?: string;
    passwordField?: string;
    scopeField?: string;
    authEndpointField?: string;
    redirectUriField?: string;
    issuerField?: string;
    audienceField?: string;
    privateKeyField?: string;
    headerNameField?: string;
    placementField?: string;
    refreshStrategy: 'none' | 'auto' | 'on_expiry';
    assertionLifetime?: number;
    requiresInteractiveSetup?: boolean;
    tokenResponseMapping?: {
        accessToken?: string;
        refreshToken?: string;
        expiresIn?: string;
        tokenType?: string;
    };
}
export interface AuthProtocol {
    name: string;
    label: string;
    description?: string;
    isActive: boolean;
    sortOrder?: number;
    grantType?: string;
    authStyle?: AuthStyle;
    headerName?: string;
    paramName?: string;
    tokenUrl?: string;
    runtimeConfig?: Record<string, any>;
    fields: AuthProtocolField[];
}
export interface ConnectorAuthOverride {
    grantType?: string;
    bodyFormat?: 'form' | 'json';
    extraBodyParams?: Record<string, string>;
    fieldMappings?: Record<string, string>;
    tokenResponseMapping?: {
        accessToken?: string;
        refreshToken?: string;
        expiresIn?: string;
    };
    extraFields?: AuthProtocolField[];
    notes?: string;
}
export interface ConnectorDoc {
    id: string;
    label: string;
    category: string;
    supportedAuthTypes: string[];
    description: string;
    isActive: boolean;
    authOverride?: ConnectorAuthOverride;
    allowActionNodes?: boolean;
    tierControlled?: boolean;
    availableForTiers?: string[];
    /** How this connector builds outbound URLs — none (email), generic HTTP, or segmented vendor API */
    urlMode?: ConnectorUrlMode;
    /** Ordered URL segments — joined with `/` at runtime (see connectorUrlTokens.ts) */
    urlTokens?: ConnectorUrlToken[];
    /** Sample URL captured when product admin confirmed the pattern at save time */
    urlPatternPreview?: string;
}
export type SchemaType = 'wsdl' | 'xsd' | 'openapi' | 'graphql';
export interface ConnectorSchema {
    id: string;
    connectorId: string;
    label: string;
    version: string;
    schemaType: SchemaType;
    storagePath: string;
    isActive: boolean;
    uploadedAt?: Date;
    uploadedBy?: string;
    /** Operations extracted at upload / listSchemaOperations — names only */
    operations?: string[];
    /** Rich metadata per operation (method, path) for OpenAPI and UI */
    operationsMeta?: Array<{
        name: string;
        label: string;
        method?: string;
        endpoint?: string;
    }>;
    operationsParsedAt?: unknown;
    /** Pre-compiled mapper index (JSON in Cloud Storage) — built at upload */
    flattenStoragePath?: string;
    flattenCompiledAt?: unknown;
    /** Product registry key (FloPlugRegistry/GlobalConfig/Registry/sch__...) */
    registryKey?: string;
    /** Set when duplicate schema doc was superseded by canonical registry entry */
    supersededBy?: string;
}
export interface ParsedField {
    path: string;
    label: string;
    xsdType: string;
    required: boolean;
    repeating: boolean;
    /** XSD minOccurs — "0" marks an optional container/element branch */
    minOccurs?: string | number;
    /**
     * Ancestor mapper paths with minOccurs=0 (set at flatten). Used when object rows
     * are missing from a cached flatten index.
     */
    optionalAncestorPaths?: string[];
    enumValues?: string[];
    helpText?: string;
}
export type ActionSchemaSource = 'wsdl' | 'xsd' | 'openapi' | 'graphql' | 'manual';
export interface ActionDoc {
    id: string;
    connectorId: string;
    label: string;
    category: string;
    description?: string;
    isActive: boolean;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    endpoint: string;
    soapAction?: string;
    contentType?: string;
    schemaSource: ActionSchemaSource;
    schemaRef?: string;
    operationName?: string;
    /**
     * inputSchema is populated one of two ways:
     *   - Automatically: resolveActionSchema parses WSDL/XSD and caches here
     *   - Manually: product admin fills it in for simple REST actions
     * For WSDL/XSD actions with hundreds of fields, leave empty and rely on
     * the cache in Actions/{id}/Cache/parsedSchema
     */
    inputSchema?: ParsedField[];
    /** What keys this action writes back into cStream after a successful call */
    outputKeys?: string[];
    /** Body template with {{cStream.field}} placeholders — used by actionEngine */
    bodyTemplate?: string;
    /** Map response paths back to cStream keys */
    responseMapping?: Array<{
        cStreamKey: string;
        responsePath: string;
    }>;
    createdAt?: Date;
    updatedAt?: Date;
    createdBy?: string;
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
export type PermissionCategory = 'plugs' | 'users' | 'flos' | 'logs' | 'settings';
export interface PermissionDoc {
    label: string;
    description: string;
    category: PermissionCategory;
    isActive: boolean;
    sortOrder: number;
}
export interface HubRoleDoc {
    label: string;
    isActive: boolean;
    sortOrder: number;
    permissionIds: HubPermission[];
}
export interface FloPlugRoleDoc {
    label: string;
    isActive: boolean;
    sortOrder: number;
}
export interface ResolvedHubRole extends HubRoleDoc {
    id: string;
    permissions: PermissionDoc[];
}
