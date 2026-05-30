/**
 * FloSwitch — multi-branch routing; first matching branch wins, else defaultFlo.
 */
import { type ConditionRow } from './conditionRows.js';
export declare const SWITCH_DEFAULT_HANDLE = "__default__";
export interface SwitchBranch {
    id: string;
    label: string;
    /** Inspector / canvas ordering (lower = earlier evaluation). */
    order: number;
    collapsed?: boolean;
    conditionRows: ConditionRow[];
}
export interface SwitchNodeData {
    branches?: SwitchBranch[];
    activeBranchId?: string;
    displayName?: string;
}
export declare function createSwitchBranch(label?: string): SwitchBranch;
/** Sort branches by order then id for stable evaluation. */
export declare function sortSwitchBranches(branches: SwitchBranch[]): SwitchBranch[];
