/**
 * FloSwitch — multi-branch routing; first matching branch wins, else defaultFlo.
 */

import { createConditionRow, type ConditionRow } from './conditionRows.js';

export const SWITCH_DEFAULT_HANDLE = '__default__';

export interface SwitchBranch {
  id:            string;
  label:         string;
  /** Inspector / canvas ordering (lower = earlier evaluation). */
  order:         number;
  collapsed?:    boolean;
  conditionRows: ConditionRow[];
}

export interface SwitchNodeData {
  branches?:       SwitchBranch[];
  activeBranchId?: string;
  displayName?:    string;
}

export function createSwitchBranch(label = 'Route'): SwitchBranch {
  const id = `br-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    label,
    order: 0,
    collapsed: true,
    conditionRows: [createConditionRow({ logic: 'AND' })],
  };
}

/** Sort branches by order then id for stable evaluation. */
export function sortSwitchBranches(branches: SwitchBranch[]): SwitchBranch[] {
  return [...branches].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
