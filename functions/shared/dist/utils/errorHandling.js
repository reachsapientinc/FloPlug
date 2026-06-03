/**
 * Error catch resolution + backward propagation along the executed success path.
 */
import { NODE_TYPES } from '../constants/constants.js';
import { ERROR_HANDLE, } from '../types/errorHandling.js';
import { nodeLabel } from '../validation/bindings.js';
const CATCHING_SCOPES = new Set(['self', 'subtree']);
export function effectiveCatchScope(node, defaults) {
    const raw = node.data.catchErrorScope ?? 'inherit';
    if (raw !== 'inherit')
        return raw;
    return defaults?.catchScope ?? 'none';
}
export function effectiveErrorDataSource(node, defaults) {
    const raw = node.data.errorDataSource ?? 'inherit';
    if (raw !== 'inherit')
        return raw;
    return defaults?.errorDataSource ?? 'cStreamAtError';
}
export function catchScopeEnabled(scope) {
    return scope === 'self' || scope === 'subtree';
}
export function showErrorHandleOnCanvas(nodeData, defaults) {
    return catchScopeEnabled(effectiveCatchScope({ id: '', type: '', data: nodeData }, defaults));
}
/** Walk parent chain from node up — true if ancestorId is on the path. */
export function isOnExecutedPath(ancestorId, nodeId, parentOnPath) {
    let current = nodeId;
    while (current) {
        if (current === ancestorId)
            return true;
        current = parentOnPath[current] ?? null;
    }
    return false;
}
/**
 * Nearest catcher walking backward from raised node along executed path.
 * First match wins (innermost compartment / downstream catcher first).
 */
export function findNearestCatcher(raisedNodeId, nodes, parentOnPath, defaults) {
    const byId = new Map(nodes.map(n => [n.id, n]));
    let current = raisedNodeId;
    while (current) {
        const node = byId.get(current);
        if (node) {
            const scope = effectiveCatchScope(node, defaults);
            if (scope === 'self' && current === raisedNodeId)
                return node;
            if (scope === 'subtree' && isOnExecutedPath(current, raisedNodeId, parentOnPath)) {
                return node;
            }
        }
        current = parentOnPath[current] ?? null;
    }
    return undefined;
}
export function findErrorPathEdge(catcherId, edges) {
    return edges.find(e => e.source === catcherId && (e.sourceHandle ?? '') === ERROR_HANDLE);
}
/** Forward reachability from a node (error-path subgraph). */
export function collectForwardReachable(startId, edges) {
    const adj = new Map();
    for (const e of edges) {
        if (!adj.has(e.source))
            adj.set(e.source, []);
        adj.get(e.source).push(e.target);
    }
    const seen = new Set();
    const queue = [startId];
    while (queue.length) {
        const id = queue.shift();
        if (seen.has(id))
            continue;
        seen.add(id);
        for (const nxt of adj.get(id) ?? []) {
            if (!seen.has(nxt))
                queue.push(nxt);
        }
    }
    return seen;
}
export function buildFloException(err, node, cStreamAtError, httpTrace) {
    const message = err instanceof Error ? err.message : String(err);
    let statusCode;
    if (httpTrace && typeof httpTrace.status === 'number') {
        statusCode = httpTrace.status;
    }
    return {
        statusCode,
        message,
        nodeId: node.id,
        nodeCanvasName: nodeLabel(node.data, node.id),
        nodeType: node.type,
        cStream: cStreamAtError,
        dateTime: new Date().toISOString(),
        httpTrace,
    };
}
export function resolveErrorPathCStream(catcher, exception, pathState, store, defaults) {
    const source = effectiveErrorDataSource(catcher, defaults);
    switch (source) {
        case 'cStreamAtCatcher':
            return pathState.cStreamAtNode[catcher.id] ?? exception.cStream;
        case 'cStreamAtError':
            return exception.cStream;
        case 'local': {
            const ref = String(catcher.data.errorDataRef ?? defaults?.errorDataRef ?? '').trim();
            if (ref && store.local[ref] !== undefined)
                return store.local[ref];
            return exception.cStream;
        }
        case 'global': {
            const ref = String(catcher.data.errorDataRef ?? defaults?.errorDataRef ?? '').trim();
            if (ref && store.global[ref] !== undefined)
                return store.global[ref];
            return exception.cStream;
        }
        default:
            return exception.cStream;
    }
}
export function getStartErrorDefaults(nodes) {
    const start = nodes.find(n => n.type === NODE_TYPES.START);
    if (!start)
        return undefined;
    return start.data.floErrorDefaults;
}
export { ERROR_HANDLE };
