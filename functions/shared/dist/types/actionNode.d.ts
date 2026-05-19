/**
 * Product-level action node template — materialized when a FloKit is saved.
 * Path: FloPlugConnectors/{connectorId}/FloKits/{floKitId}/ActionNodes/{actionId}
 */
export interface FloKitActionNodeDoc {
    id: string;
    floKitId: string;
    connectorId: string;
    actionId: string;
    actionLabel: string;
    servicesSchemaId: string;
    servicesSchemaVersion: string;
    dataModelSchemaId: string;
    dataModelSchemaVersion: string;
    /** @deprecated Use servicesSchemaId */
    wsdlSchemaId?: string;
    /** @deprecated Use servicesSchemaVersion */
    wsdlSchemaVersion?: string;
    /** @deprecated Use servicesSchemaId */
    schemaId?: string;
    /** @deprecated Use servicesSchemaVersion */
    schemaVersion?: string;
    kitVersion: string;
    category?: string;
    isActive: boolean;
    createdAt?: unknown;
    updatedAt?: unknown;
}
/**
 * Hub-scoped action node instance — enabled for developers on a specific hub/tenant.
 * Path: FloPlugHubs/{hubId}/Tenants/{tenantId}/ActionNodes/{instanceId}
 * (Phase 5 — types defined now for downstream work.)
 */
export interface HubActionNodeDoc {
    id: string;
    hubId: string;
    tenantId: string;
    floKitId: string;
    kitVersion?: string;
    /** Entitled actions enabled for this kit on the hub */
    actionIds?: string[];
    /** @deprecated Use actionIds — kept for older docs */
    templateActionId?: string;
    connectorId: string;
    /** Admin-defined name for this FloAction instance (not tied to FloKit label) */
    floActionName?: string;
    /** Unique short label shown on the designer node palette */
    flaLabel?: string;
    /** Hub-admin notes shown in the palette bubble */
    description?: string;
    /** @deprecated Use floActionName */
    displayName?: string;
    allowedConnectionIds?: string[];
    defaultConnectionId?: string;
    outputTarget?: 'cStream' | 'local' | 'global';
    varName?: string;
    enabledForDevelopers?: boolean;
    isActive?: boolean;
    createdAt?: unknown;
    updatedAt?: unknown;
}
/** Resolved display fields for palette / inspector (handles legacy docs). */
export declare function resolveFloActionFields(doc: Pick<HubActionNodeDoc, 'floActionName' | 'displayName' | 'flaLabel' | 'floKitId' | 'description'>): {
    floActionName: string;
    flaLabel: string;
    description: string;
};
/** Subset passed to the designer node palette */
export interface FloActionPaletteItem {
    id: string;
    floActionName: string;
    flaLabel: string;
    description?: string;
    connectorId: string;
    floKitId: string;
    actionIds: string[];
    templateActionId?: string;
    defaultConnectionId?: string;
    allowedConnectionIds?: string[];
}
export declare function toFloActionPaletteItem(doc: HubActionNodeDoc): FloActionPaletteItem;
export interface AddActionNodeParams {
    floKitId: string;
    connectorId: string;
    actionIds: string[];
    /** All connections the developer may choose from in the designer inspector */
    allowedConnectionIds: string[];
    /** The ★ default — pre-selected when the node is dropped on canvas */
    defaultConnectionId: string;
    outputTarget: 'cStream' | 'local' | 'global';
    varName?: string;
    floActionName: string;
    flaLabel: string;
    description?: string;
    /** @deprecated Use floActionName */
    displayName?: string;
}
