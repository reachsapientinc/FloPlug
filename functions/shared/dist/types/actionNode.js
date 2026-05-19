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
