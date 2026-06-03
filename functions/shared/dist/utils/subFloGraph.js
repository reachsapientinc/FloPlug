/**
 * SubFlo compartments, loop regions, and cycle detection on a single flo graph.
 */
import { NODE_TYPES } from '../constants/constants.js';
import { ERROR_HANDLE } from '../types/errorHandling.js';
import { LOOP_LOOP_HANDLE, LOOP_EXIT_HANDLE } from '../types/subFloNode.js';
export function nodeSubFloId(node) {
    const id = node.data?.subFloId;
    return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}
/** Compartment anchor id — SubFlo node id, or tagged subFloId on member nodes. */
export function nodeCompartmentId(node) {
    if (node.type === NODE_TYPES.SUB_FLO)
        return node.id;
    return nodeSubFloId(node) ?? '';
}
/**
 * Whether an edge may connect source → target without crossing compartment boundaries.
 * SubFlo anchor may wire to nodes not yet tagged (they join the compartment on connect).
 */
export function compartmentsCompatible(src, tgt) {
    const srcC = nodeCompartmentId(src);
    const tgtC = nodeCompartmentId(tgt);
    if (srcC === tgtC)
        return true;
    if (src.type === NODE_TYPES.LOOP || tgt.type === NODE_TYPES.LOOP)
        return true;
    if (src.type === NODE_TYPES.SUB_FLO && !tgtC)
        return true;
    if (tgt.type === NODE_TYPES.SUB_FLO && !srcC)
        return true;
    return false;
}
/** Main-flow nodes only (exclude subflo compartments). */
export function filterMainFlowNodes(nodes) {
    return nodes.filter(n => !nodeSubFloId(n));
}
export function filterMainFlowEdges(nodes, edges) {
    const mainIds = new Set(filterMainFlowNodes(nodes).map(n => n.id));
    return edges.filter(e => mainIds.has(e.source) && mainIds.has(e.target));
}
export function getSubFloCompartment(allNodes, anchorId) {
    const nodes = allNodes.filter(n => n.id === anchorId || nodeSubFloId(n) === anchorId);
    const ids = new Set(nodes.map(n => n.id));
    return {
        nodes,
        edges: [], // caller passes allEdges filtered
    };
}
export function compartmentEdges(compartmentNodeIds, allEdges) {
    return allEdges.filter(e => compartmentNodeIds.has(e.source) && compartmentNodeIds.has(e.target));
}
export function listSubFloAnchors(nodes) {
    return nodes.filter(n => n.type === NODE_TYPES.SUB_FLO);
}
/** Nodes reachable from loop handle, excluding loop node itself. */
export function collectLoopRegionNodeIds(loopNodeId, nodes, edges) {
    const nodeIds = new Set(nodes.map(n => n.id));
    const loopTargets = edges
        .filter(e => e.source === loopNodeId && (e.sourceHandle ?? '') === LOOP_LOOP_HANDLE)
        .map(e => e.target)
        .filter(id => nodeIds.has(id));
    const region = new Set();
    const queue = [...loopTargets];
    while (queue.length > 0) {
        const id = queue.shift();
        if (id === loopNodeId || region.has(id))
            continue;
        region.add(id);
        for (const e of edges) {
            if (e.source === id && e.target !== loopNodeId && nodeIds.has(e.target) && !region.has(e.target)) {
                queue.push(e.target);
            }
        }
    }
    return region;
}
/** Union of all loop-region node ids (excluded from main topo). */
export function allLoopRegionNodeIds(nodes, edges) {
    const out = new Set();
    for (const n of nodes) {
        if (n.type !== NODE_TYPES.LOOP)
            continue;
        for (const id of collectLoopRegionNodeIds(n.id, nodes, edges)) {
            out.add(id);
        }
    }
    return out;
}
export function filterExecutableMainNodes(nodes, edges) {
    const loopRegion = allLoopRegionNodeIds(nodes, edges);
    return nodes.filter(n => !nodeSubFloId(n) && !loopRegion.has(n.id));
}
export function filterExecutableMainEdges(nodes, edges) {
    const mainIds = new Set(filterExecutableMainNodes(nodes, edges).map(n => n.id));
    return edges.filter(e => mainIds.has(e.source) && mainIds.has(e.target) && (e.sourceHandle ?? '') !== ERROR_HANDLE);
}
/** Static cycle detection via DFS (for validation). */
export function findGraphCycles(nodes, edges) {
    const adj = new Map();
    for (const n of nodes)
        adj.set(n.id, []);
    for (const e of edges) {
        if (adj.has(e.source))
            adj.get(e.source).push(e.target);
    }
    const cycles = [];
    const stack = [];
    const inStack = new Set();
    const visited = new Set();
    const dfs = (id) => {
        visited.add(id);
        inStack.add(id);
        stack.push(id);
        for (const next of adj.get(id) ?? []) {
            if (!visited.has(next)) {
                dfs(next);
            }
            else if (inStack.has(next)) {
                const idx = stack.indexOf(next);
                if (idx >= 0)
                    cycles.push(stack.slice(idx).concat(next));
            }
        }
        stack.pop();
        inStack.delete(id);
    };
    for (const n of nodes) {
        if (!visited.has(n.id))
            dfs(n.id);
    }
    return cycles;
}
/** InvokeSubFlo → SubFlo → … → InvokeSubFlo same target. */
export function detectSubFloInvokeCycle(anchorId, compartmentNodes, edges) {
    const invokeIds = compartmentNodes
        .filter(n => n.type === NODE_TYPES.INVOKE_SUB_FLO)
        .map(n => n.id);
    if (invokeIds.length === 0)
        return false;
    const adj = new Map();
    for (const n of compartmentNodes)
        adj.set(n.id, []);
    for (const e of edges) {
        if (adj.has(e.source) && adj.has(e.target))
            adj.get(e.source).push(e.target);
    }
    for (const startId of invokeIds) {
        const stack = [startId];
        const seen = new Set();
        while (stack.length) {
            const id = stack.pop();
            if (seen.has(id))
                continue;
            seen.add(id);
            const node = compartmentNodes.find(n => n.id === id);
            if (node?.type === NODE_TYPES.INVOKE_SUB_FLO
                && String(node.data?.targetSubFloId ?? '') === anchorId
                && id !== startId) {
                return true;
            }
            for (const next of adj.get(id) ?? [])
                stack.push(next);
        }
    }
    return false;
}
export function loopHasExitEdge(loopNodeId, edges) {
    return edges.some(e => e.source === loopNodeId && (e.sourceHandle ?? '') === LOOP_EXIT_HANDLE);
}
export function loopHasLoopEdge(loopNodeId, edges) {
    return edges.some(e => e.source === loopNodeId && (e.sourceHandle ?? '') === LOOP_LOOP_HANDLE);
}
