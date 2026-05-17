/**
 * Hub entitlements — connectors and FloKits a hub may use (provisioned in Phase 3).
 */
export interface FloKitEntitlementRef {
    connectorId: string;
    floKitId: string;
    /**
     * Entitled actions from this kit. When omitted (legacy), all kit actions are entitled.
     * When present, must be a non-empty subset of the kit's actionIds.
     */
    actionIds?: string[];
}
export interface HubEntitlements {
    /** Tier at provision time (for audit / re-validation) */
    tierId: string;
    connectorIds: string[];
    floKits: FloKitEntitlementRef[];
    /** Denormalized union of FloKit.actionIds */
    actionIds: string[];
}
/** Stored at FloPlugHubs/{hub}/Tenants/{env}/Entitlements/hub */
export type TenantEntitlementsDoc = HubEntitlements;
