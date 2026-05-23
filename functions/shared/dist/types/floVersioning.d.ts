/**
 * Flo versioning — draft vs published separation (recommended model).
 *
 * Designer edits `draft`; runtime (webhook/scheduler) reads `published`.
 * Each publish increments `publishedVersion` and archives prior graph under Versions/.
 */
import type { FloValidationReport } from './floValidation.js';
export interface FloPublishedGraph {
    nodes: unknown[];
    edges: unknown[];
    viewport?: {
        x: number;
        y: number;
        zoom: number;
    };
}
/** Live editable canvas on Flos/{floId} */
export interface FloDraftFields {
    /** Current designer canvas — may differ from published */
    nodes: unknown[];
    edges: unknown[];
    viewport?: {
        x: number;
        y: number;
        zoom: number;
    };
}
/** Immutable snapshot: Workspaces/{wsId}/Flos/{floId}/Versions/{version} */
export interface FloVersionDoc {
    version: number;
    floId: string;
    workspaceId: string;
    graph: FloPublishedGraph;
    validationReport?: FloValidationReport;
    publishedBy: string;
    publishedAt: string;
    /** Content hash for drift detection */
    graphHash?: string;
}
/** Fields on main flo doc for publish state */
export interface FloPublishMeta {
    publishState: 'draft' | 'published';
    publishedVersion?: number;
    publishedAt?: string;
    /** Hash of last published graph — compare to draft to enable Publish button */
    publishedGraphHash?: string;
    draftGraphHash?: string;
    hasUnpublishedChanges?: boolean;
}
/** Stored on FloExecutionLog run header */
export interface FloExecutionVersionMeta {
    floVersion?: number;
    graphHash?: string;
    executedGraph?: 'draft' | 'published';
    source?: 'designer' | 'webhook' | 'scheduler' | 'test';
}
