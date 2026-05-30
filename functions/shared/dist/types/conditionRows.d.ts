/**
 * Row-based filter/switch conditions with AND/OR and parenthesis fields.
 */
import type { FilterCompareOperator, FilterOperandSource } from './filterNode.js';
export type ConditionLogic = 'AND' | 'OR';
export interface ConditionRow {
    id: string;
    /** Row 0 is always AND in the UI; row 1+ selects AND/OR before this row. */
    logic: ConditionLogic;
    /** Only '(' characters, applied before this row's comparison. */
    openParen: string;
    left: string;
    leftSource?: FilterOperandSource;
    operator: FilterCompareOperator | string;
    right: string;
    rightSource?: FilterOperandSource;
    /** Only ')' characters, applied after this row's comparison. */
    closeParen: string;
}
export declare function createConditionRow(partial?: Partial<ConditionRow>): ConditionRow;
export declare function defaultConditionRows(): ConditionRow[];
