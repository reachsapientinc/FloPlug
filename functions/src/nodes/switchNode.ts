/**
 * FloSwitch — evaluate branches in order; first match selects outbound handle.
 */

import {
  evaluateConditionRows,
  sortSwitchBranches,
  SWITCH_DEFAULT_HANDLE,
  type FloRunMeta,
  type NodeResult,
  type NodeStore,
  type SwitchBranch,
} from '@floplug/shared';

export interface SwitchNodeResult extends NodeResult {
  activeHandle: string;
}

export function executeSwitchNode(
  cStream: unknown,
  nd:      Record<string, unknown>,
  store:   NodeStore,
  floRunMeta?: Readonly<FloRunMeta>,
): SwitchNodeResult {
  const itemOf = (item: unknown): Record<string, unknown> =>
    (item && typeof item === 'object' && !Array.isArray(item))
      ? item as Record<string, unknown>
      : {};

  const branches = sortSwitchBranches((nd.branches as SwitchBranch[]) ?? []);

  const pickHandle = (item: unknown): string => {
    for (const br of branches) {
      if (evaluateConditionRows(br.conditionRows, itemOf(item), store, floRunMeta)) {
        return br.id;
      }
    }
    return SWITCH_DEFAULT_HANDLE;
  };

  if (Array.isArray(cStream)) {
    const handle = pickHandle(cStream[0]);
    return {
      cStream,
      activeHandle: handle,
      logLine: `✓ FloSwitch: route → ${handle === SWITCH_DEFAULT_HANDLE ? 'defaultFlo' : handle}`,
    };
  }

  const handle = pickHandle(cStream);
  return {
    cStream,
    activeHandle: handle,
    logLine: `✓ FloSwitch: route → ${handle === SWITCH_DEFAULT_HANDLE ? 'defaultFlo' : handle}`,
  };
}
