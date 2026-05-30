/**
 * Evaluate and validate row-based conditions (AND/OR + parentheses).
 */

import type { ConditionRow } from '../types/conditionRows.js';
import type { FloRunMeta } from '../types/floRunMeta.js';
import {
  evaluateFilterCondition,
  type FilterEvalStore,
} from './filterOperands.js';

export interface ParenValidationResult {
  ok:      boolean;
  message?: string;
}

/** Running balance of ( vs ) across all rows in order (after processing each row). */
export interface GlobalParenBalance {
  /** Unclosed ( still open after all rows processed. */
  depth:       number;
  totalOpen:   number;
  totalClose:  number;
}

export function computeGlobalParenBalance(rows: ConditionRow[]): GlobalParenBalance {
  let depth = 0;
  let totalOpen = 0;
  let totalClose = 0;
  for (const row of rows ?? []) {
    totalOpen += row.openParen?.length ?? 0;
    totalClose += row.closeParen?.length ?? 0;
    depth += row.openParen?.length ?? 0;
    depth -= row.closeParen?.length ?? 0;
  }
  return { depth, totalOpen, totalClose };
}

export function rowsUseGroupingColumns(rows: ConditionRow[]): boolean {
  return (rows ?? []).some(r => (r.openParen?.length ?? 0) > 0 || (r.closeParen?.length ?? 0) > 0);
}

/** Open field: only '('; close field: only ')'; global balance in row order. */
export function validateConditionRowsParentheses(rows: ConditionRow[]): ParenValidationResult {
  if (!rows?.length) return { ok: true };

  let depth = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.openParen && !/^\(+$/.test(row.openParen)) {
      return { ok: false, message: `Row ${i + 1}: open field may only contain (` };
    }
    if (row.closeParen && !/^\)+$/.test(row.closeParen)) {
      return { ok: false, message: `Row ${i + 1}: close field may only contain )` };
    }
    depth += row.openParen.length;
    depth -= row.closeParen.length;
    if (depth < 0) {
      return { ok: false, message: `Row ${i + 1}: unmatched closing parenthesis` };
    }
  }
  if (depth !== 0) {
    return { ok: false, message: 'Unmatched opening parenthesis' };
  }
  return { ok: true };
}

type CondToken =
  | { kind: 'bool'; value: boolean }
  | { kind: 'op'; value: 'AND' | 'OR' }
  | { kind: 'paren'; value: '(' | ')' };

function rowToCondition(row: ConditionRow) {
  return {
    field:       row.left,
    fieldSource: row.leftSource,
    operator:    row.operator,
    value:       row.right,
    valueSource: row.rightSource,
  };
}

function buildConditionTokens(
  rows: ConditionRow[],
  item: Record<string, unknown>,
  store?: FilterEvalStore,
  floRunMeta?: Readonly<FloRunMeta>,
): CondToken[] {
  const tokens: CondToken[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (i > 0) {
      tokens.push({ kind: 'op', value: row.logic === 'OR' ? 'OR' : 'AND' });
    }
    for (let j = 0; j < row.openParen.length; j++) {
      tokens.push({ kind: 'paren', value: '(' });
    }
    const pass = evaluateFilterCondition(item, rowToCondition(row), store, floRunMeta);
    tokens.push({ kind: 'bool', value: pass });
    for (let j = 0; j < row.closeParen.length; j++) {
      tokens.push({ kind: 'paren', value: ')' });
    }
  }
  return tokens;
}

function evaluateConditionTokens(tokens: CondToken[]): boolean {
  let i = 0;

  const parseTerm = (): boolean => {
    const t = tokens[i];
    if (!t) return false;
    if (t.kind === 'paren' && t.value === '(') {
      i++;
      const inner = parseExpr();
      if (tokens[i]?.kind === 'paren' && tokens[i].value === ')') i++;
      return inner;
    }
    if (t.kind === 'bool') {
      i++;
      return t.value;
    }
    return false;
  };

  const parseExpr = (): boolean => {
    let acc = parseTerm();
    while (i < tokens.length && tokens[i].kind === 'op') {
      const op = tokens[i++] as { kind: 'op'; value: 'AND' | 'OR' };
      const right = parseTerm();
      acc = op.value === 'AND' ? acc && right : acc || right;
    }
    return acc;
  };

  return parseExpr();
}

/** True when rows empty (no constraints). */
export function evaluateConditionRows(
  rows: ConditionRow[] | undefined,
  item: Record<string, unknown>,
  store?: FilterEvalStore,
  floRunMeta?: Readonly<FloRunMeta>,
): boolean {
  if (!rows?.length) return true;
  const paren = validateConditionRowsParentheses(rows);
  if (!paren.ok) return false;
  const tokens = buildConditionTokens(rows, item, store, floRunMeta);
  return evaluateConditionTokens(tokens);
}
