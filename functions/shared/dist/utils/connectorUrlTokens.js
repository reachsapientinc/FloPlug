/**
 * Connector URL segment builder — ordered tokens joined with `/`.
 * Token keys are generic (urlToken1, urlToken2, …); labels are admin-defined.
 */
import { createEmptyUrlToken, previewSampleForToken, reassignUrlTokenKeys, resolveUrlTokenVendorProfile, } from './connectorUrlTokenHints.js';
/** @deprecated Use generic urlToken keys — kept for legacy UI imports only. */
export const CONNECTION_URL_FIELDS = [
    { value: 'hostname', label: 'Hostname' },
    { value: 'tenantKey', label: 'Tenant ID' },
    { value: 'baseUrl', label: 'Base URL' },
];
/** @deprecated Use generic urlToken keys — kept for legacy UI imports only. */
export const KIT_URL_FIELDS = [
    { value: 'serviceModule', label: 'Service module' },
    { value: 'serviceVersion', label: 'API version' },
];
/** Generic HTTP: fixed scheme + connection API URL (hub admin fills urlToken1 on FloConnection). */
export const GENERIC_HTTP_URL_TOKENS = [
    { key: '', source: 'static', staticValue: 'https:' },
    {
        key: 'urlToken1',
        source: 'connection',
        field: 'urlToken1',
        label: 'API URL',
        description: 'Host and optional path without scheme — e.g. api.example.com/v2',
    },
];
export const GENERIC_HTTP_PREFIX_LENGTH = 2;
/** Display / merge order for multi-select fill locations */
export const URL_TOKEN_SOURCE_ORDER = [
    'static', 'connection', 'kit', 'plug', 'floAction', 'plugNode', 'floActionNode',
];
/** All fill locations for a token (multi-select aware). */
export function tokenSources(token) {
    if (token.source === 'static')
        return ['static'];
    const list = token.sources?.length ? [...token.sources] : [token.source];
    return list.sort((a, b) => URL_TOKEN_SOURCE_ORDER.indexOf(a) - URL_TOKEN_SOURCE_ORDER.indexOf(b));
}
export function tokenPrimarySource(token) {
    return tokenSources(token)[0] ?? token.source;
}
export function tokenHasSource(token, source) {
    return tokenSources(token).includes(source);
}
export function normalizeTokenSources(token) {
    if (token.source === 'static') {
        return { ...token, sources: undefined };
    }
    const sources = tokenSources(token);
    return { ...token, sources, source: sources[0] ?? token.source };
}
export function defaultUrlModeForCategory(category) {
    if (category === 'Email')
        return 'none';
    if (category === 'Custom')
        return 'generic';
    return 'segmented';
}
export function resolveConnectorUrlMode(connector) {
    if (connector.urlMode)
        return connector.urlMode;
    if (connector.category === 'Email')
        return 'none';
    if (connector.urlTokens?.length)
        return 'segmented';
    return defaultUrlModeForCategory(connector.category ?? '');
}
export function connectorUrlModeRequiresTokens(mode) {
    return mode === 'generic' || mode === 'segmented';
}
export function defaultUrlTokensForMode(mode, connector) {
    if (mode === 'generic') {
        return reassignUrlTokenKeys(GENERIC_HTTP_URL_TOKENS.map(t => ({ ...t })));
    }
    return [];
}
const LEGACY_PREVIEW_SAMPLES = {
    hostname: 'wd2-impl-services1.workday.com',
    tenantKey: 'sees10',
    tenant: 'sees10',
    baseUrl: 'api.example.com/v2',
    url: 'api.example.com/v2',
    serviceModule: 'Resource_Management',
    module: 'Resource_Management',
    serviceVersion: 'v46.1',
    version: 'v46.1',
};
export function emptyConnectorUrlToken(source = 'static', context) {
    if (context?.tokens) {
        return createEmptyUrlToken(source, context.tokens, context.profile ?? 'generic', context.insertIndex);
    }
    if (source === 'static') {
        return { key: '', source: 'static', staticValue: '' };
    }
    return createEmptyUrlToken(source, [], 'generic');
}
export function emptyPlugNodeUrlToken(tokens = [], profile = 'generic') {
    return createEmptyUrlToken('plugNode', tokens, profile);
}
export function emptyFloActionNodeUrlToken(tokens = [], profile = 'generic') {
    return createEmptyUrlToken('floActionNode', tokens, profile);
}
/** Join segments with `/` and normalize scheme (https:/host → https://host). */
export function assembleConnectorUrl(tokens, values = {}, useSamples = true, profile) {
    const vendorProfile = profile ?? 'generic';
    const parts = tokens
        .map(t => segmentValue(t, values, useSamples, vendorProfile, tokens))
        .filter(p => p.length > 0);
    if (parts.length === 0)
        return '';
    let url = parts.join('/');
    url = url.replace(/^(https?):\/(?!\/)/i, '$1://');
    url = url.replace(/([^:])\/{2,}/g, '$1/');
    return url;
}
function segmentValue(token, values, useSamples, profile, allTokens) {
    if (token.source === 'static') {
        return (token.staticValue ?? '').trim();
    }
    const field = token.field ?? token.key;
    const label = token.label?.trim();
    const fromValues = values[field] ?? values[token.key] ?? (label ? values[label] : undefined);
    if (fromValues?.trim())
        return fromValues.trim();
    if (useSamples) {
        const sample = previewSampleForToken(profile, token, allTokens)
            ?? LEGACY_PREVIEW_SAMPLES[field]
            ?? LEGACY_PREVIEW_SAMPLES[token.key];
        if (sample)
            return sample;
    }
    const placeholder = label || token.key || field || 'segment';
    return `{${placeholder}}`;
}
export function validateConnectorUrlTokens(tokens) {
    const issues = [];
    const seenKeys = new Set();
    tokens.forEach((t, index) => {
        if (t.source === 'static') {
            if (!t.staticValue?.trim()) {
                issues.push({ index, message: 'Static segment value is required.' });
            }
            return;
        }
        const key = t.key?.trim();
        if (!key) {
            issues.push({ index, message: 'Token key is required for non-static segments.' });
        }
        else if (seenKeys.has(key)) {
            issues.push({ index, message: `Duplicate token key "${key}" in URL pattern.` });
        }
        else {
            seenKeys.add(key);
        }
        if (!t.label?.trim()) {
            issues.push({ index, message: 'Label is required (shown on connection/kit/plug forms).' });
        }
        const fillSources = tokenSources(t).filter(s => s !== 'static');
        if (fillSources.length === 0) {
            issues.push({ index, message: 'Select at least one fill location for this segment.' });
        }
    });
    return issues;
}
/** Generic mode must keep the fixed scheme + connection API URL prefix; extra rows may only be plug path segments. */
export function validateConnectorUrlTokensForMode(tokens, mode) {
    if (mode === 'none')
        return [];
    if (mode === 'generic') {
        const issues = [];
        const prefix = GENERIC_HTTP_URL_TOKENS;
        for (let i = 0; i < prefix.length; i++) {
            const expected = prefix[i];
            const actual = tokens[i];
            if (!actual) {
                issues.push({ index: i, message: 'Generic HTTP requires https: + connection API URL rows.' });
                continue;
            }
            if (actual.source !== expected.source) {
                issues.push({ index: i, message: 'Generic HTTP prefix rows cannot be changed.' });
            }
            if (expected.source === 'static' && actual.staticValue?.trim() !== expected.staticValue) {
                issues.push({ index: i, message: 'Scheme must remain https:.' });
            }
            if (expected.source === 'connection' && actual.source !== 'connection') {
                issues.push({ index: i, message: 'Second row must be a connection segment (API URL).' });
            }
        }
        tokens.slice(GENERIC_HTTP_PREFIX_LENGTH).forEach((t, offset) => {
            const index = offset + GENERIC_HTTP_PREFIX_LENGTH;
            const plugLike = new Set(['plug', 'plugNode', 'floAction', 'floActionNode']);
            if (!tokenSources(t).some(s => plugLike.has(s))) {
                issues.push({ index, message: 'Only plug / plug-node / FloAction / FloAction-node path segments may be added after the base URL.' });
            }
        });
        return [...issues, ...validateConnectorUrlTokens(tokens)];
    }
    return validateConnectorUrlTokens(tokens);
}
// ── Runtime URL assembly (connection + kit + plug → segment values) ───────────
export function deriveWorkdayModuleName(label) {
    const withoutVersion = label.replace(/\s+v?\d+(\.\d+)*\s*$/i, '').trim();
    return withoutVersion.replace(/\s+/g, '_');
}
export function normalizeWorkdayVersion(raw) {
    if (!raw?.trim())
        return undefined;
    const t = raw.trim();
    return /^v/i.test(t) ? t : `v${t}`;
}
export function filterUrlTokensBySource(tokens, source) {
    return tokens.filter(t => tokenHasSource(t, source));
}
/** Connection fields to show on FloConnection form — from connector registry only. */
export function connectionTokensForConnector(connector) {
    const mode = resolveConnectorUrlMode(connector ?? {});
    if (mode === 'none')
        return [];
    const fromTokens = filterUrlTokensBySource(connector?.urlTokens ?? [], 'connection');
    if (fromTokens.length > 0)
        return fromTokens;
    if (mode === 'generic') {
        return filterUrlTokensBySource(GENERIC_HTTP_URL_TOKENS, 'connection');
    }
    return [];
}
export function kitTokensForConnector(connector) {
    const mode = resolveConnectorUrlMode(connector ?? {});
    if (mode === 'none' || mode === 'generic')
        return [];
    return filterUrlTokensBySource(connector?.urlTokens ?? [], 'kit');
}
export function plugTokensForConnector(connector) {
    return filterUrlTokensBySource(connector?.urlTokens ?? [], 'plug');
}
export function plugNodeTokensForConnector(connector) {
    return filterUrlTokensBySource(connector?.urlTokens ?? [], 'plugNode');
}
export function floActionTokensForConnector(connector) {
    return filterUrlTokensBySource(connector?.urlTokens ?? [], 'floAction');
}
export function floActionNodeTokensForConnector(connector) {
    return filterUrlTokensBySource(connector?.urlTokens ?? [], 'floActionNode');
}
/**
 * Fill kit URL fields from schema label / version when hub snapshot is partial.
 * Used on FloAction designer nodes where kitUrlContext may only carry schemaLabel.
 */
