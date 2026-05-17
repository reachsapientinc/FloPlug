/**
 * FloKit — product-level kit: services schema (operations) + data model schema (field mapping).
 * Path: FloPlugConnectors/{connectorId}/FloKits/{floKitId}
 * Actions path: .../FloKits/{floKitId}/FloKitActions/{actionId}
 */
export interface FloKitDoc {
    id: string;
    name: string;
    description: string;
    connectorId: string;
    /** WSDL / OpenAPI / GraphQL — operations parsed from this services schema */
    servicesSchemaId: string;
    servicesSchemaVersion?: string;
    /** XSD (or other data model) — designer field mapping for kit operations */
    dataModelSchemaId: string;
    dataModelSchemaVersion?: string;
    /** @deprecated Use servicesSchemaId */
    wsdlSchemaId?: string;
    /** @deprecated Use servicesSchemaVersion */
    wsdlSchemaVersion?: string;
    /** @deprecated Use servicesSchemaId */
    schemaId?: string;
    /** @deprecated Use servicesSchemaVersion */
    schemaVersion?: string;
    /** FloKitActions doc ids under this kit */
    actionIds: string[];
    kitVersion: string;
    availableForTiers: string[];
    isActive: boolean;
    createdAt?: unknown;
    updatedAt?: unknown;
}
export declare function resolveKitServicesSchemaId(kit: Pick<FloKitDoc, 'servicesSchemaId' | 'wsdlSchemaId' | 'schemaId'>): string;
/** @deprecated Use resolveKitServicesSchemaId */
export declare const resolveKitWsdlSchemaId: typeof resolveKitServicesSchemaId;
export declare function resolveKitDataModelSchemaId(kit: Pick<FloKitDoc, 'dataModelSchemaId'>): string;
export declare function isFloKitConfigured(kit: FloKitDoc): boolean;
/** Step 1 — kit identity only (schemas/actions configured in step 2). */
export declare function validateFloKitIdentity(kit: Pick<FloKitDoc, 'name' | 'id' | 'kitVersion'>): string | null;
/** Step 2 — services-schema operations + mandatory data model schema. */
export declare function validateFloKitConfiguration(selectedOperationNames: string[], allowedOperationNames: string[], servicesSchemaId: string, dataModelSchemaId: string): string | null;
/** @deprecated Use validateFloKitConfiguration */
export declare const validateFloKitActions: typeof validateFloKitConfiguration;
