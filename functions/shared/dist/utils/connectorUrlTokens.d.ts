/**
 * Connector URL segment builder — ordered tokens joined with `/`.
 * Token keys are generic (urlToken1, urlToken2, …); labels are admin-defined.
 */
import { type UrlTokenVendorProfile } from './connectorUrlTokenHints.js';
export type ConnectorUrlMode = 'none' | 'generic' | 'segmented';
export type ConnectorUrlTokenSource = 'static' | 'connection' | 'kit' | 'plug' | 'plugNode' | 'floAction' | 'floActionNode';
/** @deprecated Legacy storage field names — new tokens use field === key (urlTokenN). */
export type ConnectorUrlConnectionField = 'hostname' | 'tenantKey' | 'baseUrl';
/** @deprecated Legacy storage field names — new tokens use field === key (urlTokenN). */
export type ConnectorUrlKitField = 'serviceModule' | 'serviceVersion';
export interface ConnectorUrlToken {
    /** Generic segment key — urlToken1, urlToken2, … (static rows omit key) */
    key: string;
    /** Primary fill location — kept for backward compatibility; equals sources[0] when sources is set */
    source: ConnectorUrlTokenSource;
    /**
     * Where this segment's value may be captured (multi-select).
     * Example: ['kit', 'plugNode'] — kit default in FloKit, optional override on designer plug node.
     * When omitted, treated as [source].
     */
    sources?: ConnectorUrlTokenSource[];
    /** Literal segment when source === static (slashes allowed inside, e.g. ccx/service) */
    staticValue?: string;
    /** Admin-defined friendly name shown on connection / kit / plug forms */
    label?: string;
    /** Help text on connection / kit / plug setup screens */
    description?: string;
    /** Storage field — defaults to key; legacy docs may still use hostname, tenantKey, etc. */
    field?: string;
}
/** @deprecated Use generic urlToken keys — kept for legacy UI imports only. */
export declare const CONNECTION_URL_FIELDS: {
    value: ConnectorUrlConnectionField;
    label: string;
}[];
/** @deprecated Use generic urlToken keys — kept for legacy UI imports only. */
export declare const KIT_URL_FIELDS: {
    value: ConnectorUrlKitField;
    label: string;
}[];
/** Generic HTTP: fixed scheme + connection API URL (hub admin fills urlToken1 on FloConnection). */
export declare const GENERIC_HTTP_URL_TOKENS: ConnectorUrlToken[];
export declare const GENERIC_HTTP_PREFIX_LENGTH = 2;
/** Display / merge order for multi-select fill locations */
export declare const URL_TOKEN_SOURCE_ORDER: ConnectorUrlTokenSource[];
/** All fill locations for a token (multi-select aware). */
export declare function tokenSources(token: ConnectorUrlToken): ConnectorUrlTokenSource[];
export declare function tokenPrimarySource(token: ConnectorUrlToken): ConnectorUrlTokenSource;
export declare function tokenHasSource(token: ConnectorUrlToken, source: ConnectorUrlTokenSource): boolean;
export declare function normalizeTokenSources(token: ConnectorUrlToken): ConnectorUrlToken;
export declare function defaultUrlModeForCategory(category: string): ConnectorUrlMode;
export declare function resolveConnectorUrlMode(connector: {
    urlMode?: ConnectorUrlMode;
    category?: string;
    urlTokens?: ConnectorUrlToken[];
}): ConnectorUrlMode;
export declare function connectorUrlModeRequiresTokens(mode: ConnectorUrlMode): boolean;
export declare function defaultUrlTokensForMode(mode: ConnectorUrlMode, connector?: {
    label?: string;
    id?: string;
    category?: string;
}): ConnectorUrlToken[];
export declare function emptyConnectorUrlToken(source?: ConnectorUrlTokenSource, context?: {
    tokens?: ConnectorUrlToken[];
    profile?: UrlTokenVendorProfile;
    insertIndex?: number;
}): ConnectorUrlToken;
export declare function emptyPlugNodeUrlToken(tokens?: ConnectorUrlToken[], profile?: UrlTokenVendorProfile): ConnectorUrlToken;
export declare function emptyFloActionNodeUrlToken(tokens?: ConnectorUrlToken[], profile?: UrlTokenVendorProfile): ConnectorUrlToken;
/** Join segments with `/` and normalize scheme (https:/host → https://host). */
export declare function assembleConnectorUrl(tokens: ConnectorUrlToken[], values?: Record<string, string>, useSamples?: boolean, profile?: UrlTokenVendorProfile): string;
export interface ConnectorUrlTokenValidationIssue {
    index: number;
    message: string;
}
export declare function validateConnectorUrlTokens(tokens: ConnectorUrlToken[]): ConnectorUrlTokenValidationIssue[];
/** Generic mode must keep the fixed scheme + connection API URL prefix; extra rows may only be plug path segments. */
export declare function validateConnectorUrlTokensForMode(tokens: ConnectorUrlToken[], mode: ConnectorUrlMode): ConnectorUrlTokenValidationIssue[];
export declare function deriveWorkdayModuleName(label: string): string;
export declare function normalizeWorkdayVersion(raw?: string): string | undefined;
export declare function filterUrlTokensBySource(tokens: ConnectorUrlToken[], source: ConnectorUrlTokenSource): ConnectorUrlToken[];
/** Connection fields to show on FloConnection form — from connector registry only. */
export declare function connectionTokensForConnector(connector?: {
    urlMode?: ConnectorUrlMode;
    urlTokens?: ConnectorUrlToken[];
    category?: string;
} | null): ConnectorUrlToken[];
export declare function kitTokensForConnector(connector?: {
    urlMode?: ConnectorUrlMode;
    urlTokens?: ConnectorUrlToken[];
    category?: string;
} | null): ConnectorUrlToken[];
export declare function plugTokensForConnector(connector?: {
    urlTokens?: ConnectorUrlToken[];
} | null): ConnectorUrlToken[];
export declare function plugNodeTokensForConnector(connector?: {
    urlTokens?: ConnectorUrlToken[];
} | null): ConnectorUrlToken[];
export declare function floActionTokensForConnector(connector?: {
    urlTokens?: ConnectorUrlToken[];
} | null): ConnectorUrlToken[];
export declare function floActionNodeTokensForConnector(connector?: {
    urlTokens?: ConnectorUrlToken[];
} | null): ConnectorUrlToken[];
export interface ConnectionUrlFields {
    /** Primary storage — values keyed by urlToken1, urlToken2, … */
    urlTokenValues?: Record<string, string>;
    /** @deprecated Legacy fields — read for backward compatibility only */
    hostname?: string;
    tenantKey?: string;
    baseUrl?: string;
}
export interface KitUrlContext {
    /** Primary storage — values keyed by urlToken1, urlToken2, … */
    urlTokenValues?: Record<string, string>;
    /** @deprecated Legacy fields — read for backward compatibility only */
    serviceModule?: string;
    serviceVersion?: string;
    schemaLabel?: string;
    schemaVersion?: string;
}
export declare function normalizeKitUrlContext(kit?: KitUrlContext, floKitId?: string, urlTokens?: ConnectorUrlToken[]): KitUrlContext;
/** Build kit URL context from a FloKit doc + connector token registry (hub snapshot / runtime). */
export declare function buildKitUrlContextFromFloKit(kit: {
    name?: string;
    serviceModule?: string;
    serviceVersion?: string;
    servicesSchemaVersion?: string;
    schemaVersion?: string;
    urlTokenValues?: Record<string, string>;
}, floKitId: string, urlTokens?: ConnectorUrlToken[]): KitUrlContext;
/** Resolve connection segment values by token key, with legacy field fallback. */
export declare function resolveConnectionUrlValues(conn: ConnectionUrlFields, tokens?: ConnectorUrlToken[]): Record<string, string>;
/** Resolve kit segment values by token key, with legacy field fallback. */
export declare function resolveKitUrlValues(kit: KitUrlContext, tokens?: ConnectorUrlToken[]): Record<string, string>;
export declare function buildConnectionUrlValues(conn: ConnectionUrlFields, tokens?: ConnectorUrlToken[]): Record<string, string>;
export declare function buildKitUrlValues(kit: KitUrlContext, tokens?: ConnectorUrlToken[]): Record<string, string>;
export declare function buildConnectorUrlValueMap(input: {
    tokens: ConnectorUrlToken[];
    connection?: ConnectionUrlFields;
    kit?: KitUrlContext;
    plugValues?: Record<string, string>;
    floActionValues?: Record<string, string>;
}): Record<string, string>;
/** Append FloAction / relative path to assembled connector base URL. */
export declare function appendEndpointToBaseUrl(baseUrl: string, endpoint: string): string;
/**
 * Assemble outbound URL from connector token registry.
 * Returns null when mode is none, tokens empty, or required values missing.
 */
