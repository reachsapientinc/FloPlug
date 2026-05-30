import type { EvalContext } from './floExpression.js';
import type { FloRunMeta, FloRunType } from '../types/floRunMeta.js';
import { FLO_RUN_META_SCOPE } from '../types/floRunMeta.js';

export { FLO_RUN_META_SCOPE } from '../types/floRunMeta.js';
export type { FloRunMeta, FloRunType } from '../types/floRunMeta.js';

export interface BuildFloRunMetaInput {
  runId:       string;
  floId:       string;
  floName?:    string;
  slug?:       string;
  tenant:      string;
  hubId:       string;
  floRunName?: string;
  runType:     FloRunType;
  userId?:     string;
  userEmail?:  string;
  startDatetime?: string;
  parentRunId?: string;
}

export function mapRunSourceToRunType(source?: string): FloRunType {
  if (source === 'webhook') return 'Webhook';
  if (source === 'scheduler') return 'Scheduled';
  return 'RunFlo';
}

export function buildFloRunMeta(input: BuildFloRunMetaInput): Readonly<FloRunMeta> {
  const runId = input.runId;
  return Object.freeze({
    runId,
    floRunId:      runId,
    floId:         input.floId,
    floName:       input.floName ?? input.floId,
    slug:          input.slug ?? input.floId,
    tenant:        input.tenant,
    hubId:         input.hubId,
    floRunName:    input.floRunName ?? '',
    runType:       input.runType,
    userId:        input.userId ?? '',
    userEmail:     input.userEmail ?? '',
    startDatetime: input.startDatetime ?? new Date().toISOString(),
    parentRunId:   input.parentRunId ?? '',
  });
}

/** Top-level store key reserved for engine run metadata (flows must not write here). */
export function isReservedStoreKey(key: string): boolean {
  const top = key.trim().split('.')[0];
  return top === FLO_RUN_META_SCOPE;
}

export function buildEvalContext(
  cStream: Record<string, unknown>,
  store?: { local?: Record<string, unknown>; global?: Record<string, unknown> },
  floRunMeta?: Readonly<FloRunMeta>,
): EvalContext {
  const ctx: EvalContext = {
    cStream,
    local:  store?.local  ?? {},
    global: store?.global ?? {},
  };
  if (floRunMeta) {
    ctx[FLO_RUN_META_SCOPE] = floRunMeta as unknown as Record<string, unknown>;
  }
  return ctx;
}

/** Engine-only: merge extra fields into run meta (e.g. future parentRunId). */
export function patchFloRunMeta(
  current: Readonly<FloRunMeta>,
  patch: Partial<FloRunMeta>,
): Readonly<FloRunMeta> {
  return Object.freeze({ ...current, ...patch });
}
