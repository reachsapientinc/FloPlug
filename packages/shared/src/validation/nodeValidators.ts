/**
 * Per-node-type validation rules (structural / design-time).
 */

import { NODE_TYPES } from '../constants/constants.js';
import type { FloNode } from '../types/nodeTypes.js';
import type {
  FloValidationIssue,
  FloValidationResourceContext,
  FloNodeValidationSnapshot,
} from '../types/floValidation.js';
import {
  bindingValue,
  extractMustachePlaceholders,
  extractUrlVariables,
  nodeLabel,
  validateBinding,
  validateEmailStatic,
  isNonEmptyString,
  isBindingConfigured,
  type VariableBinding,
} from './bindings.js';

/** Email plug bindings may carry attachment metadata on the body field. */
interface EmailBinding extends VariableBinding {
  asAttachment?: boolean;
  fileName?:     string;
  contentType?:  string;
}

const FLO_ACTION_NODE = 'floActionNode';

interface MappingRuleLike {
  targetField?: string;
  sourceType?:   string;
  sourceField?:  string;
}

function refMissing(
  node: FloNode, field: string, refType: string, refId: string,
  exists: boolean | undefined,
): FloValidationIssue | null {
  if (exists !== false) return null;
  const d = node.data;
  return {
    nodeId:     node.id,
    nodeType:   node.type,
    nodeLabel:  nodeLabel(d, node.id),
    field,
    code:       'REFERENCE_MISSING',
    severity:   'error',
    message:    `${refType} "${refId}" no longer exists — update or remove this node.`,
  };
}

function refInactive(
  node: FloNode, field: string, refType: string, refId: string,
): FloValidationIssue | null {
  const d = node.data;
  return {
    nodeId:     node.id,
    nodeType:   node.type,
    nodeLabel:  nodeLabel(d, node.id),
    field,
    code:       'REFERENCE_INACTIVE',
    severity:   'error',
    message:    `${refType} "${refId}" is inactive.`,
  };
}

function hasResource(
  ctx: FloValidationResourceContext | undefined,
  kind: 'plug' | 'connection' | 'flo',
  id: string,
): boolean | undefined {
  if (!ctx || !id) return undefined;
  switch (kind) {
    case 'plug':
      return ctx.plugIds?.has(id);
    case 'connection':
      return ctx.connectionIds?.has(id);
    case 'flo':
      return ctx.floIds?.has(id);
    default:
      return undefined;
  }
}

function isActiveResource(
  ctx: FloValidationResourceContext | undefined,
  kind: 'plug' | 'connection',
  id: string,
): boolean | undefined {
  if (!ctx || !id) return undefined;
  if (kind === 'plug') return ctx.activePlugIds?.has(id);
  return ctx.activeConnectionIds?.has(id);
}

