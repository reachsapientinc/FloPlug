/**
 * Flo execution run list helpers — version labels and sort order.
 */
import type { FloExecutionRunSummary } from '../types/floExecutionHub.js';
export type ExecutedGraphKind = 'draft' | 'published';
/** Human-readable version label for hub UI */
export declare function formatFloRunVersion(floVersion?: number, executedGraph?: ExecutedGraphKind | string): string;
/** Newest execution first (by startedAt, then runId). */
export declare function sortRunsByStartedDesc(runs: FloExecutionRunSummary[]): FloExecutionRunSummary[];
/** Unique version keys present in runs (for filter dropdown). */
export declare function collectRunVersionOptions(runs: FloExecutionRunSummary[]): {
    value: string;
    label: string;
}[];
/** Last platform, node, or unhandled error line from an execution log. */
export declare function extractRunErrorFromLog(log: string[]): string | undefined;
/** Trim and cap designer run labels for Firestore + search. */
export declare function sanitizeRunLabel(raw?: string): string | undefined;
/** Remove undefined fields before writing to Firestore. */
export declare function omitUndefinedFields<T extends Record<string, unknown>>(obj: T): Partial<T>;
