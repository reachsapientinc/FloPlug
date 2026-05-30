/**
 * FloKit — product-level kit: services schema (operations) + data model schema (field mapping).
 * Path: FloPlugConnectors/{connectorId}/FloKits/{floKitId}
 * Actions path: .../FloKits/{floKitId}/FloKitActions/{actionId}
 */
export interface FloKitDoc {
  id:                string;
  name:              string;
  description:       string;
  connectorId:       string;
  /** WSDL / OpenAPI / GraphQL — operations parsed from this services schema */
  servicesSchemaId:      string;
  servicesSchemaVersion?: string;
  /** XSD (or other data model) — designer field mapping for kit operations */
  dataModelSchemaId:     string;
  dataModelSchemaVersion?: string;
  /** @deprecated Use servicesSchemaId */
  wsdlSchemaId?:         string;
  /** @deprecated Use servicesSchemaVersion */
  wsdlSchemaVersion?:    string;
  /** @deprecated Use servicesSchemaId */
  schemaId?:             string;
  /** @deprecated Use servicesSchemaVersion */
  schemaVersion?:        string;
  /** API version segment for URL token assembly (optional override; else derived from services schema) */
  serviceVersion?:      string;
  /** Service module segment for URL token assembly (optional override; else derived from schema label) */
  serviceModule?:       string;
  /** URL segment values keyed by urlToken1, urlToken2, … */
  urlTokenValues?:      Record<string, string>;
  /** FloKitActions doc ids under this kit */
  actionIds:         string[];
  kitVersion:        string;
  availableForTiers: string[];
  isActive:          boolean;
  createdAt?:        unknown;
  updatedAt?:        unknown;
}

export function resolveKitServicesSchemaId(
  kit: Pick<FloKitDoc, 'servicesSchemaId' | 'wsdlSchemaId' | 'schemaId'>,
): string {
  return (kit.servicesSchemaId ?? kit.wsdlSchemaId ?? kit.schemaId ?? '').trim();
}

/** @deprecated Use resolveKitServicesSchemaId */
export const resolveKitWsdlSchemaId = resolveKitServicesSchemaId;

export function resolveKitDataModelSchemaId(kit: Pick<FloKitDoc, 'dataModelSchemaId'>): string {
  return (kit.dataModelSchemaId ?? '').trim();
}

export function isFloKitConfigured(kit: FloKitDoc): boolean {
  return (
    !!resolveKitServicesSchemaId(kit) &&
    !!resolveKitDataModelSchemaId(kit) &&
    (kit.actionIds?.length ?? 0) > 0
  );
}

/** Step 1 — kit identity only (schemas/actions configured in step 2). */
export function validateFloKitIdentity(
  kit: Pick<FloKitDoc, 'name' | 'id' | 'kitVersion'>,
): string | null {
  if (!kit.name.trim()) return 'Display name is required.';
  if (!kit.id.trim()) return 'FloKit ID is required.';
  if (!kit.kitVersion.trim()) return 'Kit version is required.';
  return null;
}

/** Step 2 — services-schema operations + mandatory data model schema. */
export function validateFloKitConfiguration(
  selectedOperationNames: string[],
  allowedOperationNames: string[],
  servicesSchemaId: string,
  dataModelSchemaId: string,
): string | null {
  if (!servicesSchemaId.trim()) {
    return 'Select a services schema (WSDL, OpenAPI, etc.) for operations.';
  }
  if (!dataModelSchemaId.trim()) {
    return 'Select a data model schema (XSD, etc.) for field mapping in the designer.';
  }
  if (allowedOperationNames.length === 0) {
    return 'No operations found in the services schema — re-parse the file or upload again.';
  }
  if (selectedOperationNames.length === 0) {
    return 'Select at least one operation from the services schema.';
  }
  const allowed = new Set(allowedOperationNames);
  for (const name of selectedOperationNames) {
    if (!allowed.has(name)) {
      return `Operation "${name}" is not defined in the selected services schema.`;
    }
  }
  return null;
}

/** @deprecated Use validateFloKitConfiguration */
export const validateFloKitActions = validateFloKitConfiguration;
