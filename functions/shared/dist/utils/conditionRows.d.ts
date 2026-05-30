/**
 * Evaluate and validate row-based conditions (AND/OR + parentheses).
 */
import type { ConditionRow } from '../types/conditionRows.js';
import type { FloRunMeta } from '../types/floRunMeta.js';
import { type FilterEvalStore } from './filterOperands.js';
export interface ParenValidationResult {
    ok: boolean;
    message?: string;
}
/** Running balance of ( vs ) across all rows in order (after processing each row). */
export interface GlobalParenBalance {
    /** Unclosed ( still open after all rows processed. */
    depth: number;
    totalOpen: number;
    totalClose: number;
}
export declare function computeGlobalParenBalance(rows: ConditionRow[]): GlobalParenBalance;
export declare function rowsUseGroupingColumns(rows: ConditionRow[]): boolean;
/** Open field: only '('; close field: only ')'; global balance in row order. */
export declare function validateConditionRowsParentheses(rows: ConditionRow[]): ParenValidationResult;
/** True when rows empty (no constraints). */
export declare function evaluateConditionRows(rows: ConditionRow[] | undefined, item: Record<string, unknown>, store?: FilterEvalStore, floRunMeta?: Readonly<FloRunMeta>): boolean;
