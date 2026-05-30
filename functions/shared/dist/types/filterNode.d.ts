/** Filter node — compare two resolved operands with a relational operator. */
export declare const FILTER_COMPARE_OPERATORS: readonly ["==", "!=", ">", "<", ">=", "<="];
export type FilterCompareOperator = (typeof FILTER_COMPARE_OPERATORS)[number];
export type FilterOperandSource = 'cStream' | 'local' | 'global' | 'static' | 'expression';
/** Legacy operators still evaluated at runtime for older flows. */
export declare const FILTER_LEGACY_OPERATORS: readonly ["contains", "startsWith", "expression"];
export type FilterLegacyOperator = (typeof FILTER_LEGACY_OPERATORS)[number];
export declare function isFilterCompareOperator(op: string): op is FilterCompareOperator;
export declare function isFilterLegacyOperator(op: string): op is FilterLegacyOperator;
export interface FilterConditionLike {
    field?: string;
    fieldSource?: FilterOperandSource;
    operator?: string;
    value?: string;
    valueSource?: FilterOperandSource;
}
