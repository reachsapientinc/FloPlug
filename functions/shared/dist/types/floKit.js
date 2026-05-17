/** Step 1 — kit identity only (schema/actions configured in step 2). */
export function validateFloKitIdentity(kit) {
    if (!kit.name.trim())
        return 'Display name is required.';
    if (!kit.id.trim())
        return 'FloKit ID is required.';
    if (!kit.kitVersion.trim())
        return 'Kit version is required.';
    return null;
}
/** Step 2 — schema + schema-derived operation selection. */
export function validateFloKitConfiguration(selectedOperationNames, allowedOperationNames, schemaId) {
    if (!schemaId.trim())
        return 'Select a schema for this FloKit.';
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
