/**
 * Hub entitlements — entitled connectors, each with FloKits and optional action subsets.
 * Stored on FloPlugHubs/{hub} and Tenants/{env}/Entitlements/hub.
 */
/** Entitled actions for one FloKit on a hub */
export interface FloKitActionEntitlement {
    floKitId: string;
    /**
     * Entitled actions from this kit. When omitted, all kit actions are entitled.
     * When present, must be a non-empty subset of the kit's actionIds.
     */
    actionIds?: string[];
}
/** FloKits (and actions) entitled under one connector */
export interface ConnectorFloKitEntitlements {
    floKits: FloKitActionEntitlement[];
}
export interface HubEntitlements {
    /** Tier at provision time (for audit / re-validation) */
    tierId: string;
    /** connectorId → entitled FloKits */
    connectors: Record<string, ConnectorFloKitEntitlements>;
    /** Denormalized union of entitled action ids */
    actionIds: string[];
}
/** Stored at FloPlugHubs/{hub}/Tenants/{env}/Entitlements/hub */
export type TenantEntitlementsDoc = HubEntitlements;
/** Client / legacy flat FloKit ref (normalized server-side) */
export interface FloKitEntitlementRef {
    connectorId: string;
    floKitId: string;
    actionIds?: string[];
}
/** Legacy hub entitlements shape (pre–per-connector map) */
export interface LegacyHubEntitlementsFields {
    connectorIds?: string[];
    floKits?: FloKitEntitlementRef[];
}
/** Provision / update request body */
export interface ProvisionEntitlementsInput {
    connectors: Record<string, ConnectorFloKitEntitlements>;
}
export type ProvisionEntitlementsInputLegacy = {
    connectorIds: string[];
    floKits: FloKitEntitlementRef[];
};
