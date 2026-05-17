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
/** Hub entitlements → per-kit selected action ids (for the UI). */
export function entitlementsToKitSelections(entitlements, floKitsByKey) {
    const map = {};
    const refs = entitlements?.floKits ?? [];
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
    const actionSet = new Set(entitlements?.actionIds ?? []);
    for (const [key, kit] of floKitsByKey) {
        const picked = (kit.actionIds ?? []).filter(id => actionSet.has(id));
        if (picked.length)
            map[key] = picked;
    }
    return map;
}
/** UI state → API payload refs (only kits with ≥1 action). */
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
