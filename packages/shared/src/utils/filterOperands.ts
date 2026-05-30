/**
 * Resolve filter left/right operands and compare with relational operators.
 */

import {
  looksLikeExpression,
  safeEvalExpression,
} from './floExpression.js';
import { buildEvalContext } from './floRunMeta.js';
import type { FloRunMeta } from '../types/floRunMeta.js';
import type { FilterCompareOperator, FilterOperandSource } from '../types/filterNode.js';
import { isFilterCompareOperator, isFilterLegacyOperator } from '../types/filterNode.js';

export interface FilterEvalStore {
  local?:  Record<string, unknown>;
  global?: Record<string, unknown>;
}

function getPathValue(root: unknown, path: string): unknown {
  if (!path?.trim()) return undefined;
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Infer operand source when migrating legacy filter nodes. */
export function inferFilterOperandSource(
  expr: string,
  explicit?: FilterOperandSource,
): FilterOperandSource {
  if (explicit) return explicit;
  if (looksLikeExpression(expr)) return 'expression';
  return 'cStream';
}

/** Resolve one side of a filter comparison. */
export function resolveFilterOperand(
  expr: string,
  source: FilterOperandSource | undefined,
  item: Record<string, unknown>,
  store?: FilterEvalStore,
  floRunMeta?: Readonly<FloRunMeta>,
): unknown {
  const text = expr ?? '';
  const src = source ?? inferFilterOperandSource(text);

  if (src === 'expression' || (src !== 'static' && looksLikeExpression(text))) {
    const ctx = buildEvalContext(item, store, floRunMeta);
    return safeEvalExpression(text, ctx, false);
  }
  if (src === 'static') return text;
  if (src === 'local') return getPathValue(store?.local ?? {}, text);
  if (src === 'global') return getPathValue(store?.global ?? {}, text);
  return getPathValue(item, text);
}

export function compareFilterValues(
  left: unknown,
  operator: FilterCompareOperator,
  right: unknown,
): boolean {
  switch (operator) {
    case '==':  return left == right; // eslint-disable-line eqeqeq
    case '!=':  return left != right; // eslint-disable-line eqeqeq
    case '>':   return Number(left) > Number(right);
    case '<':   return Number(left) < Number(right);
    case '>=':  return Number(left) >= Number(right);
    case '<=':  return Number(left) <= Number(right);
    default:    return false;
  }
}

/** Evaluate a single filter condition (supports legacy contains / expression operator). */
export function evaluateFilterCondition(
  item: Record<string, unknown>,
  cond: {
    field?:       string;
    fieldSource?: FilterOperandSource;
    operator?:    string;
    value?:       string;
    valueSource?: FilterOperandSource;
  },
  store?: FilterEvalStore,
  floRunMeta?: Readonly<FloRunMeta>,
): boolean {
  const operator = String(cond.operator ?? '==');
  const fieldExpr = String(cond.field ?? '');
  const valueExpr = String(cond.value ?? '');

  if (operator === 'expression') {
    const ctx = buildEvalContext(item, store, floRunMeta);
    return Boolean(safeEvalExpression(valueExpr, ctx, false));
  }

  const left = resolveFilterOperand(fieldExpr, cond.fieldSource, item, store, floRunMeta);
  const right = resolveFilterOperand(
    valueExpr,
    cond.valueSource ?? 'static',
    item,
    store,
    floRunMeta,
  );

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
