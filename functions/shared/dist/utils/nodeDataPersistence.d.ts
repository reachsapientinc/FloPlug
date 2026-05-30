/**
 * Per-node Execution Hub persistence — default none (no storage).
 */
import type { NodeHttpTrace } from '../types/floExecutionHub.js';
export type NodePersistenceScope = 'cStream' | 'local' | 'global' | 'selective';
export interface NodeDataPersistence {
    mode?: 'none' | 'selective';
    inputScopes?: NodePersistenceScope[];
    outputScopes?: NodePersistenceScope[];
    /** Comma-separated paths when selective is enabled (e.g. cStream.message, local.idx) */
    inputPaths?: string;
    outputPaths?: string;
}
export declare const DEFAULT_NODE_DATA_PERSISTENCE: NodeDataPersistence;
export declare function parseNodeDataPersistence(data: Record<string, unknown> | undefined): NodeDataPersistence;
export interface BuildPersistedSnapshotInput {
    config: NodeDataPersistence;
    cStream?: Record<string, unknown>;
    local?: Record<string, unknown>;
    global?: Record<string, unknown>;
    httpTrace?: NodeHttpTrace;
    /** When true, omit httpTrace even if scopes would include it */
    stripRemoteTrace?: boolean;
}
/** Returns undefined when nothing should be stored for this segment. */
export declare function buildPersistedInputSnapshot(input: BuildPersistedSnapshotInput): Record<string, unknown> | undefined;
export declare function buildPersistedOutputSnapshot(input: BuildPersistedSnapshotInput): Record<string, unknown> | undefined;
export declare function shouldPersistNodeExecution(config: NodeDataPersistence): boolean;
