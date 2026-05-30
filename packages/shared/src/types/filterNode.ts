/** Filter node — compare two resolved operands with a relational operator. */

export const FILTER_COMPARE_OPERATORS = [
  '==',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
] as const;

export type FilterCompareOperator = (typeof FILTER_COMPARE_OPERATORS)[number];

export type FilterOperandSource = 'cStream' | 'local' | 'global' | 'static' | 'expression';

/** Legacy operators still evaluated at runtime for older flows. */
export const FILTER_LEGACY_OPERATORS = ['contains', 'startsWith', 'expression'] as const;

export type FilterLegacyOperator = (typeof FILTER_LEGACY_OPERATORS)[number];

export function isFilterCompareOperator(op: string): op is FilterCompareOperator {
  return (FILTER_COMPARE_OPERATORS as readonly string[]).includes(op);
}

export function isFilterLegacyOperator(op: string): op is FilterLegacyOperator {
  return (FILTER_LEGACY_OPERATORS as readonly string[]).includes(op);
}

export interface FilterConditionLike {
  field?:         string;
  fieldSource?:   FilterOperandSource;
  operator?:      string;
  value?:         string;
  valueSource?:   FilterOperandSource;
}
