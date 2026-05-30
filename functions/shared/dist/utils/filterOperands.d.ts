/**
 * Resolve filter left/right operands and compare with relational operators.
 */
import type { FloRunMeta } from '../types/floRunMeta.js';
import type { FilterCompareOperator, FilterOperandSource } from '../types/filterNode.js';
export interface FilterEvalStore {
    local?: Record<string, unknown>;
    global?: Record<string, unknown>;
}
/** Infer operand source when migrating legacy filter nodes. */
export declare function inferFilterOperandSource(expr: string, explicit?: FilterOperandSource): FilterOperandSource;
/** Resolve one side of a filter comparison. */
export declare function resolveFilterOperand(expr: string, source: FilterOperandSource | undefined, item: Record<string, unknown>, store?: FilterEvalStore, floRunMeta?: Readonly<FloRunMeta>): unknown;
export declare function compareFilterValues(left: unknown, operator: FilterCompareOperator, right: unknown): boolean;
/** Evaluate a single filter condition (supports legacy contains / expression operator). */
export declare function evaluateFilterCondition(item: Record<string, unknown>, cond: {
    field?: string;
    fieldSource?: FilterOperandSource;
    operator?: string;
    value?: string;
    valueSource?: FilterOperandSource;
}, store?: FilterEvalStore, floRunMeta?: Readonly<FloRunMeta>): boolean;
