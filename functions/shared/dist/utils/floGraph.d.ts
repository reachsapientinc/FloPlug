/**
 * Draft vs published flo graph — shared by designer, functions, webhook.
 */
import type { FloPublishedGraph } from '../types/floVersioning.js';
export type FloGraphSnapshot = FloPublishedGraph;
export declare function getDraftGraph(floData: Record<string, unknown>): FloGraphSnapshot;
/** Published graph for webhook / scheduler / sub-flow loads. Null if never published. */
export declare function getPublishedGraph(floData: Record<string, unknown>): FloGraphSnapshot | null;
export declare function computeGraphHash(graph: FloGraphSnapshot): string;
export declare function graphsEqual(a: FloGraphSnapshot, b: FloGraphSnapshot): boolean;
/** True when a saved draft graph differs from the last published version. */
export declare function hasInProgressDraft(floData: Record<string, unknown>): boolean;
