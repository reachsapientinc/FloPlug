export function floKitKey(connectorId, floKitId) {
    return `${connectorId}::${floKitId}`;
}
export function parseFloKitKey(key) {
    const sep = key.indexOf('::');
    if (sep < 0)
        return { connectorId: key, floKitId: '' };
    return { connectorId: key.slice(0, sep), floKitId: key.slice(sep + 2) };
}
export function kitCheckState(selected, all) {
    if (all.length === 0 || selected.length === 0)
        return 'none';
    if (selected.length >= all.length)
        return 'all';
    return 'partial';
}
/** Normalize stored or legacy entitlements to the per-connector map shape. */
export function normalizeHubEntitlements(raw) {
    if (!raw?.tierId)
        return undefined;
    if (raw.connectors && Object.keys(raw.connectors).length > 0) {
        return {
            tierId: raw.tierId,
            connectors: raw.connectors,
            actionIds: raw.actionIds ?? [],
        };
    }
    const connectors = {};
    for (const id of raw.connectorIds ?? []) {
        if (!connectors[id])
            connectors[id] = { floKits: [] };
    }
    for (const ref of raw.floKits ?? []) {
        if (!connectors[ref.connectorId]) {
            connectors[ref.connectorId] = { floKits: [] };
        }
        connectors[ref.connectorId].floKits.push({
            floKitId: ref.floKitId,
            ...(ref.actionIds?.length ? { actionIds: [...ref.actionIds] } : {}),
        });
    }
    return {
        tierId: raw.tierId,
        connectors,
        actionIds: raw.actionIds ?? [],
    };
}
export function entitledConnectorIds(entitlements) {
    const normalized = normalizeHubEntitlements(entitlements);
    if (!normalized)
        return [];
    return Object.keys(normalized.connectors);
}
export function flattenFloKitEntitlements(entitlements) {
    const normalized = normalizeHubEntitlements(entitlements);
    if (!normalized)
        return [];
    const refs = [];
    for (const [connectorId, block] of Object.entries(normalized.connectors)) {
        for (const kit of block.floKits) {
            refs.push({
                connectorId,
                floKitId: kit.floKitId,
                ...(kit.actionIds?.length ? { actionIds: kit.actionIds } : {}),
            });
        }
    }
    return refs;
}
export function countEntitledFloKits(entitlements) {
    const normalized = normalizeHubEntitlements(entitlements);
    if (!normalized)
        return 0;
    return Object.values(normalized.connectors).reduce((n, c) => n + c.floKits.length, 0);
}
/** Accept new per-connector map or legacy flat payload from clients. */
export function normalizeProvisionEntitlementsInput(input) {
    if ('connectors' in input && input.connectors) {
        return input.connectors;
    }
    const legacy = input;
    const connectors = {};
    for (const id of legacy.connectorIds ?? []) {
        if (!connectors[id])
            connectors[id] = { floKits: [] };
    }
    for (const ref of legacy.floKits ?? []) {
        if (!connectors[ref.connectorId]) {
            connectors[ref.connectorId] = { floKits: [] };
        }
        connectors[ref.connectorId].floKits.push({
            floKitId: ref.floKitId,
            ...(ref.actionIds?.length ? { actionIds: [...ref.actionIds] } : {}),
        });
    }
    return connectors;
}
/** Hub entitlements → per-kit selected action ids (for the UI). */
export function entitlementsToKitSelections(entitlements, floKitsByKey) {
    const map = {};
    const normalized = normalizeHubEntitlements(entitlements);
    const refs = normalized ? flattenFloKitEntitlements(normalized) : [];
    if (refs.length > 0) {
        for (const ref of refs) {
            const key = floKitKey(ref.connectorId, ref.floKitId);
            const kit = floKitsByKey.get(key);
            const all = kit?.actionIds ?? [];
            if (!all.length)
                continue;
            const selected = ref.actionIds?.length
                ? ref.actionIds.filter(id => all.includes(id))
                : [...all];
            if (selected.length)
                map[key] = selected;
        }
        return map;
    }
    const actionSet = new Set(normalized?.actionIds ?? entitlements?.actionIds ?? []);
    for (const [key, kit] of floKitsByKey) {
        const picked = (kit.actionIds ?? []).filter(id => actionSet.has(id));
        if (picked.length)
            map[key] = picked;
    }
    return map;
}
/** UI state → per-connector entitlement map (only kits with ≥1 action). */
export function kitSelectionsToConnectorEntitlements(selections, entitledConnectorIds) {
    const connectors = {};
    for (const connId of entitledConnectorIds) {
        const floKits = [];
        for (const [key, actionIds] of Object.entries(selections)) {
            if (actionIds.length === 0)
                continue;
            const { connectorId, floKitId } = parseFloKitKey(key);
            if (connectorId !== connId)
                continue;
            floKits.push({
                floKitId,
                actionIds: [...actionIds].sort(),
            });
        }
        connectors[connId] = { floKits };
    }
    return connectors;
}
/** @deprecated Use kitSelectionsToConnectorEntitlements */
export function kitSelectionsToFloKitRefs(selections) {
    return Object.entries(selections)
        .filter(([, actionIds]) => actionIds.length > 0)
        .map(([key, actionIds]) => {
        const { connectorId, floKitId } = parseFloKitKey(key);
        return {
            connectorId,
            floKitId,
            actionIds: [...actionIds].sort(),
        };
    });
}
export function countSelectedActions(selections) {
    return Object.values(selections).reduce((n, ids) => n + ids.length, 0);
}
export function resolveEntitledActionIds(ref, kit) {
    const all = kit?.actionIds ?? [];
    if (!ref.actionIds?.length)
        return [...all];
    const allowed = new Set(all);
    return ref.actionIds.filter(id => allowed.has(id));
}
