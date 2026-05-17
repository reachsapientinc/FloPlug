/**
 * FloKit — product-level kit grouping schema version + actions for a connector.
 * Path: FloPlugConnectors/{connectorId}/FloKits/{floKitId}
 */
export interface FloKitDoc {
    id: string;
    name: string;
    description: string;
    connectorId: string;
    /** ConnectorSchema.id — all kit actions must reference this schema */
    schemaId: string;
    /** Denormalized from schema.version for display / hub pinning */
    schemaVersion: string;
    /** ActionDoc ids included in this kit */
    actionIds: string[];
    /** Semantic version of the kit definition (e.g. "1.0.0") */
    kitVersion: string;
    availableForTiers: string[];
    isActive: boolean;
    createdAt?: unknown;
    updatedAt?: unknown;
}
/** Step 1 — kit identity only (schema/actions configured in step 2). */
export declare function validateFloKitIdentity(kit: Pick<FloKitDoc, 'name' | 'id' | 'kitVersion'>): string | null;
/** Step 2 — schema + schema-derived operation selection. */
export declare function validateFloKitConfiguration(selectedOperationNames: string[], allowedOperationNames: string[], schemaId: string): string | null;
/** @deprecated Use validateFloKitConfiguration */
export declare const validateFloKitActions: typeof validateFloKitConfiguration;
