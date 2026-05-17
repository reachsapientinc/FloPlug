/**
 * FloKit — product-level kit grouping schema version + actions for a connector.
 * Path: FloPlugConnectors/{connectorId}/FloKits/{floKitId}
 */
export interface FloKitDoc {
  id:                string;
  name:              string;
  description:       string;
  connectorId:       string;
  /** ConnectorSchema.id — all kit actions must reference this schema */
  schemaId:          string;
  /** Denormalized from schema.version for display / hub pinning */
  schemaVersion:     string;
  /** ActionDoc ids included in this kit */
  actionIds:         string[];
  /** Semantic version of the kit definition (e.g. "1.0.0") */
  kitVersion:        string;
  availableForTiers: string[];
  isActive:          boolean;
  createdAt?:        unknown;
  updatedAt?:        unknown;
}

type ActionLike = {
  id: string;
  schemaRef?: string;
  floKitId?: string;
  connectorId: string;
  isActive?: boolean;
};

/** Step 1 — kit identity only (schema/actions configured in step 2). */
export function validateFloKitIdentity(
  kit: Pick<FloKitDoc, 'name' | 'id' | 'kitVersion'>,
): string | null {
  if (!kit.name.trim()) return 'Display name is required.';
  if (!kit.id.trim()) return 'FloKit ID is required.';
  if (!kit.kitVersion.trim()) return 'Kit version is required.';
  return null;
}

/** Step 2 — schema + schema-derived operation selection. */
export function validateFloKitConfiguration(
  selectedOperationNames: string[],
  allowedOperationNames: string[],
  schemaId: string,
): string | null {
  if (!schemaId.trim()) return 'Select a schema for this FloKit.';
  if (allowedOperationNames.length === 0) {
    return 'No operations found in this schema — re-parse the schema file or upload again.';
  }
  if (selectedOperationNames.length === 0) {
    return 'Select at least one operation from the schema.';
  }
  const allowed = new Set(allowedOperationNames);
  for (const name of selectedOperationNames) {
    if (!allowed.has(name)) {
      return `Operation "${name}" is not defined in the selected schema.`;
    }
  }
  return null;
}

/** @deprecated Use validateFloKitConfiguration */
export const validateFloKitActions = validateFloKitConfiguration;
