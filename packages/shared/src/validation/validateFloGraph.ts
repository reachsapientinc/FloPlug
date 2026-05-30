/**
 * Validates an entire flo graph (topology + per-node rules).
 */

import { NODE_TYPES } from '../constants/constants.js';
import type { FloNode, FloEdge } from '../types/nodeTypes.js';
import type {
  FloValidationReport,
  ValidateFloGraphInput,
  FloValidationIssue,
  FloNodeValidationSnapshot,
} from '../types/floValidation.js';
import { buildFloValidationReport } from '../types/floValidation.js';
import { validateNode, snapshotForNode } from './nodeValidators.js';
import type { SubFloInputArg, SubFloInputBinding } from '../types/subFloNode.js';
import {
  allLoopRegionNodeIds,
  collectLoopRegionNodeIds,
  compartmentEdges,
  compartmentsCompatible,
  detectSubFloInvokeCycle,
  listSubFloAnchors,
  loopHasExitEdge,
  loopHasLoopEdge,
  nodeSubFloId,
} from '../utils/subFloGraph.js';
import { nodeLabel } from './bindings.js';

function validateGraphSubFloAndLoop(
  nodes: FloNode[],
  edges: FloEdge[],
): FloValidationIssue[] {
  const issues: FloValidationIssue[] = [];
  const loopRegion = allLoopRegionNodeIds(nodes, edges);
  const anchors = listSubFloAnchors(nodes);
  const canvasNames = new Map<string, string>();

  for (const anchor of anchors) {
    const d = anchor.data as Record<string, unknown>;
    const name = String(d.displayName ?? d.canvasName ?? '').trim();
    if (name && canvasNames.has(name)) {
      issues.push({
        nodeId: anchor.id, nodeType: anchor.type,
        nodeLabel: nodeLabel(d, anchor.id),
        field: 'displayName', code: 'DUPLICATE_NAME', severity: 'error',
        message: `Duplicate SubFlo display name "${name}".`,
      });
    }
    if (name) canvasNames.set(name, anchor.id);

    const compartment = nodes.filter(
      n => n.id === anchor.id || nodeSubFloId(n) === anchor.id,
    );
    const ids = new Set(compartment.map(n => n.id));
    const cEdges = compartmentEdges(ids, edges);
    const hasReturn = compartment.some(n => n.type === NODE_TYPES.SUB_FLO_RETURN);
    if (!hasReturn) {
      issues.push({
        nodeId: anchor.id, nodeType: anchor.type,
        nodeLabel: nodeLabel(d, anchor.id),
        field: 'compartment', code: 'SUBFLO_NO_RETURN', severity: 'error',
        message: 'SubFlo compartment needs a SubFloReturn node.',
      });
    }
    if (detectSubFloInvokeCycle(anchor.id, compartment, cEdges)) {
      issues.push({
        nodeId: anchor.id, nodeType: anchor.type,
        nodeLabel: nodeLabel(d, anchor.id),
        field: 'compartment', code: 'SUBFLO_CYCLE', severity: 'error',
        message: 'SubFlo compartment has a circular InvokeSubFlo reference.',
      });
    }
  }

  for (const n of nodes) {
    if (n.type !== NODE_TYPES.LOOP) continue;
    if (!loopHasLoopEdge(n.id, edges)) {
      issues.push({
        nodeId: n.id, nodeType: n.type,
        nodeLabel: nodeLabel(n.data as Record<string, unknown>, n.id),
        field: 'loop', code: 'LOOP_NO_BODY', severity: 'error',
        message: 'Loop needs a wire on the loop execution path.',
      });
    }
    if (!loopHasExitEdge(n.id, edges)) {
      issues.push({
        nodeId: n.id, nodeType: n.type,
        nodeLabel: nodeLabel(n.data as Record<string, unknown>, n.id),
        field: 'exit', code: 'LOOP_NO_EXIT', severity: 'error',
        message: 'Loop needs a wire on the loop exit path.',
      });
    }
    const region = collectLoopRegionNodeIds(n.id, nodes, edges);
    if (region.size === 0) {
      issues.push({
        nodeId: n.id, nodeType: n.type,
        nodeLabel: nodeLabel(n.data as Record<string, unknown>, n.id),
        field: 'loop', code: 'LOOP_EMPTY_BODY', severity: 'warning',
        message: 'Loop execution path has no nodes.',
      });
    }
  }

  for (const n of nodes) {
    if (n.type !== NODE_TYPES.INVOKE_SUB_FLO) continue;
    const d = n.data as Record<string, unknown>;
    const targetId = String(d.targetSubFloId ?? '');
    if (!targetId) continue;
    const anchor = nodes.find(x => x.id === targetId && x.type === NODE_TYPES.SUB_FLO);
    if (!anchor) {
      issues.push({
        nodeId: n.id, nodeType: n.type,
        nodeLabel: nodeLabel(d, n.id),
        field: 'targetSubFloId', code: 'SUBFLO_NOT_FOUND', severity: 'error',
        message: 'Selected SubFlo no longer exists on this canvas.',
      });
      continue;
    }
    const inputArgs = ((anchor.data as Record<string, unknown>).inputArgs as SubFloInputArg[] | undefined) ?? [];
    const bindings = (d.inputBindings as SubFloInputBinding[] | undefined) ?? [];
    const bindingMap = Object.fromEntries(bindings.map(b => [b.argName, b.valueExpr]));
    for (const arg of inputArgs) {
      if (!arg.required) continue;
      const val = bindingMap[arg.name]?.trim();
      const def = arg.defaultValue?.trim();
      if (!val && !def) {
        issues.push({
          nodeId: n.id, nodeType: n.type,
          nodeLabel: nodeLabel(d, n.id),
          field: `inputBindings.${arg.name}`, code: 'REQUIRED_FIELD_MISSING', severity: 'error',
          message: `Required SubFlo input "${arg.name}" has no value.`,
        });
      }
    }
  }

  // Cross-compartment edges
  for (const e of edges) {
    const src = nodes.find(n => n.id === e.source);
    const tgt = nodes.find(n => n.id === e.target);
    if (!src || !tgt) continue;
    if (!compartmentsCompatible(src, tgt)) {
      issues.push({
        nodeId: e.source, nodeType: src.type,
        nodeLabel: nodeLabel(src.data as Record<string, unknown>, src.id),
        field: 'edges', code: 'SUBFLO_CROSS_EDGE', severity: 'error',
        message: 'Edges cannot cross SubFlo compartment boundaries (use InvokeSubFlo).',
      });
    }
  }

  void loopRegion;
  return issues;
}

