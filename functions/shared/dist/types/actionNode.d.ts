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
    kitVersion: string;
    templateActionId: string;
    connectorId: string;
    displayName: string;
    defaultConnectionId?: string;
    enabledForDevelopers: boolean;
    isActive: boolean;
    createdAt?: unknown;
    updatedAt?: unknown;
}
