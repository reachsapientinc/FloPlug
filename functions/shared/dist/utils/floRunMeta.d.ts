import type { EvalContext } from './floExpression.js';
import type { FloRunMeta, FloRunType } from '../types/floRunMeta.js';
export { FLO_RUN_META_SCOPE } from '../types/floRunMeta.js';
export type { FloRunMeta, FloRunType } from '../types/floRunMeta.js';
export interface BuildFloRunMetaInput {
    runId: string;
    floId: string;
    floName?: string;
    slug?: string;
    tenant: string;
    hubId: string;
    floRunName?: string;
    runType: FloRunType;
    userId?: string;
    userEmail?: string;
    startDatetime?: string;
    parentRunId?: string;
}
export declare function mapRunSourceToRunType(source?: string): FloRunType;
export declare function buildFloRunMeta(input: BuildFloRunMetaInput): Readonly<FloRunMeta>;
/** Top-level store key reserved for engine run metadata (flows must not write here). */
export declare function isReservedStoreKey(key: string): boolean;
export declare function buildEvalContext(cStream: Record<string, unknown>, store?: {
    local?: Record<string, unknown>;
    global?: Record<string, unknown>;
}, floRunMeta?: Readonly<FloRunMeta>): EvalContext;
/** Engine-only: merge extra fields into run meta (e.g. future parentRunId). */
export declare function patchFloRunMeta(current: Readonly<FloRunMeta>, patch: Partial<FloRunMeta>): Readonly<FloRunMeta>;
