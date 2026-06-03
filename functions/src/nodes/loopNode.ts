/**
 * Loop node — two canvas routes (loop / exit). Re-runs loop-region nodes until continueExpr is false.
 */

import {
  LOOP_EXIT_HANDLE,
  buildEvalContext,
  safeEvalExpression,
  isReservedStoreKey,
  collectLoopRegionNodeIds,
  compartmentEdges,
  type NodeResult,
  type RunContext,
} from '@floplug/shared';
import { unwrapWithMeta } from '../nodes/cStreamMeta.js';
import type { FloNode, FloEdge, FloRunner } from './subFloRunner.js';

const DEFAULT_MAX = 500;

function evalContinue(
  expr: string,
  cStream: unknown,
  store: { local: Record<string, unknown>; global: Record<string, unknown> },
  iteration: number,
  floRunMeta?: RunContext['floRunMeta'],
): boolean {
  const ctx = buildEvalContext(
    typeof cStream === 'object' && cStream !== null
      ? cStream as Record<string, unknown>
      : { message: cStream },
    store,
    floRunMeta,
  );
  (ctx as Record<string, unknown>).iteration = iteration;
  return Boolean(safeEvalExpression(expr, ctx, false));
}

export interface LoopNodeResult extends NodeResult {
  activeHandle: typeof LOOP_EXIT_HANDLE;
}

export async function executeLoopNode(
  cStream:    unknown,
  nd:         Record<string, unknown>,
  ctx:        RunContext,
  allNodes:   FloNode[],
  allEdges:   FloEdge[],
  runFlow:    FloRunner,
  loopNodeId: string,
): Promise<LoopNodeResult> {
  const continueExpr       = String(nd.continueExpr ?? 'false');
  const executeAtLeastOnce = nd.executeAtLeastOnce !== false;
  const maxIter            = Math.min(Math.max(1, Number(nd.maxIterations ?? 100)), DEFAULT_MAX);
  const outputTarget       = String(nd.outputTarget ?? 'cStream') as 'cStream' | 'local' | 'global';
  const outputVarName      = String(nd.outputVarName ?? '').trim();

  const regionIds = collectLoopRegionNodeIds(loopNodeId, allNodes, allEdges);
  if (regionIds.size === 0) {
    return {
      cStream,
      activeHandle: LOOP_EXIT_HANDLE,
      logLine: '⚠ Loop: no nodes on loop path — taking exit',
    };
  }

  const regionNodes = allNodes.filter(n => regionIds.has(n.id));
  const regionEdges = compartmentEdges(regionIds, allEdges);
  const preLoopLocal = { ...ctx.store.local };
  let iterCStream: unknown = cStream;
  let iteration = 0;
  const lines: string[] = [];

  const runBody = async () => {
    ctx.store.local = { ...preLoopLocal };
    const loopCtx: RunContext = {
      ...ctx,
      store: { global: ctx.store.global, local: { ...preLoopLocal } },
      entryParentNodeId: loopNodeId,
      executionPath: ctx.executionPath,
    };
    iterCStream = await runFlow(regionNodes, regionEdges, iterCStream, loopCtx);
    ctx.store.local = { ...loopCtx.store.local };
  };

  const shouldContinue = () => evalContinue(
    continueExpr, iterCStream, ctx.store, iteration, ctx.floRunMeta,
  );

  if (!executeAtLeastOnce && !shouldContinue()) {
    ctx.store.local = { ...preLoopLocal };
    lines.push('↻ Loop: skipped body (continue false before first run)');
    return { cStream: iterCStream, activeHandle: LOOP_EXIT_HANDLE, logLine: lines.join(' | ') };
  }

  do {
    if (iteration >= maxIter) {
      lines.push(`⚠ Loop: max iterations (${maxIter}) — forced exit`);
      break;
    }
    await runBody();
    iteration++;
    lines.push(`↻ Loop iteration ${iteration}`);
  } while (iteration < maxIter && shouldContinue());

  ctx.store.local = { ...preLoopLocal };

  let outCStream = iterCStream;
  if (outputTarget === 'local' && outputVarName && !isReservedStoreKey(outputVarName)) {
    ctx.store.local[outputVarName] = unwrapWithMeta(iterCStream).value;
    outCStream = cStream;
    lines.push(`✓ Loop result → local.${outputVarName}`);
  } else if (outputTarget === 'global' && outputVarName && !isReservedStoreKey(outputVarName)) {
    ctx.store.global[outputVarName] = unwrapWithMeta(iterCStream).value;
    outCStream = cStream;
    lines.push(`✓ Loop result → global.${outputVarName}`);
  } else {
    outCStream = iterCStream;
    lines.push('✓ Loop: exit path uses last iteration cStream');
  }

  lines.push(`✓ Loop complete (${iteration} iteration(s))`);
  return { cStream: outCStream, activeHandle: LOOP_EXIT_HANDLE, logLine: lines.join(' | ') };
}

export { LOOP_LOOP_HANDLE, LOOP_EXIT_HANDLE } from '@floplug/shared';
