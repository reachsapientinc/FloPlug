/** Filter node — compare two resolved operands with a relational operator. */
export const FILTER_COMPARE_OPERATORS = [
    '==',
    '!=',
    '>',
    '<',
    '>=',
    '<=',
];
/** Legacy operators still evaluated at runtime for older flows. */
export const FILTER_LEGACY_OPERATORS = ['contains', 'startsWith', 'expression'];
export function isFilterCompareOperator(op) {
    return FILTER_COMPARE_OPERATORS.includes(op);
}
export function isFilterLegacyOperator(op) {
    return FILTER_LEGACY_OPERATORS.includes(op);
}
