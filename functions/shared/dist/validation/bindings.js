/**
 * Shared binding / placeholder validation helpers.
 */
import { validateFloExpression, structuralExpressionCheck } from '../utils/floExpression.js';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isNonEmptyString(v) {
    return typeof v === 'string' && v.trim().length > 0;
}
export function bindingValue(binding) {
    if (!binding)
        return '';
    if (binding.source === 'literal')
        return binding.literalValue ?? binding.value ?? '';
    return binding.value ?? '';
}
/** True when a binding has a non-empty static value or variable path. */
export function isBindingConfigured(binding) {
    return bindingValue(binding).trim().length > 0;
}
export function validateBinding(nodeId, nodeType, nodeLabel, field, label, binding, required) {
    const issues = [];
    const source = (binding?.source ?? 'static');
    const val = bindingValue(binding).trim();
    if (!required)
        return issues;
    if (source === 'static' || source === 'literal') {
        if (!val) {
            issues.push({
                nodeId, nodeType, nodeLabel, field,
                code: 'REQUIRED_BINDING_MISSING',
                severity: 'error',
                message: `${label} is required (static value is empty).`,
            });
        }
        return issues;
    }
    if (!val) {
        issues.push({
            nodeId, nodeType, nodeLabel, field,
            code: 'REQUIRED_BINDING_MISSING',
            severity: 'error',
            message: source === 'expression'
                ? `${label} is required — enter a FloExpression.`
                : `${label} is required — set a ${source} path.`,
        });
        return issues;
    }
    if (source === 'expression') {
        const structural = structuralExpressionCheck(val);
        if (structural) {
            issues.push({
                nodeId, nodeType, nodeLabel, field,
                code: 'EXPRESSION_INVALID', severity: 'error',
                message: `${label}: ${structural}`,
            });
            return issues;
        }
        const parsed = validateFloExpression(val);
        if (!parsed.ok) {
            issues.push({
                nodeId, nodeType, nodeLabel, field,
                code: 'EXPRESSION_INVALID', severity: 'error',
                message: `${label}: ${parsed.message}`,
            });
        }
    }
    return issues;
}
export function validateEmailStatic(nodeId, nodeType, nodeLabel, field, label, raw) {
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    const bad = parts.filter(p => !EMAIL_RE.test(p));
    if (bad.length === 0)
        return [];
    return [{
            nodeId, nodeType, nodeLabel, field,
            code: 'REQUIRED_BINDING_MISSING',
            severity: 'error',
            message: `${label}: invalid email address(es): ${bad.join(', ')}`,
        }];
}
/** Extract {{var}} placeholders from template / URL pattern. */
export function extractMustachePlaceholders(text) {
    const out = [];
    const re = /\{\{([^}]+)\}\}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const t = m[1].trim();
        if (t && !out.includes(t))
            out.push(t);
    }
    return out;
}
/** Extract {{word}} URL variables (plug urlPattern style). */
export function extractUrlVariables(urlPattern) {
    const out = [];
    const re = /\{\{(\w+)\}\}/g;
    let m;
    while ((m = re.exec(urlPattern)) !== null) {
        if (!out.includes(m[1]))
            out.push(m[1]);
    }
    return out;
}
export function nodeLabel(data, fallback) {
    return String(data.displayName ?? data.flaLabel ?? data.floActionName ?? data.plugName ?? data.label ?? fallback);
}
/** Canvas card title — custom display name overrides palette label. */
export function nodeDisplayTitle(data, defaultTitle) {
    const custom = data.displayName;
    if (typeof custom === 'string' && custom.trim())
        return custom.trim();
    return defaultTitle;
}
