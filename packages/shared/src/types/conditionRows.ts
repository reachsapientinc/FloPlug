/**
 * Row-based filter/switch conditions with AND/OR and parenthesis fields.
 */

import type { FilterCompareOperator, FilterOperandSource } from './filterNode.js';

export type ConditionLogic = 'AND' | 'OR';

export interface ConditionRow {
  id:          string;
  /** Row 0 is always AND in the UI; row 1+ selects AND/OR before this row. */
  logic:       ConditionLogic;
  /** Only '(' characters, applied before this row's comparison. */
  openParen:   string;
  left:        string;
  leftSource?: FilterOperandSource;
  operator:    FilterCompareOperator | string;
  right:       string;
  rightSource?: FilterOperandSource;
  /** Only ')' characters, applied after this row's comparison. */
  closeParen:  string;
}

export function createConditionRow(partial?: Partial<ConditionRow>): ConditionRow {
  return {
    id:          partial?.id ?? `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    logic:       partial?.logic ?? 'AND',
    openParen:   partial?.openParen ?? '',
    left:        partial?.left ?? '',
    leftSource:  partial?.leftSource ?? 'cStream',
    operator:    partial?.operator ?? '==',
    right:       partial?.right ?? '',
    rightSource: partial?.rightSource ?? 'static',
    closeParen:  partial?.closeParen ?? '',
  };
}

export function defaultConditionRows(): ConditionRow[] {
  return [createConditionRow({ logic: 'AND' })];
}
