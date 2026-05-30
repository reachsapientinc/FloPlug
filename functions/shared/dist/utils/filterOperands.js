/**
 * Resolve filter left/right operands and compare with relational operators.
 */
import { looksLikeExpression, safeEvalExpression, } from './floExpression.js';
import { buildEvalContext } from './floRunMeta.js';
import { isFilterCompareOperator } from '../types/filterNode.js';
function getPathValue(root, path) {
    if (!path?.trim())
        return undefined;
    const parts = path.split('.').filter(Boolean);
    let cur = root;
    for (const p of parts) {
        if (cur == null || typeof cur !== 'object')
            return undefined;
        cur = cur[p];
    }
    return cur;
}
/** Infer operand source when migrating legacy filter nodes. */
export function inferFilterOperandSource(expr, explicit) {
    if (explicit)
        return explicit;
    if (looksLikeExpression(expr))
        return 'expression';
    return 'cStream';
}
/** Resolve one side of a filter comparison. */
export function resolveFilterOperand(expr, source, item, store, floRunMeta) {
    const text = expr ?? '';
    const src = source ?? inferFilterOperandSource(text);
    if (src === 'expression' || (src !== 'static' && looksLikeExpression(text))) {
        const ctx = buildEvalContext(item, store, floRunMeta);
        return safeEvalExpression(text, ctx, false);
    }
    if (src === 'static')
        return text;
    if (src === 'local')
        return getPathValue(store?.local ?? {}, text);
    if (src === 'global')
        return getPathValue(store?.global ?? {}, text);
    return getPathValue(item, text);
}
export function compareFilterValues(left, operator, right) {
    switch (operator) {
        case '==': return left == right; // eslint-disable-line eqeqeq
        case '!=': return left != right; // eslint-disable-line eqeqeq
        case '>': return Number(left) > Number(right);
        case '<': return Number(left) < Number(right);
        case '>=': return Number(left) >= Number(right);
        case '<=': return Number(left) <= Number(right);
        default: return false;
    }
}
/** Evaluate a single filter condition (supports legacy contains / expression operator). */
export function evaluateFilterCondition(item, cond, store, floRunMeta) {
    const operator = String(cond.operator ?? '==');
    const fieldExpr = String(cond.field ?? '');
    const valueExpr = String(cond.value ?? '');
    if (operator === 'expression') {
        const ctx = buildEvalContext(item, store, floRunMeta);
        return Boolean(safeEvalExpression(valueExpr, ctx, false));
    }
    const left = resolveFilterOperand(fieldExpr, cond.fieldSource, item, store, floRunMeta);
    const right = resolveFilterOperand(valueExpr, cond.valueSource ?? 'static', item, store, floRunMeta);
    if (operator === 'contains') {
        return String(left ?? '').includes(String(right ?? ''));
    }
    if (operator === 'startsWith') {
        return String(left ?? '').startsWith(String(right ?? ''));
    }
    if (isFilterCompareOperator(operator)) {
        return compareFilterValues(left, operator, right);
    }
    return false;
}
