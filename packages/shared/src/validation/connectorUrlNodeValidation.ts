/**
 * Design-time validation for connector-token URLs on plug / FloAction nodes.
 */

import type { ConnectorUrlToken } from '../utils/connectorUrlTokens.js';
import {
  findUnresolvedUrlPlaceholders,
  missingConnectorUrlValues,
  normalizeKitUrlContext,
  resolveConnectorUrlPreview,
  TOKEN_SOURCE_FILL_LOCATION,
  type ConnectionUrlFields,
  type KitUrlContext,
} from '../utils/connectorUrlTokens.js';
import type { FloValidationIssue } from '../types/floValidation.js';
import type { FloNode } from '../types/nodeTypes.js';
import {
  bindingValue,
  extractMustachePlaceholders,
  extractUrlVariables,
  nodeLabel,
  type VariableBinding,
} from './bindings.js';

export interface ConnectorUrlNodeValidationInput {
  nodeId:               string;
  nodeType:             string;
  nodeLabel:            string;
  connectionId:         string;
  connection?:          ConnectionUrlFields;
  urlTokens?:           ConnectorUrlToken[];
  kit?:                 KitUrlContext;
  plugValues?:          Record<string, string>;
  floActionValues?:     Record<string, string>;
  plugNodeValues?:      Record<string, string>;
  floActionNodeValues?: Record<string, string>;
  /** Legacy plug urlPattern with {{var}} bindings */
  legacyUrlPattern?:    string;
  legacyUrlVariables?:  Record<string, VariableBinding>;
}

function previewLegacyPlugUrl(
  urlPattern: string,
  urlVariables: Record<string, VariableBinding>,
): string {
  return urlPattern.replace(/\{\{(\w+)\}\}/g, (_, varName: string) => {
    const b = urlVariables[varName];
    if ((b?.source ?? 'static') === 'static' && bindingValue(b).trim()) {
      return bindingValue(b).trim();
    }
    return `{{${varName}}}`;
  });
}

function buildLayerValuesFromNodeData(
  tokenDefs: { key: string; field?: string }[],
  urlVariables: Record<string, VariableBinding>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of tokenDefs) {
    const b = urlVariables[t.key];
    if ((b?.source ?? 'static') === 'static' && bindingValue(b).trim()) {
      const v = bindingValue(b).trim();
      out[t.key] = v;
      if (t.field) out[t.field] = v;
    }
  }
  return out;
}

/** Validate resolved URL for a plug or FloAction node (connector token model and legacy urlPattern). */
export function validateConnectorUrlNode(
  input: ConnectorUrlNodeValidationInput,
): FloValidationIssue[] {
  const {
    nodeId, nodeType, nodeLabel: label, connectionId,
    urlTokens = [], connection, kit,
    plugValues, floActionValues, plugNodeValues, floActionNodeValues,
    legacyUrlPattern, legacyUrlVariables,
  } = input;

  const issues: FloValidationIssue[] = [];
  if (!connectionId && urlTokens.length === 0 && !legacyUrlPattern?.trim()) {
    return issues;
  }

  if (urlTokens.length > 0) {
    if (!connectionId) return issues;

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
        message:
          `Resolved URL still contains unresolved segment(s): ${unresolved.join(', ')}. ` +
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
        message:
          `URL cannot be assembled — missing: ${names}. ` +
          `Configure at: ${bySource.join(', ')}.`,
      });
    }
    return issues;
  }

  const pattern = legacyUrlPattern?.trim() ?? '';
  if (!pattern) return issues;

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
      message:
        `URL pattern still contains unresolved variable(s): ${unresolved.map(v => `{{${v}}}`).join(', ')}. ` +
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

export function validatePlugNodeConnectorUrl(
  node: FloNode,
  connection?: ConnectionUrlFields,
): FloValidationIssue[] {
  const d = node.data as Record<string, unknown>;
  const urlTokens = (d.urlTokensSnapshot as ConnectorUrlToken[] | undefined) ?? [];
  const connId = String(d.connectionId ?? '');
  const plugUrlByConn = (d.plugUrlValuesByConnection as Record<string, Record<string, string>> | undefined) ?? {};
  const plugNodeTokenDefs = (d.plugNodeUrlTokens as { key: string; field?: string }[] | undefined) ?? [];
  const urlVariables = (d.urlVariables ?? {}) as Record<string, VariableBinding>;

  return validateConnectorUrlNode({
    nodeId:    node.id,
    nodeType:  node.type,
    nodeLabel: nodeLabel(d, node.id),
    connectionId: connId,
    connection,
    urlTokens,
    kit: (d.kitUrlContext as KitUrlContext | undefined),
    plugValues: plugUrlByConn[connId] ?? {},
    plugNodeValues: buildLayerValuesFromNodeData(plugNodeTokenDefs, urlVariables),
    legacyUrlPattern: String(d.urlPattern ?? ''),
    legacyUrlVariables: urlVariables,
  });
}

export function validateFloActionNodeConnectorUrl(
  node: FloNode,
  connection?: ConnectionUrlFields,
): FloValidationIssue[] {
  const d = node.data as Record<string, unknown>;
  const urlTokens = (d.urlTokensSnapshot as ConnectorUrlToken[] | undefined) ?? [];
  const connId = String(d.connectionId ?? '');
  const floActionUrlByConn = (d.floActionUrlValuesByConnection as Record<string, Record<string, string>> | undefined) ?? {};
  const floActionNodeTokenDefs = (d.floActionNodeUrlTokens as { key: string; field?: string }[] | undefined) ?? [];
  const urlVariables = (d.urlVariables ?? {}) as Record<string, VariableBinding>;

  const floKitId = String(d.floKitId ?? '');
  const kit = normalizeKitUrlContext(
    d.kitUrlContext as KitUrlContext | undefined,
    floKitId,
    urlTokens,
  );

  return validateConnectorUrlNode({
    nodeId:    node.id,
    nodeType:  node.type,
    nodeLabel: nodeLabel(d, node.id),
    connectionId: connId,
    connection,
    urlTokens,
    kit,
    floActionValues: floActionUrlByConn[connId] ?? {},
    floActionNodeValues: buildLayerValuesFromNodeData(floActionNodeTokenDefs, urlVariables),
  });
}