/** Map connector / admin token field or label to kit storage keys. */
function normalizeKitFieldAlias(field) {
    const f = field.trim();
    const lower = f.toLowerCase();
    if (lower === 'module' || f === 'Module')
        return 'serviceModule';
    if (lower === 'version' || f === 'Version')
        return 'serviceVersion';
    return f;
}
export function normalizeKitUrlContext(kit, floKitId, urlTokens) {
    const base = kit ?? {};
    const schemaLabel = base.schemaLabel?.trim() || floKitId?.trim() || '';
    const schemaVersion = base.schemaVersion?.trim();
    const serviceModule = base.serviceModule?.trim()
        || (schemaLabel ? deriveWorkdayModuleName(schemaLabel) : '');
    const serviceVersion = base.serviceVersion?.trim()
        || normalizeWorkdayVersion(schemaVersion)
        || '';
    const normalized = {
        ...base,
        ...(schemaLabel ? { schemaLabel } : {}),
        ...(serviceModule ? { serviceModule } : {}),
        ...(serviceVersion ? { serviceVersion } : {}),
        urlTokenValues: { ...(base.urlTokenValues ?? {}) },
    };
    if (urlTokens?.length) {
        const built = buildKitUrlValues(normalized, urlTokens);
        const urlTokenValues = { ...normalized.urlTokenValues, ...built };
        for (const t of urlTokens) {
            if (!tokenHasSource(t, 'kit'))
                continue;
            const key = t.key?.trim();
            if (!key)
                continue;
            const val = built[key] ?? built[t.field ?? ''] ?? built[t.label ?? ''];
            if (!val?.trim())
                continue;
            urlTokenValues[key] = val;
            const field = t.field?.trim();
            if (field)
                urlTokenValues[field] = val;
            const label = t.label?.trim();
            if (label)
                urlTokenValues[label] = val;
            const alias = normalizeKitFieldAlias(field || label || key);
            if (alias !== field && alias !== label)
                urlTokenValues[alias] = val;
        }
        return {
            ...normalized,
            urlTokenValues,
            serviceModule: normalized.serviceModule || built.serviceModule || built.module,
            serviceVersion: normalized.serviceVersion || built.serviceVersion || built.version,
        };
    }
    return normalized;
}
/** Build kit URL context from a FloKit doc + connector token registry (hub snapshot / runtime). */
export function buildKitUrlContextFromFloKit(kit, floKitId, urlTokens) {
    return normalizeKitUrlContext({
        urlTokenValues: kit.urlTokenValues,
        serviceModule: kit.serviceModule,
        serviceVersion: kit.serviceVersion,
        schemaLabel: kit.name ?? floKitId,
        schemaVersion: kit.servicesSchemaVersion ?? kit.schemaVersion,
    }, floKitId, urlTokens);
}
function legacyConnectionFieldValue(conn, field) {
    if (field === 'hostname' || field === 'host')
        return conn.hostname?.trim() ?? '';
    if (field === 'tenantKey' || field === 'tenant')
        return conn.tenantKey?.trim() ?? '';
    if (field === 'baseUrl' || field === 'url')
        return conn.baseUrl?.trim() ?? '';
    return conn.urlTokenValues?.[field]?.trim() ?? '';
}
/** Resolve connection segment values by token key, with legacy field fallback. */
export function resolveConnectionUrlValues(conn, tokens) {
    const values = { ...(conn.urlTokenValues ?? {}) };
    if (tokens?.length) {
        for (const t of tokens) {
            if (!tokenHasSource(t, 'connection'))
                continue;
            const key = t.key?.trim();
            if (!key)
                continue;
            if (!values[key]?.trim()) {
                const legacy = legacyConnectionFieldValue(conn, t.field ?? t.key);
                if (legacy)
                    values[key] = legacy;
            }
        }
        return values;
    }
    const hostname = conn.hostname?.trim();
    const tenantKey = conn.tenantKey?.trim();
    const baseUrl = conn.baseUrl?.trim();
    if (hostname)
        values.hostname = hostname;
    if (tenantKey) {
        values.tenantKey = tenantKey;
        values.tenant = tenantKey;
    }
    if (baseUrl) {
        values.baseUrl = baseUrl;
        values.url = baseUrl;
    }
    return values;
}
function legacyKitFieldValue(kit, field) {
    const alias = normalizeKitFieldAlias(field);
    const fromTokens = kit.urlTokenValues?.[field]?.trim()
        ?? kit.urlTokenValues?.[alias]?.trim();
    if (fromTokens)
        return fromTokens;
    if (alias === 'serviceModule' || field === 'module') {
        return kit.serviceModule?.trim()
            || (kit.schemaLabel ? deriveWorkdayModuleName(kit.schemaLabel) : '');
    }
    if (alias === 'serviceVersion' || field === 'version') {
        return kit.serviceVersion?.trim()
            || normalizeWorkdayVersion(kit.schemaVersion)
            || '';
    }
    return '';
}
/** Resolve kit segment values by token key, with legacy field fallback. */
export function resolveKitUrlValues(kit, tokens) {
    const values = { ...(kit.urlTokenValues ?? {}) };
    if (tokens?.length) {
        for (const t of tokens) {
            if (!tokenHasSource(t, 'kit'))
                continue;
            const key = t.key?.trim();
            if (!key)
                continue;
            if (!values[key]?.trim()) {
                const legacy = legacyKitFieldValue(kit, t.field ?? t.key);
                if (legacy)
                    values[key] = legacy;
            }
            const label = t.label?.trim();
            if (label && values[key]?.trim() && !values[label]?.trim()) {
                values[label] = values[key];
            }
        }
        return values;
    }
    const module = kit.serviceModule?.trim()
        || (kit.schemaLabel ? deriveWorkdayModuleName(kit.schemaLabel) : '');
    const version = kit.serviceVersion?.trim()
        || normalizeWorkdayVersion(kit.schemaVersion)
        || '';
    if (module) {
        values.serviceModule = module;
        values.module = module;
    }
    if (version) {
        values.serviceVersion = version;
        values.version = version;
    }
    return values;
}
export function buildConnectionUrlValues(conn, tokens) {
    const values = resolveConnectionUrlValues(conn, tokens);
    const out = { ...values };
    const hostname = conn.hostname?.trim();
    const tenantKey = conn.tenantKey?.trim();
    const baseUrl = conn.baseUrl?.trim();
    if (hostname && !out.hostname)
        out.hostname = hostname;
    if (tenantKey) {
        if (!out.tenantKey)
            out.tenantKey = tenantKey;
        if (!out.tenant)
            out.tenant = tenantKey;
    }
    if (baseUrl) {
        if (!out.baseUrl)
            out.baseUrl = baseUrl;
        if (!out.url)
            out.url = baseUrl;
    }
    return out;
}
export function buildKitUrlValues(kit, tokens) {
    const values = resolveKitUrlValues(kit, tokens);
    const out = { ...values };
    const module = kit.serviceModule?.trim()
        || (kit.schemaLabel ? deriveWorkdayModuleName(kit.schemaLabel) : '');
    const version = kit.serviceVersion?.trim()
        || normalizeWorkdayVersion(kit.schemaVersion)
        || '';
    if (module) {
        if (!out.serviceModule)
            out.serviceModule = module;
        if (!out.module)
            out.module = module;
    }
    if (version) {
        if (!out.serviceVersion)
            out.serviceVersion = version;
        if (!out.version)
            out.version = version;
    }
    return out;
}
export function buildConnectorUrlValueMap(input) {
    return {
        ...buildConnectionUrlValues(input.connection ?? {}, input.tokens),
        ...buildKitUrlValues(input.kit ?? {}, input.tokens),
        ...(input.plugValues ?? {}),
        ...(input.floActionValues ?? {}),
    };
}
/** Append FloAction / relative path to assembled connector base URL. */
export function appendEndpointToBaseUrl(baseUrl, endpoint) {
    const base = baseUrl.trim().replace(/\/+$/, '');
    const ep = endpoint.trim();
    if (!ep || ep === '/')
        return base;
    if (/^https?:\/\//i.test(ep))
        return ep;
    const path = ep.startsWith('/') ? ep : `/${ep}`;
    return `${base}${path}`;
}
/**
 * Assemble outbound URL from connector token registry.
 * Returns null when mode is none, tokens empty, or required values missing.
 */
export function resolveUrlFromConnector(input) {
    const mode = resolveConnectorUrlMode(input);
    if (mode === 'none')
        return null;
    const tokens = input.urlTokens ?? [];
    if (tokens.length === 0)
        return null;
    const values = buildConnectorUrlValueMap({
        tokens,
        connection: input.connection,
        kit: input.kit,
        plugValues: input.plugValues,
        floActionValues: input.floActionValues,
    });
    const assembled = assembleConnectorUrl(tokens, values, false);
    if (!assembled || assembled.includes('{'))
        return null;
    const endpoint = (input.endpoint ?? '').trim();
    if (endpoint && endpoint !== '/') {
        return appendEndpointToBaseUrl(assembled, endpoint);
    }
    return assembled;
}
/** Human-readable preview for hub plug admin (connector tokens + sample plug vars). */
export function resolveConnectorUrlPreview(input) {
    const tokens = input.urlTokens ?? input.connector?.urlTokens ?? [];
    if (tokens.length === 0) {
        if (input.connector)
            return connectorUrlPreviewForPlug(input.connector);
        return '';
    }
    const profile = resolveUrlTokenVendorProfile(input.connector);
    const values = {
        ...buildConnectorUrlValueMap({
            tokens,
            connection: input.connection,
            kit: input.kit,
            plugValues: input.plugValues,
            floActionValues: input.floActionValues,
        }),
        ...(input.plugNodeValues ?? {}),
        ...(input.floActionNodeValues ?? {}),
    };
    return assembleConnectorUrl(tokens, values, input.useSamples ?? false, profile);
}
/** Unresolved `{{mustache}}` or `{segment}` placeholders left in a resolved URL preview. */
export function findUnresolvedUrlPlaceholders(url) {
    const text = url?.trim() ?? '';
    if (!text)
        return [];
    const out = [];
    const mustacheRe = /\{\{([^}]+)\}\}/g;
    let m;
    while ((m = mustacheRe.exec(text)) !== null) {
        const name = m[1].trim();
        if (name && !out.includes(name))
            out.push(name);
    }
    const segmentRe = /\{([^{}/][^}]*)\}/g;
    while ((m = segmentRe.exec(text)) !== null) {
        const name = m[1].trim();
        if (name && !out.includes(name))
            out.push(name);
    }
    return out;
}
/** Map unresolved preview placeholder names to connector URL tokens (by label or key). */
export function urlTokensForUnresolvedPlaceholders(placeholders, urlTokens) {
    if (!placeholders.length || !urlTokens.length)
        return [];
    const out = [];
    for (const name of placeholders) {
        const token = urlTokens.find(t => (t.label?.trim() === name) || (t.key?.trim() === name));
        if (token && !out.includes(token))
            out.push(token);
    }
    return out;
}
/**
 * Unresolved placeholders that must be fixed on the current screen (captureSources).
 * Kit/connection segments configured elsewhere are excluded from blocking errors.
 */
