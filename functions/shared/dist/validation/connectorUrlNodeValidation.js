/**
 * Design-time validation for connector-token URLs on plug / FloAction nodes.
 */
import { findUnresolvedUrlPlaceholders, missingConnectorUrlValues, normalizeKitUrlContext, resolveConnectorUrlPreview, TOKEN_SOURCE_FILL_LOCATION, } from '../utils/connectorUrlTokens.js';
import { bindingValue, extractMustachePlaceholders, extractUrlVariables, nodeLabel, } from './bindings.js';
function previewLegacyPlugUrl(urlPattern, urlVariables) {
    return urlPattern.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
        const b = urlVariables[varName];
        if ((b?.source ?? 'static') === 'static' && bindingValue(b).trim()) {
            return bindingValue(b).trim();
        }
        return `{{${varName}}}`;
    });
}
function buildLayerValuesFromNodeData(tokenDefs, urlVariables) {
    const out = {};
    for (const t of tokenDefs) {
        const b = urlVariables[t.key];
        if ((b?.source ?? 'static') === 'static' && bindingValue(b).trim()) {
            const v = bindingValue(b).trim();
            out[t.key] = v;
            if (t.field)
                out[t.field] = v;
        }
    }
    return out;
}
/** Validate resolved URL for a plug or FloAction node (connector token model and legacy urlPattern). */
export function validateConnectorUrlNode(input) {
    const { nodeId, nodeType, nodeLabel: label, connectionId, urlTokens = [], connection, kit, plugValues, floActionValues, plugNodeValues, floActionNodeValues, legacyUrlPattern, legacyUrlVariables, } = input;
    const issues = [];
    if (!connectionId && urlTokens.length === 0 && !legacyUrlPattern?.trim()) {
        return issues;
    }
    if (urlTokens.length > 0) {
        if (!connectionId)
            return issues;
        const preview = resolveConnectorUrlPreview({
            urlTokens,
            connection,
            kit,
            plugValues,
            floActionValues,
            plugNodeValues,
            floActionNodeValues,
            useSamples: false,
        });
        const unresolved = findUnresolvedUrlPlaceholders(preview);
        if (unresolved.length > 0) {
            issues.push({
                nodeId, nodeType, nodeLabel: label,
                field: 'resolvedUrl',
                code: 'URL_VARIABLE_UNBOUND',
                severity: 'error',
                message: `Resolved URL still contains unresolved segment(s): ${unresolved.join(', ')}. ` +
                    'Check connection, kit, plug/FloAction hub config, and node URL fields.',
            });
            return issues;
        }
        const missing = missingConnectorUrlValues({
            urlTokens,
            connection,
            kit,
            plugValues,
            floActionValues,
            plugNodeValues,
            floActionNodeValues,
        });
        if (missing.length > 0) {
            const bySource = [...new Set(missing.map(t => TOKEN_SOURCE_FILL_LOCATION[t.source]))];
            const names = missing.map(t => t.label ?? t.key).join(', ');
            issues.push({
                nodeId, nodeType, nodeLabel: label,
                field: 'resolvedUrl',
                code: 'URL_VARIABLE_UNBOUND',
                severity: 'error',
                message: `URL cannot be assembled — missing: ${names}. ` +
                    `Configure at: ${bySource.join(', ')}.`,
            });
        }
        return issues;
    }
    const pattern = legacyUrlPattern?.trim() ?? '';
    if (!pattern)
        return issues;
    const urlVars = extractUrlVariables(pattern);
    const bindings = legacyUrlVariables ?? {};
    const preview = previewLegacyPlugUrl(pattern, bindings);
    const unresolved = extractMustachePlaceholders(preview);
    if (unresolved.length > 0) {
        issues.push({
            nodeId, nodeType, nodeLabel: label,
            field: 'urlPattern',
            code: 'URL_VARIABLE_UNBOUND',
            severity: 'error',
            message: `URL pattern still contains unresolved variable(s): ${unresolved.map(v => `{{${v}}}`).join(', ')}. ` +
                'Set static values or map from cStream/global/local before run.',
        });
        return issues;
    }
    for (const varName of urlVars) {
        const b = bindings[varName];
        if (!bindingValue(b).trim()) {
            issues.push({
                nodeId, nodeType, nodeLabel: label,
                field: `urlVariables.${varName}`,
                code: 'URL_VARIABLE_UNBOUND',
                severity: 'error',
                message: `URL variable {{${varName}}} is not configured.`,
            });
        }
    }
    return issues;
}
export function validatePlugNodeConnectorUrl(node, connection) {
    const d = node.data;
    const urlTokens = d.urlTokensSnapshot ?? [];
    const connId = String(d.connectionId ?? '');
    const plugUrlByConn = d.plugUrlValuesByConnection ?? {};
    const plugNodeTokenDefs = d.plugNodeUrlTokens ?? [];
    const urlVariables = (d.urlVariables ?? {});
    return validateConnectorUrlNode({
        nodeId: node.id,
        nodeType: node.type,
        nodeLabel: nodeLabel(d, node.id),
        connectionId: connId,
        connection,
        urlTokens,
        kit: d.kitUrlContext,
        plugValues: plugUrlByConn[connId] ?? {},
        plugNodeValues: buildLayerValuesFromNodeData(plugNodeTokenDefs, urlVariables),
        legacyUrlPattern: String(d.urlPattern ?? ''),
        legacyUrlVariables: urlVariables,
    });
}
export function validateFloActionNodeConnectorUrl(node, connection) {
    const d = node.data;
    const urlTokens = d.urlTokensSnapshot ?? [];
    const connId = String(d.connectionId ?? '');
    const floActionUrlByConn = d.floActionUrlValuesByConnection ?? {};
    const floActionNodeTokenDefs = d.floActionNodeUrlTokens ?? [];
    const urlVariables = (d.urlVariables ?? {});
    const floKitId = String(d.floKitId ?? '');
    const kit = normalizeKitUrlContext(d.kitUrlContext, floKitId, urlTokens);
    return validateConnectorUrlNode({
        nodeId: node.id,
        nodeType: node.type,
        nodeLabel: nodeLabel(d, node.id),
        connectionId: connId,
        connection,
        urlTokens,
        kit,
        floActionValues: floActionUrlByConn[connId] ?? {},
        floActionNodeValues: buildLayerValuesFromNodeData(floActionNodeTokenDefs, urlVariables),
    });
}
