/**
 * Per-node-type validation rules (structural / design-time).
 */
import { NODE_TYPES } from '../constants/constants.js';
import { bindingValue, extractMustachePlaceholders, extractUrlVariables, nodeLabel, validateBinding, validateEmailStatic, isNonEmptyString, isBindingConfigured, } from './bindings.js';
import { structuralExpressionCheck, validateFloExpression, } from '../utils/floExpression.js';
import { validateConditionRowsParentheses } from '../utils/conditionRows.js';
import { validateFloActionNodeConnectorUrl, validatePlugNodeConnectorUrl, } from './connectorUrlNodeValidation.js';
const FLO_ACTION_NODE = 'floActionNode';
function refMissing(node, field, refType, refId, exists) {
    if (exists !== false)
        return null;
    const d = node.data;
    return {
        nodeId: node.id,
        nodeType: node.type,
        nodeLabel: nodeLabel(d, node.id),
        field,
        code: 'REFERENCE_MISSING',
        severity: 'error',
        message: `${refType} "${refId}" no longer exists — update or remove this node.`,
    };
}
function refInactive(node, field, refType, refId) {
    const d = node.data;
    return {
        nodeId: node.id,
        nodeType: node.type,
        nodeLabel: nodeLabel(d, node.id),
        field,
        code: 'REFERENCE_INACTIVE',
        severity: 'error',
        message: `${refType} "${refId}" is inactive.`,
    };
}
function hasResource(ctx, kind, id) {
    if (!ctx || !id)
        return undefined;
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
function isActiveResource(ctx, kind, id) {
    if (!ctx || !id)
        return undefined;
    if (kind === 'plug')
        return ctx.activePlugIds?.has(id);
    return ctx.activeConnectionIds?.has(id);
}
export function validateNode(node, resources, checkResources = false) {
    const d = node.data;
    const label = nodeLabel(d, node.id);
    const issues = [];
    let metrics;
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
            }
            else if (checkResources) {
                const miss = refMissing(node, 'plugId', 'Plug', plugId, hasResource(resources, 'plug', plugId));
                if (miss)
                    issues.push(miss);
                else if (isActiveResource(resources, 'plug', plugId) === false) {
                    const inactive = refInactive(node, 'plugId', 'Plug', plugId);
                    if (inactive)
                        issues.push(inactive);
                }
            }
            const isEmail = d.authProtocol === 'smtp_basic' || d.nodeType === 'emailNode' || node.type === NODE_TYPES.EMAIL;
            if (isEmail) {
                const bindings = (d.emailBindings ?? {});
                // At least one recipient — To, CC, or BCC (BCC-only sends are valid)
                const recipientFields = [
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
                    if (!isBindingConfigured(b))
                        continue;
                    if ((b?.source ?? 'static') === 'static' && bindingValue(b)) {
                        issues.push(...validateEmailStatic(node.id, node.type, label, `emailBindings.${key}`, fl, bindingValue(b)));
                    }
                    else if ((b?.source ?? 'static') !== 'static' && (b?.source ?? 'static') !== 'literal') {
                        issues.push(...validateBinding(node.id, node.type, label, `emailBindings.${key}`, fl, b, true));
                    }
                }
                issues.push(...validateBinding(node.id, node.type, label, 'emailBindings.subject', 'Subject', bindings.subject, true));
                const bodyBinding = bindings.body;
                const bodyVal = bindingValue(bodyBinding).trim();
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
                }
                else if (!bodyVal) {
                    issues.push({
                        nodeId: node.id, nodeType: node.type, nodeLabel: label,
                        field: 'emailBindings.body', code: 'REQUIRED_BINDING_MISSING', severity: 'warning',
                        message: 'Email body is empty.',
                    });
                }
            }
            else {
                const urlPattern = String(d.urlPattern ?? '');
                const urlVars = extractUrlVariables(urlPattern);
                const urlVariables = (d.urlVariables ?? {});
                for (const varName of urlVars) {
                    issues.push(...validateBinding(node.id, node.type, label, `urlVariables.${varName}`, `URL variable {{${varName}}}`, urlVariables[varName], true));
                }
            }
            if (!isEmail) {
                const plugPolicy = plugId ? resources?.plugConnectionPolicy?.[plugId] : undefined;
                const policyAllowed = plugPolicy?.allowedConnectionIds ?? [];
                const effectiveAllowed = policyAllowed.length > 0
                    ? policyAllowed
                    : (d.allowedConnectionIds ?? []);
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
                }
                else if (checkResources) {
                    const miss = refMissing(node, 'connectionId', 'Connection', connId, hasResource(resources, 'connection', connId));
                    if (miss)
                        issues.push(miss);
                    else if (isActiveResource(resources, 'connection', connId) === false) {
                        const inactive = refInactive(node, 'connectionId', 'Connection', connId);
                        if (inactive)
                            issues.push(inactive);
                    }
                }
                if (connId && effectiveAllowed.length > 0 && !effectiveAllowed.includes(connId)) {
                    issues.push({
                        nodeId: node.id, nodeType: node.type, nodeLabel: label,
                        field: 'connectionId', code: 'REFERENCE_MISSING', severity: 'error',
                        message: `Connection "${connId}" is not allowed for this plug.`,
                    });
                }
                const connFields = connId ? resources?.connectionsById?.[connId] : undefined;
                issues.push(...validatePlugNodeConnectorUrl(node, connFields));
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
            }
            else {
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
            const rows = d.conditionRows;
            if (Array.isArray(rows) && rows.length > 0) {
                const paren = validateConditionRowsParentheses(rows);
                if (!paren.ok) {
                    issues.push({
                        nodeId: node.id, nodeType: node.type, nodeLabel: label,
                        field: 'conditionRows', code: 'PAREN_MISMATCH', severity: 'error',
                        message: paren.message ?? 'Parentheses do not balance.',
                    });
                }
                break;
            }
            const op = String(d.operator ?? '');
            const isLegacyExpr = op === 'expression';
            if (!isLegacyExpr && !isNonEmptyString(d.field)) {
                issues.push({
                    nodeId: node.id, nodeType: node.type, nodeLabel: label,
                    field: 'field', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
                    message: 'Filter left side (field) is required.',
                });
            }
            if (!isNonEmptyString(d.operator)) {
                issues.push({
                    nodeId: node.id, nodeType: node.type, nodeLabel: label,
                    field: 'operator', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
                    message: 'Filter operator is required.',
                });
            }
            if (!isLegacyExpr && !isNonEmptyString(d.value)) {
                issues.push({
                    nodeId: node.id, nodeType: node.type, nodeLabel: label,
                    field: 'value', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
                    message: 'Filter right side (compare value) is required.',
                });
            }
            const fieldSrc = String(d.fieldSource ?? '');
            const valueSrc = String(d.valueSource ?? '');
            const fieldVal = String(d.field ?? '');
            const valueVal = String(d.value ?? '');
            if ((fieldSrc === 'expression' || (fieldVal && structuralExpressionCheck(fieldVal)))
                && fieldVal.trim()) {
                const parsed = validateFloExpression(fieldVal);
                if (!parsed.ok) {
                    issues.push({
                        nodeId: node.id, nodeType: node.type, nodeLabel: label,
                        field: 'field', code: 'EXPRESSION_INVALID', severity: 'error',
                        message: parsed.message ?? 'Invalid expression on left side.',
                    });
                }
            }
            if ((valueSrc === 'expression' || (valueVal && structuralExpressionCheck(valueVal)))
                && valueVal.trim()) {
                const parsed = validateFloExpression(valueVal);
                if (!parsed.ok) {
                    issues.push({
                        nodeId: node.id, nodeType: node.type, nodeLabel: label,
                        field: 'value', code: 'EXPRESSION_INVALID', severity: 'error',
                        message: parsed.message ?? 'Invalid expression on right side.',
                    });
                }
            }
            if (isLegacyExpr && valueVal.trim()) {
                const parsed = validateFloExpression(valueVal);
                if (!parsed.ok) {
                    issues.push({
                        nodeId: node.id, nodeType: node.type, nodeLabel: label,
                        field: 'value', code: 'EXPRESSION_INVALID', severity: 'error',
                        message: parsed.message ?? 'Invalid boolean expression.',
                    });
                }
            }
            break;
        }
        case NODE_TYPES.SWITCH: {
            const branches = d.branches ?? [];
            if (branches.length === 0) {
                issues.push({
                    nodeId: node.id, nodeType: node.type, nodeLabel: label,
                    field: 'branches', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
                    message: 'FloSwitch needs at least one route branch.',
                });
            }
            for (const br of branches) {
                if (!br.label?.trim()) {
                    issues.push({
                        nodeId: node.id, nodeType: node.type, nodeLabel: label,
                        field: `branches.${br.id}.label`, code: 'REQUIRED_FIELD_MISSING', severity: 'error',
                        message: 'Each switch route needs a label.',
                    });
                }
                const paren = validateConditionRowsParentheses(br.conditionRows ?? []);
                if (!paren.ok) {
                    issues.push({
                        nodeId: node.id, nodeType: node.type, nodeLabel: label,
                        field: `branches.${br.id}.conditionRows`, code: 'PAREN_MISMATCH', severity: 'error',
                        message: `Route "${br.label}": ${paren.message ?? 'Parentheses do not balance.'}`,
                    });
                }
            }
            break;
        }
        case NODE_TYPES.FIF: {
            const subFloId = String(d.selectedFloId ?? '');
            if (!subFloId) {
                issues.push({
                    nodeId: node.id, nodeType: node.type, nodeLabel: label,
                    field: 'selectedFloId', code: 'SUB_FLO_NOT_SELECTED', severity: 'error',
                    message: 'Sub-flow is not selected.',
                });
            }
            else if (checkResources) {
                const miss = refMissing(node, 'selectedFloId', 'Flo', subFloId, hasResource(resources, 'flo', subFloId));
                if (miss)
                    issues.push(miss);
            }
            break;
        }
        case NODE_TYPES.LOOP: {
            if (!isNonEmptyString(d.continueExpr)) {
                issues.push({
                    nodeId: node.id, nodeType: node.type, nodeLabel: label,
                    field: 'continueExpr', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
                    message: 'Loop continue expression is required.',
                });
            }
            else {
                const exprCheck = validateFloExpression(String(d.continueExpr));
                if (!exprCheck.ok) {
                    issues.push({
                        nodeId: node.id, nodeType: node.type, nodeLabel: label,
                        field: 'continueExpr', code: 'EXPRESSION_INVALID', severity: 'error',
                        message: exprCheck.message ?? 'Invalid continue expression.',
                    });
                }
            }
            const max = Number(d.maxIterations ?? 100);
            if (!Number.isFinite(max) || max < 1 || max > 500) {
                issues.push({
                    nodeId: node.id, nodeType: node.type, nodeLabel: label,
                    field: 'maxIterations', code: 'INVALID_VALUE', severity: 'error',
                    message: 'Max iterations must be between 1 and 500.',
                });
            }
            const ot = String(d.outputTarget ?? 'cStream');
            if (ot === 'local' || ot === 'global') {
                if (!isNonEmptyString(d.outputVarName)) {
                    issues.push({
                        nodeId: node.id, nodeType: node.type, nodeLabel: label,
                        field: 'outputVarName', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
                        message: 'Variable name is required when output target is local or global.',
                    });
                }
            }
            break;
        }
        case NODE_TYPES.SUB_FLO: {
            const displayName = String(d.displayName ?? d.canvasName ?? '').trim();
            if (!displayName) {
                issues.push({
                    nodeId: node.id, nodeType: node.type, nodeLabel: label,
                    field: 'displayName', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
                    message: 'SubFlo canvas display name is required (shown in InvokeSubFlo dropdown).',
                });
            }
            const inputs = d.inputArgs ?? [];
            const returns = d.returnArgs ?? [];
            const inputNames = new Set();
            for (const arg of inputs) {
                if (!isNonEmptyString(arg.name)) {
                    issues.push({
                        nodeId: node.id, nodeType: node.type, nodeLabel: label,
                        field: 'inputArgs', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
                        message: 'Each SubFlo input argument needs a name.',
                    });
                }
                else if (inputNames.has(arg.name.trim())) {
                    issues.push({
                        nodeId: node.id, nodeType: node.type, nodeLabel: label,
                        field: 'inputArgs', code: 'DUPLICATE_NAME', severity: 'error',
                        message: `Duplicate SubFlo input name "${arg.name}".`,
                    });
                }
                else {
                    inputNames.add(arg.name.trim());
                }
            }
            const returnNames = new Set();
            for (const arg of returns) {
                if (!isNonEmptyString(arg.name)) {
                    issues.push({
                        nodeId: node.id, nodeType: node.type, nodeLabel: label,
                        field: 'returnArgs', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
                        message: 'Each SubFlo return argument needs a name.',
                    });
                }
                else if (returnNames.has(arg.name.trim())) {
                    issues.push({
                        nodeId: node.id, nodeType: node.type, nodeLabel: label,
                        field: 'returnArgs', code: 'DUPLICATE_NAME', severity: 'error',
                        message: `Duplicate SubFlo return name "${arg.name}".`,
                    });
                }
                else {
                    returnNames.add(arg.name.trim());
                }
            }
            break;
        }
        case NODE_TYPES.SUB_FLO_RETURN: {
            const bindings = d.returnBindings ?? [];
            if (bindings.length === 0) {
                issues.push({
                    nodeId: node.id, nodeType: node.type, nodeLabel: label,
                    field: 'returnBindings', code: 'REQUIRED_FIELD_MISSING', severity: 'warning',
                    message: 'SubFloReturn has no return bindings.',
                });
            }
            for (const b of bindings) {
                if (!isNonEmptyString(b.argName) || !isNonEmptyString(b.value)) {
                    issues.push({
                        nodeId: node.id, nodeType: node.type, nodeLabel: label,
                        field: 'returnBindings', code: 'REQUIRED_FIELD_MISSING', severity: 'error',
                        message: 'Each return binding needs an argument name and value/path.',
                    });
                }
            }
            break;
        }
        case NODE_TYPES.INVOKE_SUB_FLO: {
            const target = String(d.targetSubFloId ?? '');
            if (!target) {
                issues.push({
                    nodeId: node.id, nodeType: node.type, nodeLabel: label,
                    field: 'targetSubFloId', code: 'SUB_FLO_NOT_SELECTED', severity: 'error',
                    message: 'Select a SubFlo to invoke.',
                });
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
            const mappings = d.mappings;
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
            const rows = d.rows;
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
            const rules = (d.mappingRules ?? []);
            const configuredActions = d.actionIds ?? [];
            const allowedConnections = d.allowedConnectionIds ?? [];
            if (!actionId || !floKitId) {
                issues.push({
                    nodeId: node.id, nodeType: node.type, nodeLabel: label,
                    field: 'actionId', code: 'ACTION_NOT_CONFIGURED', severity: 'error',
                    message: 'FloAction: select an action and FloKit.',
                });
            }
            else if (configuredActions.length > 0 && !configuredActions.includes(actionId)) {
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
            }
            else if (checkResources) {
                const miss = refMissing(node, 'connectionId', 'Connection', connectionId, hasResource(resources, 'connection', connectionId));
                if (miss)
                    issues.push(miss);
                else if (isActiveResource(resources, 'connection', connectionId) === false) {
                    const inactive = refInactive(node, 'connectionId', 'Connection', connectionId);
                    if (inactive)
                        issues.push(inactive);
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
            if (connectionId) {
                const connFields = resources?.connectionsById?.[connectionId];
                issues.push(...validateFloActionNodeConnectorUrl(node, connFields));
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
export function snapshotForNode(node, issues, metrics) {
    const nodeIssues = issues.filter(i => i.nodeId === node.id);
    const hasError = nodeIssues.some(i => i.severity === 'error');
    return {
        nodeId: node.id,
        nodeType: node.type,
        nodeLabel: nodeLabel(node.data, node.id),
        valid: !hasError,
        issues: nodeIssues,
        metrics,
    };
}
