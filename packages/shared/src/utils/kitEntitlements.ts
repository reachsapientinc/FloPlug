import type { FloKitDoc } from '../types/floKit.js';
import type { FloKitEntitlementRef, HubEntitlements } from '../types/hubEntitlements.js';
export function floKitKey(connectorId: string, floKitId: string): string {
  return `${connectorId}::${floKitId}`;
}

export type KitCheckState = 'none' | 'partial' | 'all';

export type KitActionSelectionMap = Record<string, string[]>;

export function parseFloKitKey(key: string): { connectorId: string; floKitId: string } {
  const sep = key.indexOf('::');
  if (sep < 0) return { connectorId: key, floKitId: '' };
  return { connectorId: key.slice(0, sep), floKitId: key.slice(sep + 2) };
}

export function kitCheckState(selected: string[], all: string[]): KitCheckState {
  if (all.length === 0 || selected.length === 0) return 'none';
  if (selected.length >= all.length) return 'all';
  return 'partial';
}

/** Hub entitlements → per-kit selected action ids (for the UI). */
export function entitlementsToKitSelections(
  entitlements: HubEntitlements | undefined,
  floKitsByKey: Map<string, FloKitDoc>,
): KitActionSelectionMap {
  const map: KitActionSelectionMap = {};
  const refs = entitlements?.floKits ?? [];

  if (refs.length > 0) {
    for (const ref of refs) {
      const key = floKitKey(ref.connectorId, ref.floKitId);
      const kit = floKitsByKey.get(key);
      const all = kit?.actionIds ?? [];
      if (!all.length) continue;

      const selected = ref.actionIds?.length
        ? ref.actionIds.filter(id => all.includes(id))
        : [...all];
      if (selected.length) map[key] = selected;
    }
    return map;
  }

  const actionSet = new Set(entitlements?.actionIds ?? []);
  for (const [key, kit] of floKitsByKey) {
    const picked = (kit.actionIds ?? []).filter(id => actionSet.has(id));
    if (picked.length) map[key] = picked;
  }
  return map;
}

/** UI state → API payload refs (only kits with ≥1 action). */
export function kitSelectionsToFloKitRefs(
  selections: KitActionSelectionMap,
): FloKitEntitlementRef[] {
  return Object.entries(selections)
    .filter(([, actionIds]) => actionIds.length > 0)
    .map(([key, actionIds]) => {
      const { connectorId, floKitId } = parseFloKitKey(key);
      return {
        connectorId,
        floKitId,
        actionIds: [...actionIds].sort(),
      };
    });
}

export function countSelectedActions(selections: KitActionSelectionMap): number {
  return Object.values(selections).reduce((n, ids) => n + ids.length, 0);
}

export function resolveEntitledActionIds(
  ref: FloKitEntitlementRef,
  kit: FloKitDoc | undefined,
): string[] {
  const all = kit?.actionIds ?? [];
  if (!ref.actionIds?.length) return [...all];
  const allowed = new Set(all);
  return ref.actionIds.filter(id => allowed.has(id));
}
