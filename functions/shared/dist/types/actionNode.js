/** MIME types supported when parsing non-cStream input (phase-2 engine). */
export const ACTION_INPUT_CONTENT_TYPES = [
    { value: 'application/json', label: 'JSON' },
    { value: 'application/xml', label: 'XML' },
    { value: 'text/csv', label: 'CSV' },
    { value: 'text/plain', label: 'Plain Text' },
    { value: 'text/html', label: 'HTML' },
];
/** Resolved display fields for palette / inspector (handles legacy docs). */
export function resolveFloActionFields(doc) {
    const floActionName = doc.floActionName?.trim()
        || doc.displayName?.trim()
        || doc.floKitId;
    const flaLabel = doc.flaLabel?.trim() || floActionName;
    return { floActionName, flaLabel, description: doc.description?.trim() ?? '' };
}
export function toFloActionPaletteItem(doc) {
    const { floActionName, flaLabel, description } = resolveFloActionFields(doc);
    return {
        id: doc.id,
        floActionName,
        flaLabel,
        description: description || undefined,
        connectorId: doc.connectorId,
        floKitId: doc.floKitId,
        actionIds: doc.actionIds ?? (doc.templateActionId ? [doc.templateActionId] : []),
        defaultConnectionId: doc.defaultConnectionId,
        allowedConnectionIds: doc.allowedConnectionIds,
    };
}
