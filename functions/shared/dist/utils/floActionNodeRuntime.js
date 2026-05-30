/**
 * Runtime resolution for floActionNode — merges persisted canvas picks with
 * hub FloActionNodes registry defaults (connectorId is hub-managed, not saved on flo).
 */
export function hubFloActionNodeDocId(floKitId) {
    return `flan_${floKitId}`;
}
/** Merge canvas node.data with hub FloActionNodes doc — canvas picks win when set. */
export function mergeFloActionRuntimeFields(canvas, hub) {
    const floKitId = String(canvas.floKitId ?? hub?.floKitId ?? '');
    const hubDoc = hub;
    const actionIds = hubDoc?.actionIds?.length
        ? hubDoc.actionIds
        : hubDoc?.templateActionId
            ? [hubDoc.templateActionId]
            : [];
    const allowedConnections = hubDoc?.allowedConnectionIds ?? [];
    return {
        floKitId,
        actionId: String(canvas.actionId || hubDoc?.templateActionId || actionIds[0] || ''),
        connectorId: String(canvas.connectorId || hubDoc?.connectorId || ''),
        connectionId: String(canvas.connectionId || hubDoc?.defaultConnectionId || allowedConnections[0] || ''),
    };
}
