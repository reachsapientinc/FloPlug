/**
 * Error catch resolution + backward propagation along the executed success path.
 */
import { ERROR_HANDLE, type CatchErrorScope, type ErrorPathDataSource, type FloErrorDefaults, type FloException, type ExecutionPathState } from '../types/errorHandling.js';
export interface ErrorGraphNode {
    id: string;
    type: string;
    data: Record<string, unknown>;
}
export interface ErrorGraphEdge {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
}
export declare function effectiveCatchScope(node: ErrorGraphNode, defaults: FloErrorDefaults | undefined): CatchErrorScope;
export declare function effectiveErrorDataSource(node: ErrorGraphNode, defaults: FloErrorDefaults | undefined): ErrorPathDataSource;
export declare function catchScopeEnabled(scope: CatchErrorScope): boolean;
export declare function showErrorHandleOnCanvas(nodeData: Record<string, unknown>, defaults?: FloErrorDefaults): boolean;
/** Walk parent chain from node up — true if ancestorId is on the path. */
export declare function isOnExecutedPath(ancestorId: string, nodeId: string, parentOnPath: Record<string, string | null>): boolean;
/**
 * Nearest catcher walking backward from raised node along executed path.
 * First match wins (innermost compartment / downstream catcher first).
 */
export declare function findNearestCatcher(raisedNodeId: string, nodes: ErrorGraphNode[], parentOnPath: Record<string, string | null>, defaults: FloErrorDefaults | undefined): ErrorGraphNode | undefined;
export declare function findErrorPathEdge(catcherId: string, edges: ErrorGraphEdge[]): ErrorGraphEdge | undefined;
/** Forward reachability from a node (error-path subgraph). */
export declare function collectForwardReachable(startId: string, edges: ErrorGraphEdge[]): Set<string>;
export declare function buildFloException(err: unknown, node: ErrorGraphNode, cStreamAtError: unknown, httpTrace?: Record<string, unknown>): FloException;
export declare function resolveErrorPathCStream(catcher: ErrorGraphNode, exception: FloException, pathState: ExecutionPathState, store: {
    local: Record<string, unknown>;
    global: Record<string, unknown>;
}, defaults: FloErrorDefaults | undefined): unknown;
export declare function getStartErrorDefaults(nodes: ErrorGraphNode[]): FloErrorDefaults | undefined;
export { ERROR_HANDLE };
