/**
 * Validates an entire flo graph (topology + per-node rules).
 */
import { NODE_TYPES } from '../constants/constants.js';
import { buildFloValidationReport } from '../types/floValidation.js';
import { validateNode, snapshotForNode } from './nodeValidators.js';
function validateGraphTopology(nodes, edges) {
    const issues = [];
    const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
    const starts = nodes.filter(n => n.type === NODE_TYPES.START);
    const ends = nodes.filter(n => n.type === NODE_TYPES.END);
    if (starts.length === 0) {
        issues.push({
            nodeId: '__graph__', nodeType: 'graph', nodeLabel: 'Flow',
            field: 'start', code: 'GRAPH_NO_START', severity: 'error',
            message: 'Flow must have a Start node.',
        });
    }
    if (ends.length === 0) {
        issues.push({
            nodeId: '__graph__', nodeType: 'graph', nodeLabel: 'Flow',
            field: 'end', code: 'GRAPH_NO_END', severity: 'error',
            message: 'Flow must have an End node.',
        });
    }
    const targets = new Set(edges.map(e => e.target));
    const sources = new Set(edges.map(e => e.source));
    for (const n of nodes) {
        if (n.type === NODE_TYPES.START)
            continue;
        if (n.type === NODE_TYPES.END)
            continue;
        if (!targets.has(n.id)) {
            issues.push({
                nodeId: n.id, nodeType: n.type,
                nodeLabel: String(n.data.label ?? n.id),
                field: 'edges', code: 'GRAPH_DISCONNECTED', severity: 'warning',
                message: 'Node has no incoming connection.',
            });
        }
        if (!sources.has(n.id) && n.type !== NODE_TYPES.END) {
            issues.push({
                nodeId: n.id, nodeType: n.type,
                nodeLabel: String(n.data.label ?? n.id),
                field: 'edges', code: 'GRAPH_DISCONNECTED', severity: 'warning',
                message: 'Node has no outgoing connection.',
            });
        }
    }
    for (const e of edges) {
        if (!nodeMap[e.source] || !nodeMap[e.target]) {
            issues.push({
                nodeId: '__graph__', nodeType: 'graph', nodeLabel: 'Flow',
                field: 'edges', code: 'GRAPH_DISCONNECTED', severity: 'error',
                message: `Edge references missing node: ${e.source} → ${e.target}`,
            });
        }
    }
    return issues;
}
export function validateFloGraph(input) {
    const { floId, floName, nodes, edges, resources, checkResources = false, } = input;
    const allIssues = [
        ...validateGraphTopology(nodes, edges),
    ];
    const snapshots = [];
    for (const node of nodes) {
        if (node.type === NODE_TYPES.START || node.type === NODE_TYPES.END) {
            snapshots.push(snapshotForNode(node, [], undefined));
            continue;
        }
        const { issues, metrics } = validateNode(node, resources, checkResources);
        allIssues.push(...issues);
        snapshots.push(snapshotForNode(node, issues, metrics));
    }
    return buildFloValidationReport(allIssues, snapshots, { floId, floName });
}
