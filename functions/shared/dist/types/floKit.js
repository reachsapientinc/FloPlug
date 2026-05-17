export function resolveKitServicesSchemaId(kit) {
    return (kit.servicesSchemaId ?? kit.wsdlSchemaId ?? kit.schemaId ?? '').trim();
}
/** @deprecated Use resolveKitServicesSchemaId */
export const resolveKitWsdlSchemaId = resolveKitServicesSchemaId;
export function resolveKitDataModelSchemaId(kit) {
    return (kit.dataModelSchemaId ?? '').trim();
}
export function isFloKitConfigured(kit) {
    return (!!resolveKitServicesSchemaId(kit) &&
        !!resolveKitDataModelSchemaId(kit) &&
        (kit.actionIds?.length ?? 0) > 0);
}
/** Step 1 — kit identity only (schemas/actions configured in step 2). */
export function validateFloKitIdentity(kit) {
    if (!kit.name.trim())
        return 'Display name is required.';
    if (!kit.id.trim())
        return 'FloKit ID is required.';
    if (!kit.kitVersion.trim())
        return 'Kit version is required.';
    return null;
}
/** Step 2 — services-schema operations + mandatory data model schema. */
export function validateFloKitConfiguration(selectedOperationNames, allowedOperationNames, servicesSchemaId, dataModelSchemaId) {
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