export declare function resolveUrlFromConnector(input: {
    urlMode?: ConnectorUrlMode;
    category?: string;
    urlTokens?: ConnectorUrlToken[];
    connection?: ConnectionUrlFields;
    kit?: KitUrlContext;
    plugValues?: Record<string, string>;
    floActionValues?: Record<string, string>;
    endpoint?: string;
    connector?: {
        label?: string;
        id?: string;
        category?: string;
    };
}): string | null;
/** Human-readable preview for hub plug admin (connector tokens + sample plug vars). */
export declare function resolveConnectorUrlPreview(input: {
    connector?: {
        urlMode?: ConnectorUrlMode;
        urlTokens?: ConnectorUrlToken[];
        urlPatternPreview?: string;
        category?: string;
        label?: string;
        id?: string;
    } | null;
    urlTokens?: ConnectorUrlToken[];
    connection?: ConnectionUrlFields;
    kit?: KitUrlContext;
    plugValues?: Record<string, string>;
    floActionValues?: Record<string, string>;
    plugNodeValues?: Record<string, string>;
    floActionNodeValues?: Record<string, string>;
    useSamples?: boolean;
}): string;
/** Unresolved `{{mustache}}` or `{segment}` placeholders left in a resolved URL preview. */
export declare function findUnresolvedUrlPlaceholders(url: string): string[];
/** Map unresolved preview placeholder names to connector URL tokens (by label or key). */
export declare function urlTokensForUnresolvedPlaceholders(placeholders: string[], urlTokens: ConnectorUrlToken[]): ConnectorUrlToken[];
/**
 * Unresolved placeholders that must be fixed on the current screen (captureSources).
 * Kit/connection segments configured elsewhere are excluded from blocking errors.
 */
