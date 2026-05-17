import type { FloKitDoc } from '../types/floKit.js';
import type { ConnectorFloKitEntitlements, FloKitActionEntitlement, FloKitEntitlementRef, HubEntitlements, LegacyHubEntitlementsFields, ProvisionEntitlementsInput, ProvisionEntitlementsInputLegacy } from '../types/hubEntitlements.js';
export declare function floKitKey(connectorId: string, floKitId: string): string;
export type KitCheckState = 'none' | 'partial' | 'all';
export type KitActionSelectionMap = Record<string, string[]>;
export declare function parseFloKitKey(key: string): {
    connectorId: string;
    floKitId: string;
};
export declare function kitCheckState(selected: string[], all: string[]): KitCheckState;
/** Normalize stored or legacy entitlements to the per-connector map shape. */
export declare function normalizeHubEntitlements(raw: (Partial<HubEntitlements> & LegacyHubEntitlementsFields) | undefined): HubEntitlements | undefined;
export declare function entitledConnectorIds(entitlements: HubEntitlements | undefined): string[];
export declare function flattenFloKitEntitlements(entitlements: HubEntitlements | undefined): FloKitEntitlementRef[];
export declare function countEntitledFloKits(entitlements: HubEntitlements | undefined): number;
/** Accept new per-connector map or legacy flat payload from clients. */
export declare function normalizeProvisionEntitlementsInput(input: ProvisionEntitlementsInput | ProvisionEntitlementsInputLegacy): Record<string, ConnectorFloKitEntitlements>;
/** Hub entitlements → per-kit selected action ids (for the UI). */
export declare function entitlementsToKitSelections(entitlements: HubEntitlements | undefined, floKitsByKey: Map<string, FloKitDoc>): KitActionSelectionMap;
/** UI state → per-connector entitlement map (only kits with ≥1 action). */
export declare function kitSelectionsToConnectorEntitlements(selections: KitActionSelectionMap, entitledConnectorIds: string[]): Record<string, ConnectorFloKitEntitlements>;
/** @deprecated Use kitSelectionsToConnectorEntitlements */
export declare function kitSelectionsToFloKitRefs(selections: KitActionSelectionMap): FloKitEntitlementRef[];
export declare function countSelectedActions(selections: KitActionSelectionMap): number;
export declare function resolveEntitledActionIds(ref: FloKitActionEntitlement | FloKitEntitlementRef, kit: FloKitDoc | undefined): string[];
