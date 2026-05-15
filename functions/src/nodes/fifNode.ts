/**
 * functions/src/nodes/fifNode.ts
 *
 * Flow-in-Flow executor.
 *
 * Loads a sub-flo from Firestore, runs it with a fresh local store
 * (global store is shared), and returns the sub-flo's output as cStream.
 *
 * executeFloNodes is injected to avoid a circular import — index.ts
 * defines it and passes it in when calling this executor.
 */

import type {RunContext,FloNode, FloEdge,  NodeResult } from '@floplug/shared';

// ── Flow loader type ──────────────────────────────────────────────────────────
export type FlowLoader = (
  hubId:    string,
  tenantId: string,
  wsId:     string,
  floId:   string,
) => Promise<{ nodes: FloNode[]; edges: FloEdge[] }>;

// ── Flow runner type (injected to avoid circular import) ──────────────────────
export type FlowRunner = (
  nodes:         FloNode[],
  edges:         FloEdge[],
  initialCStream: unknown,
  ctx:           RunContext,
) => Promise<unknown>;

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeFifNode(
  cStream:     unknown,
  nd:          Record<string, any>,
  ctx:         RunContext,
  loadFlow:    FlowLoader,
  runFlow:     FlowRunner,
): Promise<NodeResult> {
  const subFlowId = String(nd.selectedFlowId ?? '');

  if (!subFlowId) {
    return { cStream, logLine: '⚠ FIF: no sub-flo selected — skipped' };
  }

  if (ctx.depth >= 5) {
    return { cStream, logLine: '⚠ FIF: max nesting depth reached — skipped' };
  }

  const { hubId, tenantId, wsId } = ctx;

  let subNodes: FloNode[];
  let subEdges: FloEdge[];

  try {
    const loaded = await loadFlow(hubId, tenantId, wsId, subFlowId);
    subNodes = loaded.nodes;
    subEdges = loaded.edges;
  } catch (e: any) {
    return { cStream, logLine: `⚠ FIF: failed to load ${subFlowId} — ${e.message}` };
  }

  const subCtx: RunContext = {
    ...ctx,
    depth: ctx.depth + 1,
    store: { global: ctx.store.global, local: {} },  // fresh local scope
  };

  const result = await runFlow(subNodes, subEdges, cStream, subCtx);

  return {
    cStream: result,
    logLine: `✓ FIF: ${subFlowId} (${subNodes.length} nodes)`,
  };
}