export declare function unresolvedUrlPlaceholdersForCapture(preview: string, urlTokens: ConnectorUrlToken[], captureSources: ConnectorUrlTokenSource[]): string[];
export declare function connectorUrlPreviewIsComplete(url: string): boolean;
/** @deprecated Use resolveConnectorUrlPreview */
export declare function resolvePlugUrlPreview(input: {
    connector?: {
        urlMode?: ConnectorUrlMode;
        urlTokens?: ConnectorUrlToken[];
        category?: string;
        label?: string;
        id?: string;
    } | null;
    connection?: ConnectionUrlFields;
    kit?: KitUrlContext;
    plugValues?: Record<string, string>;
}): string;
/** Build value map using only the requested fill layers (for scoped validation). */
export declare function buildConnectorUrlValuesForLayers(input: {
    tokens: ConnectorUrlToken[];
    layers: ConnectorUrlTokenSource[];
    connection?: ConnectionUrlFields;
    kit?: KitUrlContext;
    plugValues?: Record<string, string>;
    floActionValues?: Record<string, string>;
    plugNodeValues?: Record<string, string>;
    floActionNodeValues?: Record<string, string>;
}): Record<string, string>;
/** Where each token source is configured in the product UI. */
export declare const TOKEN_SOURCE_FILL_LOCATION: Record<ConnectorUrlTokenSource, string>;
/** Human-readable list of fill locations for a token row. */
export declare function formatTokenSources(token: ConnectorUrlToken): string;
/** Tokens whose values are still missing for the given context (non-static only). */
export declare function missingConnectorUrlValues(input: {
    urlTokens: ConnectorUrlToken[];
    connection?: ConnectionUrlFields;
    kit?: KitUrlContext;
    plugValues?: Record<string, string>;
    floActionValues?: Record<string, string>;
    plugNodeValues?: Record<string, string>;
    floActionNodeValues?: Record<string, string>;
    sources?: ConnectorUrlTokenSource[];
}): ConnectorUrlToken[];
/** Human-readable preview for hub plug admin when no connection is selected yet. */
export declare function connectorUrlPreviewForPlug(connector?: {
    urlMode?: ConnectorUrlMode;
    urlTokens?: ConnectorUrlToken[];
    urlPatternPreview?: string;
    category?: string;
    label?: string;
    id?: string;
} | null): string;
export { reassignUrlTokenKeys, resolveUrlTokenVendorProfile, getUrlTokenHintForToken, createEmptyUrlToken, } from './connectorUrlTokenHints.js';
