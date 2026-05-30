import { FLO_RUN_META_SCOPE } from '../types/floRunMeta.js';
export { FLO_RUN_META_SCOPE } from '../types/floRunMeta.js';
export function mapRunSourceToRunType(source) {
    if (source === 'webhook')
        return 'Webhook';
    if (source === 'scheduler')
        return 'Scheduled';
    return 'RunFlo';
}
export function buildFloRunMeta(input) {
    const runId = input.runId;
    return Object.freeze({
        runId,
        floRunId: runId,
        floId: input.floId,
        floName: input.floName ?? input.floId,
        slug: input.slug ?? input.floId,
        tenant: input.tenant,
        hubId: input.hubId,
        floRunName: input.floRunName ?? '',
        runType: input.runType,
        userId: input.userId ?? '',
        userEmail: input.userEmail ?? '',
        startDatetime: input.startDatetime ?? new Date().toISOString(),
        parentRunId: input.parentRunId ?? '',
    });
}
/** Top-level store key reserved for engine run metadata (flows must not write here). */
export function isReservedStoreKey(key) {
    const top = key.trim().split('.')[0];
    return top === FLO_RUN_META_SCOPE;
}
export function buildEvalContext(cStream, store, floRunMeta) {
    const ctx = {
        cStream,
        local: store?.local ?? {},
        global: store?.global ?? {},
    };
    if (floRunMeta) {
        ctx[FLO_RUN_META_SCOPE] = floRunMeta;
    }
    return ctx;
}
/** Engine-only: merge extra fields into run meta (e.g. future parentRunId). */
export function patchFloRunMeta(current, patch) {
    return Object.freeze({ ...current, ...patch });
}
