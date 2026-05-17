import type { ConnectorDoc } from '../types/AuthConnectorTypes.js';
import type { FloKitDoc } from '../types/floKit.js';
import type { ConnectorFloKitEntitlements, FloKitEntitlementRef, HubEntitlements } from '../types/hubEntitlements.js';
export declare function connectorAvailableForTier(connector: ConnectorDoc, tierId: string): boolean;
export declare function floKitAvailableForTier(kit: FloKitDoc, tierId: string): boolean;
export declare function filterConnectorsForTier(connectors: ConnectorDoc[], tierId: string): ConnectorDoc[];
/** Non–tier-controlled connectors always entitled for a hub on this tier. */
export declare function standardConnectorIds(connectors: ConnectorDoc[], tierId: string): string[];
/** Ensures standard connectors are always included in the selection. */
export declare function normalizeConnectorIds(connectorIds: string[], connectors: ConnectorDoc[], tierId: string): string[];
/** Merge mandatory connectors into the per-connector entitlements map. */
export declare function normalizeConnectorEntitlements(connectors: Record<string, ConnectorFloKitEntitlements>, allConnectorIds: string[]): Record<string, ConnectorFloKitEntitlements>;
export declare function filterFloKitsForTier(kits: FloKitDoc[], tierId: string): FloKitDoc[];
export declare function countTierControlledConnectors(connectorIds: string[], connectorsById: Map<string, ConnectorDoc>): number;
export interface ValidateProvisionEntitlementsInput {
    tierId: string;
    connectorIds: string[];
    connectors: Record<string, ConnectorFloKitEntitlements>;
    connectorsById: Map<string, ConnectorDoc>;
    floKitsByKey: Map<string, FloKitDoc>;
    maxTierControlledConnectors: number;
}
/** Returns an error message or null if valid. */
export declare function validateProvisionEntitlements(input: ValidateProvisionEntitlementsInput): string | null;
export declare function buildHubEntitlements(tierId: string, connectorIds: string[], connectors: Record<string, ConnectorFloKitEntitlements>, floKitsByKey: Map<string, FloKitDoc>): HubEntitlements;
/** @deprecated Prefer buildHubEntitlements with connectors map */
export declare function buildHubEntitlementsFromRefs(tierId: string, connectorIds: string[], floKits: FloKitEntitlementRef[], floKitsByKey: Map<string, FloKitDoc>): HubEntitlements;
export { floKitKey, normalizeHubEntitlements, entitledConnectorIds, countEntitledFloKits, } from './kitEntitlements.js';
