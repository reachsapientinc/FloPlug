/**
 * Classify run failures: application `error` vs platform `fatal` vs user `killed`.
 */
import type { ExecutionRunStatus } from '../types/floExecutionHub.js';
export type RunFailureCategory = 'application' | 'platform' | 'user_cancel';
/** True when the message looks like Firebase / Cloud Functions infrastructure, not app logic. */
export declare function isPlatformFailureMessage(message: string): boolean;
export declare function classifyUncaughtError(err: unknown): 'fatal' | 'error';
export declare function logLineForUncaughtError(err: unknown): string;
export declare function resolveStatusFromLog(log: string[], options: {
    killed?: boolean;
    forcedFatal?: boolean;
}): ExecutionRunStatus;
export declare function failureCategoryForStatus(status: ExecutionRunStatus): RunFailureCategory | undefined;