function validateGraphTopology(
  nodes: FloNode[],
  edges: FloEdge[],
): FloValidationIssue[] {
  const issues: FloValidationIssue[] = [];
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const loopRegion = allLoopRegionNodeIds(nodes, edges);
  const starts = nodes.filter(n => n.type === NODE_TYPES.START);
  const ends   = nodes.filter(n => n.type === NODE_TYPES.END);

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

  const skipDisconnected = (n: FloNode) =>
    Boolean(nodeSubFloId(n))
    || loopRegion.has(n.id)
    || n.type === NODE_TYPES.SUB_FLO
    || n.type === NODE_TYPES.SUB_FLO_RETURN;

  for (const n of nodes) {
    if (n.type === NODE_TYPES.START) continue;
    if (n.type === NODE_TYPES.END) continue;
    if (skipDisconnected(n)) continue;
    if (!targets.has(n.id)) {
      issues.push({
        nodeId: n.id, nodeType: n.type,
        nodeLabel: String((n.data as Record<string, unknown>).label ?? n.id),
        field: 'edges', code: 'GRAPH_DISCONNECTED', severity: 'warning',
        message: 'Node has no incoming connection.',
      });
    }
    if (!sources.has(n.id) && n.type !== NODE_TYPES.END) {
      issues.push({
        nodeId: n.id, nodeType: n.type,
        nodeLabel: String((n.data as Record<string, unknown>).label ?? n.id),
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

export function validateFloGraph(input: ValidateFloGraphInput): FloValidationReport {
  const {
    floId,
    floName,
    nodes,
    edges,
    resources,
    checkResources = false,
  } = input;

  const allIssues: FloValidationIssue[] = [
    ...validateGraphTopology(nodes, edges),
    ...validateGraphSubFloAndLoop(nodes, edges),
  ];
  const snapshots: FloNodeValidationSnapshot[] = [];

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
