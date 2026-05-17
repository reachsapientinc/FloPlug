import { floKitKey, resolveEntitledActionIds } from './kitEntitlements.js';
export function connectorAvailableForTier(connector, tierId) {
    if (connector.isActive === false)
        return false;
    if (!connector.tierControlled)
        return true;
    const tiers = connector.availableForTiers ?? [];
    return tiers.length === 0 || tiers.includes(tierId);
}
export function floKitAvailableForTier(kit, tierId) {
    if (kit.isActive === false)
        return false;
    const tiers = kit.availableForTiers ?? [];
    return tiers.length === 0 || tiers.includes(tierId);
}
export function filterConnectorsForTier(connectors, tierId) {
    return connectors.filter(c => connectorAvailableForTier(c, tierId));
}
/** Non–tier-controlled connectors always entitled for a hub on this tier. */
export function standardConnectorIds(connectors, tierId) {
    return filterConnectorsForTier(connectors, tierId)
        .filter(c => !c.tierControlled)
        .map(c => c.id);
}
/** Ensures standard connectors are always included in the selection. */
export function normalizeConnectorIds(connectorIds, connectors, tierId) {
    const mandatory = standardConnectorIds(connectors, tierId);
    return [...new Set([...mandatory, ...connectorIds])];
}
export function filterFloKitsForTier(kits, tierId) {
    return kits.filter(k => floKitAvailableForTier(k, tierId));
}
export function countTierControlledConnectors(connectorIds, connectorsById) {
    return connectorIds.filter(id => connectorsById.get(id)?.tierControlled).length;
}
/** Returns an error message or null if valid. */
export function validateProvisionEntitlements(input) {
    const { tierId, connectorIds, floKits, connectorsById, floKitsByKey, maxTierControlledConnectors, } = input;
    if (connectorIds.length === 0) {
        return 'Select at least one connector for this hub.';
    }
    const seenConnectors = new Set();
    for (const id of connectorIds) {
        if (seenConnectors.has(id))
            return `Duplicate connector "${id}".`;
        seenConnectors.add(id);
        const connector = connectorsById.get(id);
        if (!connector)
            return `Connector "${id}" not found.`;
        if (!connectorAvailableForTier(connector, tierId)) {
            return `Connector "${connector.label}" is not available for tier "${tierId}".`;
        }
    }
    const tierControlledCount = countTierControlledConnectors(connectorIds, connectorsById);
    if (maxTierControlledConnectors > 0 &&
        tierControlledCount > maxTierControlledConnectors) {
        return `This tier allows at most ${maxTierControlledConnectors} tier-controlled connector(s); you selected ${tierControlledCount}.`;
    }
    const entitledConnectorIds = new Set(connectorIds);
    const seenKits = new Set();
    for (const ref of floKits) {
        const key = floKitKey(ref.connectorId, ref.floKitId);
        if (seenKits.has(key))
            return `Duplicate FloKit "${ref.floKitId}" for connector "${ref.connectorId}".`;
        seenKits.add(key);
        if (!entitledConnectorIds.has(ref.connectorId)) {
            return `FloKit "${ref.floKitId}" requires connector "${ref.connectorId}" to be entitled first.`;
        }
        const kit = floKitsByKey.get(key);
        if (!kit) {
            return `FloKit "${ref.floKitId}" not found under connector "${ref.connectorId}".`;
        }
        if (!floKitAvailableForTier(kit, tierId)) {
            return `FloKit "${kit.name}" is not available for tier "${tierId}".`;
        }
        if (!kit.schemaId?.trim() || !(kit.actionIds?.length)) {
            return `FloKit "${kit.name}" is not fully configured (schema and actions required).`;
        }
        const entitled = resolveEntitledActionIds(ref, kit);
        if (entitled.length === 0) {
            return `FloKit "${kit.name}" must include at least one action.`;
        }
        if (entitled.length > (kit.actionIds?.length ?? 0)) {
            return `FloKit "${kit.name}" has invalid action references.`;
        }
    }
    let totalActions = 0;
    for (const ref of floKits) {
        const kit = floKitsByKey.get(floKitKey(ref.connectorId, ref.floKitId));
        totalActions += resolveEntitledActionIds(ref, kit).length;
    }
    if (totalActions === 0) {
        return 'Select at least one action (via FloKit subscription).';
    }
    return null;
}
export function buildHubEntitlements(tierId, connectorIds, floKits, floKitsByKey) {
    const actionIdSet = new Set();
    const normalizedKits = [];
    for (const ref of floKits) {
        const kit = floKitsByKey.get(floKitKey(ref.connectorId, ref.floKitId));
        const entitled = resolveEntitledActionIds(ref, kit);
        for (const actionId of entitled)
            actionIdSet.add(actionId);
        if (entitled.length === 0)
            continue;
        const all = kit?.actionIds ?? [];
        const isFullKit = entitled.length === all.length &&
            all.every(id => entitled.includes(id));
        normalizedKits.push({
            connectorId: ref.connectorId,
            floKitId: ref.floKitId,
            ...(isFullKit ? {} : { actionIds: [...entitled].sort() }),
        });
    }
    return {
        tierId,
        connectorIds: [...connectorIds],
        floKits: normalizedKits,
        actionIds: [...actionIdSet],
    };
}
export { floKitKey } from './kitEntitlements.js';
