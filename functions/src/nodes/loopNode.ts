/**
 * functions/src/nodes/loopNode.ts
 *
 * Loop executor — two modes:
 *
 *   iterator   — splits an array at nd.arrayPath and runs the body
 *                once per element. Each iteration receives:
 *                { ...cStream, [itemVar]: element, _index: i, _total: n }
 *
 *   expression — runs while a JS expression evaluates to true.
 *                Expression receives (cStream, global, local, iteration).
 *                Good for pagination, retry, poll-until-done patterns.
 *
 * Store:
 *   global — shared across all iterations and sub-flos
 *   local  — reset at the start of each iteration
 *
 * Output:
 *   cStream after the final iteration.
 *   If nd.storeResultAs is set, the result is also written to global store.
 *
 * executeFloNodes is injected to avoid a circular import.
 */

import { getValue } from '../utils/pathUtils.js';
import type {RunContext,FloNode, FloEdge,  NodeResult} from '@floplug/shared';

export type FloRunner = (
  nodes:          FloNode[],
  edges:          FloEdge[],
  initialCStream: unknown,
  ctx:            RunContext,
) => Promise<unknown>;

const MAX_ITERS = 500;

// ── Main executor ─────────────────────────────────────────────────────────────

export async function executeLoopNode(
  cStream:  unknown,
  nd:       Record<string, any>,
  ctx:      RunContext,
  runFlow:  FloRunner,
): Promise<NodeResult> {
  const mode          = String(nd.mode          ?? 'iterator');
  const bodyNodes     = (nd.bodyNodes  as FloNode[]) ?? [];
  const bodyEdges     = (nd.bodyEdges  as FloEdge[]) ?? [];
  const storeResultAs = String(nd.storeResultAs ?? '');
  const maxIter       = Math.min(Number(nd.maxIterations ?? MAX_ITERS), MAX_ITERS);

  if (bodyNodes.length === 0) {
    return { cStream, logLine: '⚠ Loop: no body nodes — skipped' };
  }

  if (ctx.depth >= 5) {
    return { cStream, logLine: '⚠ Loop: max nesting depth reached — skipped' };
  }

  const loopCtx: RunContext = {
    ...ctx,
    depth: ctx.depth + 1,
    store: { global: ctx.store.global, local: {} },
  };

  let iterCStream: unknown = cStream;
  let iterCount = 0;
  const lines: string[] = [];

  // ── Iterator mode ─────────────────────────────────────────────────────────
  if (mode === 'iterator') {
    const arrayPath = String(nd.arrayPath ?? '');
    const itemVar   = String(nd.itemVar   ?? '_item');

    const arr: any[] = arrayPath
      ? (getValue(cStream, arrayPath) ?? [])
      : (Array.isArray(cStream) ? cStream : []);

    if (!Array.isArray(arr)) {
      return {
        cStream,
        logLine: `⚠ Loop iterator: ${arrayPath || 'cStream'} is not an array`,
      };
    }

    lines.push(`↻ Loop iterator: ${arr.length} items`);

    for (let i = 0; i < arr.length && i < maxIter; i++) {
      const itemCStream: Record<string, any> = {
        ...(typeof iterCStream === 'object' && iterCStream ? iterCStream as object : {}),
        [itemVar]: arr[i],
        _index:    i,
        _total:    arr.length,
      };
      loopCtx.store.local = {};  // reset local store each iteration
      iterCStream = await runFlow(bodyNodes, bodyEdges, itemCStream, loopCtx);
      iterCount++;
    }

  // ── Expression mode ───────────────────────────────────────────────────────
  } else {
    const expression = String(nd.expression ?? 'false');
    lines.push(`↻ Loop expression: "${expression}"`);

    // eslint-disable-next-line no-new-func
    const condFn = new Function(
      'cStream', 'global', 'local', 'iteration',
      `return !!(${expression})`,
    );

    while (iterCount < maxIter) {
      const shouldContinue = condFn(
        iterCStream,
        ctx.store.global,
        loopCtx.store.local,
        iterCount,
      );
      if (!shouldContinue) break;

      loopCtx.store.local = {};
      iterCStream = await runFlow(bodyNodes, bodyEdges, iterCStream, loopCtx);
      iterCount++;
    }

    if (iterCount >= maxIter) {
      lines.push(`⚠ Loop hit max iterations (${maxIter})`);
    }
  }

  // ── Persist result to global store if requested ───────────────────────────
  if (storeResultAs) {
    ctx.store.global[storeResultAs] = iterCStream;
    lines.push(`✓ Loop result → global.${storeResultAs}`);
  }

  lines.push(`✓ Loop: ${iterCount} iteration(s) complete`);

  return { cStream: iterCStream, logLine: lines.join(' | ') };
}
