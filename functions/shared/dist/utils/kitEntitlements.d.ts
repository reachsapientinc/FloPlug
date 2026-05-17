import type { FloKitDoc } from '../types/floKit.js';
import type { FloKitEntitlementRef, HubEntitlements } from '../types/hubEntitlements.js';
export declare function floKitKey(connectorId: string, floKitId: string): string;
export type KitCheckState = 'none' | 'partial' | 'all';
export type KitActionSelectionMap = Record<string, string[]>;
export declare function parseFloKitKey(key: string): {
    connectorId: string;
    floKitId: string;
};
export declare function kitCheckState(selected: string[], all: string[]): KitCheckState;
/** Hub entitlements → per-kit selected action ids (for the UI). */
export declare function entitlementsToKitSelections(entitlements: HubEntitlements | undefined, floKitsByKey: Map<string, FloKitDoc>): KitActionSelectionMap;
/** UI state → API payload refs (only kits with ≥1 action). */
export declare function kitSelectionsToFloKitRefs(selections: KitActionSelectionMap): FloKitEntitlementRef[];
export declare function countSelectedActions(selections: KitActionSelectionMap): number;
export declare function resolveEntitledActionIds(ref: FloKitEntitlementRef, kit: FloKitDoc | undefined): string[];
