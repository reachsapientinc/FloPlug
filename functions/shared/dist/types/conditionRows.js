/**
 * Row-based filter/switch conditions with AND/OR and parenthesis fields.
 */
export function createConditionRow(partial) {
    return {
        id: partial?.id ?? `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        logic: partial?.logic ?? 'AND',
        openParen: partial?.openParen ?? '',
        left: partial?.left ?? '',
        leftSource: partial?.leftSource ?? 'cStream',
        operator: partial?.operator ?? '==',
        right: partial?.right ?? '',
        rightSource: partial?.rightSource ?? 'static',
        closeParen: partial?.closeParen ?? '',
    };
}
export function defaultConditionRows() {
    return [createConditionRow({ logic: 'AND' })];
}