export function unresolvedUrlPlaceholdersForCapture(preview, urlTokens, captureSources) {
    const all = findUnresolvedUrlPlaceholders(preview);
    if (!captureSources.length || !urlTokens.length)
        return all;
    const tokens = urlTokensForUnresolvedPlaceholders(all, urlTokens);
    const blocking = new Set();
    for (const name of all) {
        const token = tokens.find(t => (t.label?.trim() === name) || (t.key?.trim() === name));
        if (!token) {
            blocking.add(name);
            continue;
        }
        if (captureSources.some(s => tokenHasSource(token, s))) {
            blocking.add(name);
        }
    }
    return [...blocking];
}
export function connectorUrlPreviewIsComplete(url) {
    return findUnresolvedUrlPlaceholders(url).length === 0;
}
/** @deprecated Use resolveConnectorUrlPreview */
export function resolvePlugUrlPreview(input) {
    return resolveConnectorUrlPreview(input);
}
/** Build value map using only the requested fill layers (for scoped validation). */
export function buildConnectorUrlValuesForLayers(input) {
    const { layers, tokens } = input;
    const out = {};
    const merge = (chunk) => {
        for (const [k, v] of Object.entries(chunk)) {
            if (v?.trim())
                out[k] = v.trim();
        }
    };
    if (layers.includes('connection'))
        merge(buildConnectionUrlValues(input.connection ?? {}, tokens));
    if (layers.includes('kit'))
        merge(buildKitUrlValues(input.kit ?? {}, tokens));
    if (layers.includes('plug'))
        merge(input.plugValues ?? {});
    if (layers.includes('floAction'))
        merge(input.floActionValues ?? {});
    if (layers.includes('plugNode'))
        merge(input.plugNodeValues ?? {});
    if (layers.includes('floActionNode'))
        merge(input.floActionNodeValues ?? {});
    return out;
}
/** Where each token source is configured in the product UI. */
export const TOKEN_SOURCE_FILL_LOCATION = {
    static: 'Connector Registry',
    connection: 'FloConnection',
    kit: 'FloKit definition',
    plug: 'Hub plug definition',
    plugNode: 'Designer plug node',
    floAction: 'Hub FloAction definition',
    floActionNode: 'Designer FloAction node',
};
/** Human-readable list of fill locations for a token row. */
export function formatTokenSources(token) {
    return tokenSources(token)
        .filter(s => s !== 'static')
        .map(s => TOKEN_SOURCE_FILL_LOCATION[s])
        .join(', ');
}
function tokenValuePresent(token, values) {
    if (token.source === 'static')
        return !!(token.staticValue?.trim());
    const field = token.field ?? token.key;
    return !!(values[field]?.trim() || values[token.key]?.trim());
}
/** Tokens whose values are still missing for the given context (non-static only). */
export function missingConnectorUrlValues(input) {
    const scopeSources = input.sources ?? ['connection', 'kit', 'plug', 'plugNode', 'floAction', 'floActionNode'];
    const scopedValidation = input.sources != null;
    const fullValues = {
        ...buildConnectorUrlValueMap({
            tokens: input.urlTokens,
            connection: input.connection,
            kit: input.kit,
            plugValues: input.plugValues,
            floActionValues: input.floActionValues,
        }),
        ...(input.plugNodeValues ?? {}),
        ...(input.floActionNodeValues ?? {}),
    };
    const values = scopedValidation
        ? buildConnectorUrlValuesForLayers({
            tokens: input.urlTokens,
            layers: scopeSources,
            connection: input.connection,
            kit: input.kit,
            plugValues: input.plugValues,
            floActionValues: input.floActionValues,
            plugNodeValues: input.plugNodeValues,
            floActionNodeValues: input.floActionNodeValues,
        })
        : fullValues;
    return input.urlTokens.filter(t => {
        if (tokenPrimarySource(t) === 'static')
            return false;
        if (!scopeSources.some(s => tokenHasSource(t, s)))
            return false;
        return !tokenValuePresent(t, values);
    });
}
/** Human-readable preview for hub plug admin when no connection is selected yet. */
export function connectorUrlPreviewForPlug(connector) {
    if (!connector)
        return '';
    const mode = resolveConnectorUrlMode(connector);
    if (mode === 'none')
        return '';
    if (connector.urlPatternPreview?.trim())
        return connector.urlPatternPreview.trim();
    const tokens = connector.urlTokens ?? [];
    if (tokens.length === 0)
        return '';
    const profile = resolveUrlTokenVendorProfile(connector);
    return assembleConnectorUrl(tokens, {}, true, profile);
}
export { reassignUrlTokenKeys, resolveUrlTokenVendorProfile, getUrlTokenHintForToken, createEmptyUrlToken, } from './connectorUrlTokenHints.js';