export function validateNode(
  node:      FloNode,
  resources?: FloValidationResourceContext,
  checkResources = false,
): { issues: FloValidationIssue[]; metrics?: Record<string, unknown> } {
  const d = node.data as Record<string, unknown>;
  const label = nodeLabel(d, node.id);
  const issues: FloValidationIssue[] = [];
  let metrics: Record<string, unknown> | undefined;

  switch (node.type) {
    case NODE_TYPES.START:
      break;

    case NODE_TYPES.END:
      break;

    case NODE_TYPES.PLUG:
    case NODE_TYPES.EMAIL: {
      const plugId = String(d.plugId ?? '');
      if (!plugId) {
        issues.push({
          nodeId: node.id, nodeType: node.type, nodeLabel: label,
          field: 'plugId', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
          message: 'Plug is not selected.',
        });
      } else if (checkResources) {
        const miss = refMissing(node, 'plugId', 'Plug', plugId, hasResource(resources, 'plug', plugId));
        if (miss) issues.push(miss);
        else if (isActiveResource(resources, 'plug', plugId) === false) {
          const inactive = refInactive(node, 'plugId', 'Plug', plugId);
          if (inactive) issues.push(inactive);
        }
      }

      const isEmail = d.authProtocol === 'smtp_basic' || d.nodeType === 'emailNode' || node.type === NODE_TYPES.EMAIL;
      if (isEmail) {
        const bindings = (d.emailBindings ?? {}) as Record<string, EmailBinding>;

        // At least one recipient — To, CC, or BCC (BCC-only sends are valid)
        const recipientFields: { key: string; label: string }[] = [
          { key: 'to', label: 'To' },
          { key: 'cc', label: 'CC' },
          { key: 'bcc', label: 'BCC' },
        ];
        const hasRecipient = recipientFields.some(({ key }) => isBindingConfigured(bindings[key]));
        if (!hasRecipient) {
          issues.push({
            nodeId: node.id, nodeType: node.type, nodeLabel: label,
            field: 'emailBindings.to', code: 'REQUIRED_BINDING_MISSING', severity: 'error',
            message: 'At least one recipient is required (To, CC, or BCC).',
          });
        }

        for (const { key, label: fl } of recipientFields) {
          const b = bindings[key];
          if (!isBindingConfigured(b)) continue;
          if ((b?.source ?? 'static') === 'static' && bindingValue(b)) {
            issues.push(...validateEmailStatic(node.id, node.type, label, `emailBindings.${key}`, fl, bindingValue(b)));
          } else if ((b?.source ?? 'static') !== 'static' && (b?.source ?? 'static') !== 'literal') {
            issues.push(...validateBinding(node.id, node.type, label, `emailBindings.${key}`, fl, b, true));
          }
        }

        issues.push(...validateBinding(
          node.id, node.type, label, 'emailBindings.subject', 'Subject', bindings.subject, true,
        ));

        const bodyBinding = bindings.body;
        const bodyVal      = bindingValue(bodyBinding).trim();
        const isAttachment = bodyBinding?.asAttachment === true;

        if (isAttachment) {
          if (!bodyVal) {
            issues.push({
              nodeId: node.id, nodeType: node.type, nodeLabel: label,
              field: 'emailBindings.body', code: 'REQUIRED_BINDING_MISSING', severity: 'warning',
              message: 'Attachment body source path is empty.',
            });
          }
          if (!isNonEmptyString(bodyBinding?.fileName)) {
            issues.push({
              nodeId: node.id, nodeType: node.type, nodeLabel: label,
              field: 'emailBindings.body.fileName', code: 'REQUIRED_BINDING_MISSING', severity: 'warning',
              message: 'Attachment file name is required.',
            });
          }
        } else if (!bodyVal) {
          issues.push({
            nodeId: node.id, nodeType: node.type, nodeLabel: label,
            field: 'emailBindings.body', code: 'REQUIRED_BINDING_MISSING', severity: 'warning',
            message: 'Email body is empty.',
          });
        }
      } else {
        const urlPattern = String(d.urlPattern ?? '');
        const urlVars = extractUrlVariables(urlPattern);
        const urlVariables = (d.urlVariables ?? {}) as Record<string, VariableBinding>;
        for (const varName of urlVars) {
          issues.push(...validateBinding(
            node.id, node.type, label, `urlVariables.${varName}`, `URL variable {{${varName}}}`,
            urlVariables[varName], true,
          ));
        }
      }

      if (!isEmail) {
        const plugPolicy = plugId ? resources?.plugConnectionPolicy?.[plugId] : undefined;
        const policyAllowed = plugPolicy?.allowedConnectionIds ?? [];
        const effectiveAllowed = policyAllowed.length > 0
          ? policyAllowed
          : ((d.allowedConnectionIds as string[]) ?? []);

        if (plugPolicy && policyAllowed.length === 0) {
          issues.push({
            nodeId: node.id, nodeType: node.type, nodeLabel: label,
            field: 'plugId', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
            message: 'Plug has no allowed connections — configure connections in Hub Admin → Plugs.',
          });
        }

        const connId = String(d.connectionId ?? '');
        if (!connId) {
          issues.push({
            nodeId: node.id, nodeType: node.type, nodeLabel: label,
            field: 'connectionId', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
            message: 'Connection is required — select one in the inspector.',
          });
        } else if (checkResources) {
          const miss = refMissing(node, 'connectionId', 'Connection', connId, hasResource(resources, 'connection', connId));
          if (miss) issues.push(miss);
          else if (isActiveResource(resources, 'connection', connId) === false) {
            const inactive = refInactive(node, 'connectionId', 'Connection', connId);
            if (inactive) issues.push(inactive);
          }
        }
        if (connId && effectiveAllowed.length > 0 && !effectiveAllowed.includes(connId)) {
          issues.push({
            nodeId: node.id, nodeType: node.type, nodeLabel: label,
            field: 'connectionId', code: 'REFERENCE_MISSING', severity: 'error',
            message: `Connection "${connId}" is not allowed for this plug.`,
          });
        }
      }
      break;
    }

    case NODE_TYPES.TEMPLATE: {
      const template = String(d.template ?? '');
      if (!template.trim()) {
        issues.push({
          nodeId: node.id, nodeType: node.type, nodeLabel: label,
          field: 'template', code: 'EMPTY_TEMPLATE', severity: 'error',
          message: 'Template body is empty.',
        });
      } else {
        const placeholders = extractMustachePlaceholders(template);
        if (placeholders.length === 0 && template.includes('{{')) {
          issues.push({
            nodeId: node.id, nodeType: node.type, nodeLabel: label,
            field: 'template', code: 'TEMPLATE_PLACEHOLDER_UNBOUND', severity: 'warning',
            message: 'Template contains malformed {{ }} placeholders.',
          });
        }
        for (const ph of placeholders) {
          if (!ph || ph === '}}') {
            issues.push({
              nodeId: node.id, nodeType: node.type, nodeLabel: label,
              field: 'template', code: 'TEMPLATE_PLACEHOLDER_UNBOUND', severity: 'warning',
              message: `Empty placeholder in template.`,
            });
          }
        }
      }
      if (d.outputMode === 'store' && !isNonEmptyString(d.storeName)) {
        issues.push({
          nodeId: node.id, nodeType: node.type, nodeLabel: label,
          field: 'storeName', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
          message: 'Store variable name is required when output mode is "store".',
        });
      }
      break;
    }

    case NODE_TYPES.FILTER: {
      if (!isNonEmptyString(d.field)) {
        issues.push({
          nodeId: node.id, nodeType: node.type, nodeLabel: label,
          field: 'field', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
          message: 'Filter field path is required.',
        });
      }
      if (!isNonEmptyString(d.operator)) {
        issues.push({
          nodeId: node.id, nodeType: node.type, nodeLabel: label,
          field: 'operator', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
          message: 'Filter operator is required.',
        });
      }
      const op = String(d.operator ?? '');
      if (op && !['exists', 'not_exists', 'is_empty', 'is_not_empty'].includes(op) && !isNonEmptyString(d.value)) {
        issues.push({
          nodeId: node.id, nodeType: node.type, nodeLabel: label,
          field: 'value', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
          message: 'Filter value is required for this operator.',
        });
      }
      break;
    }

    case NODE_TYPES.FIF:
    case NODE_TYPES.LOOP: {
      const floField = node.type === NODE_TYPES.LOOP ? 'bodyFloId' : 'selectedFloId';
      const subFloId = String(d[floField] ?? '');
      if (!subFloId) {
        issues.push({
          nodeId: node.id, nodeType: node.type, nodeLabel: label,
          field: floField, code: 'SUB_FLO_NOT_SELECTED', severity: 'error',
          message: 'Sub-flow is not selected.',
        });
      } else if (checkResources) {
        const miss = refMissing(node, floField, 'Flo', subFloId, hasResource(resources, 'flo', subFloId));
        if (miss) issues.push(miss);
      }
      if (node.type === NODE_TYPES.LOOP) {
        const mode = String(d.mode ?? 'array');
        if (mode === 'array' && !isNonEmptyString(d.arrayPath)) {
          issues.push({
            nodeId: node.id, nodeType: node.type, nodeLabel: label,
            field: 'arrayPath', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
            message: 'Array path is required for array loop mode.',
          });
        }
        if (mode === 'expression' && !isNonEmptyString(d.expression)) {
          issues.push({
            nodeId: node.id, nodeType: node.type, nodeLabel: label,
            field: 'expression', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
            message: 'Loop expression is required.',
          });
        }
      }
      break;
    }

    case NODE_TYPES.FUNCTION: {
      const code = String(d.code ?? '');
      if (!code.trim() || code.includes('// your code here')) {
        issues.push({
          nodeId: node.id, nodeType: node.type, nodeLabel: label,
          field: 'code', code: 'REQUIRED_FIELD_MISSING', severity: 'warning',
          message: 'Function code is empty or still placeholder.',
        });
      }
      break;
    }

    case NODE_TYPES.MAPPER: {
      const mappings = d.mappings as string[] | undefined;
      if (!mappings?.length) {
        issues.push({
          nodeId: node.id, nodeType: node.type, nodeLabel: label,
          field: 'mappings', code: 'MAPPING_INCOMPLETE', severity: 'warning',
          message: 'Mapper has no field mappings.',
        });
      }
      break;
    }

    case NODE_TYPES.VAR_STORE: {
      const rows = d.rows as { key?: string }[] | undefined;
      if (!rows?.some(r => isNonEmptyString(r.key))) {
        issues.push({
          nodeId: node.id, nodeType: node.type, nodeLabel: label,
          field: 'rows', code: 'REQUIRED_FIELD_MISSING', severity: 'warning',
          message: 'Variable store has no keys defined.',
        });
      }
      break;
    }

    case FLO_ACTION_NODE: {
      const actionId = String(d.actionId ?? '');
      const connectionId = String(d.connectionId ?? '');
      const floKitId = String(d.floKitId ?? '');
      const rules = (d.mappingRules ?? []) as MappingRuleLike[];

      const configuredActions = (d.actionIds as string[]) ?? [];
      const allowedConnections = (d.allowedConnectionIds as string[]) ?? [];

      if (!actionId || !floKitId) {
        issues.push({
          nodeId: node.id, nodeType: node.type, nodeLabel: label,
          field: 'actionId', code: 'ACTION_NOT_CONFIGURED', severity: 'error',
          message: 'FloAction: select an action and FloKit.',
        });
      } else if (configuredActions.length > 0 && !configuredActions.includes(actionId)) {
        issues.push({
          nodeId: node.id, nodeType: node.type, nodeLabel: label,
          field: 'actionId', code: 'REFERENCE_MISSING', severity: 'error',
          message: `Action "${actionId}" is not in the hub-enabled actions for this node.`,
        });
      }
      if (!connectionId) {
        issues.push({
          nodeId: node.id, nodeType: node.type, nodeLabel: label,
          field: 'connectionId', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
          message: 'FloAction: connection is required.',
        });
      } else if (checkResources) {
        const miss = refMissing(node, 'connectionId', 'Connection', connectionId, hasResource(resources, 'connection', connectionId));
        if (miss) issues.push(miss);
        else if (isActiveResource(resources, 'connection', connectionId) === false) {
          const inactive = refInactive(node, 'connectionId', 'Connection', connectionId);
          if (inactive) issues.push(inactive);
        }
      }
      if (connectionId && allowedConnections.length > 0 && !allowedConnections.includes(connectionId)) {
        issues.push({
          nodeId: node.id, nodeType: node.type, nodeLabel: label,
          field: 'connectionId', code: 'REFERENCE_MISSING', severity: 'error',
          message: `Connection "${connectionId}" is not allowed for this FloAction node.`,
        });
      }

      if (rules.length === 0) {
        issues.push({
          nodeId: node.id, nodeType: node.type, nodeLabel: label,
          field: 'mappingRules', code: 'MAPPING_INCOMPLETE', severity: 'error',
          message: 'FloAction: at least one explicit mapping rule is required before publish.',
        });
      }

      metrics = {
        mappingRuleCount: rules.length,
        actionId,
        connectionId,
      };
      break;
    }

    default:
      break;
  }

  return { issues, metrics };
}

export function snapshotForNode(
  node: FloNode,
  issues: FloValidationIssue[],
  metrics?: Record<string, unknown>,
): FloNodeValidationSnapshot {
  const nodeIssues = issues.filter(i => i.nodeId === node.id);
  const hasError = nodeIssues.some(i => i.severity === 'error');
  return {
    nodeId:    node.id,
    nodeType:  node.type,
    nodeLabel: nodeLabel(node.data as Record<string, unknown>, node.id),
    valid:     !hasError,
    issues:    nodeIssues,
    metrics,
  };
}
