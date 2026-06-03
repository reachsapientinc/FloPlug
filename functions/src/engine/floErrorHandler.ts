/**
 * Runtime error propagation — walk executed path backward, route error handle.
 */

import type { RunContext } from '@floplug/shared';
import {
  buildFloException,
  collectForwardReachable,
  effectiveCatchScope,
  findErrorPathEdge,
  getStartErrorDefaults,
  isOnExecutedPath,
  resolveErrorPathCStream,
  type ErrorGraphEdge,
  type ErrorGraphNode,
} from '@floplug/shared';
import { floActionErrorToHubDiagnostics } from './floActionHubDiagnostics.js';

export class UnhandledFloError extends Error {
  constructor(
    message: string,
    public readonly exception: ReturnType<typeof buildFloException>,
  ) {
    super(message);
    this.name = 'UnhandledFloError';
  }
}

function ensurePathState(ctx: RunContext) {
  if (!ctx.executionPath) {
    ctx.executionPath = { parentOnPath: {}, cStreamAtNode: {}, errorPropagation: [] };
  }
  return ctx.executionPath;
}

export function recordNodeExecutionParent(
  ctx: RunContext,
  nodeId: string,
  parentId: string | null,
): void {
  ensurePathState(ctx).parentOnPath[nodeId] = parentId;
}

export function recordNodeCStreamSnapshot(
  ctx: RunContext,
  nodeId: string,
  cStream: unknown,
): void {
  ensurePathState(ctx).cStreamAtNode[nodeId] = cStream;
}

export interface ErrorHandlerDeps {
  allNodes:       ErrorGraphNode[];
  allEdges:       ErrorGraphEdge[];
  runSubgraph:    (
    nodes: ErrorGraphNode[],
    edges: ErrorGraphEdge[],
    initialCStream: unknown,
    ctx: RunContext,
  ) => Promise<unknown>;
}

export async function handleExecutionError(
  err: unknown,
  node: ErrorGraphNode,
  ctx: RunContext,
  hubBeforeRaw: Record<string, unknown> | undefined,
  httpTrace: Record<string, unknown> | undefined,
  deps: ErrorHandlerDeps,
): Promise<{ handled: boolean; resultCStream?: unknown }> {
  const pathState = ensurePathState(ctx);
  const defaults = getStartErrorDefaults(deps.allNodes);
  const hubDiag = floActionErrorToHubDiagnostics(err);
  const exception = buildFloException(
    hubDiag.error ?? err,
    node,
    pathState.cStreamAtNode[node.id] ?? hubBeforeRaw,
    httpTrace,
  );
  ctx.store.local.exception = exception;

  const byId = new Map(deps.allNodes.map(n => [n.id, n]));
  let current: string | null = node.id;

  while (current) {
    const candidate = byId.get(current);
    if (candidate) {
      const scope = effectiveCatchScope(candidate, defaults);
      const matches = (scope === 'self' && current === node.id)
        || (scope === 'subtree' && isOnExecutedPath(current, node.id, pathState.parentOnPath));
      if (matches) {
        const errorEdge = findErrorPathEdge(candidate.id, deps.allEdges);
        if (errorEdge) {
          exception.caughtByNodeId = candidate.id;
          ctx.store.local.exception = exception;
          pathState.errorPropagation?.push({
            from: node.id,
            to: candidate.id,
            action: 'caught',
          });

          const errorCStream = resolveErrorPathCStream(
            candidate,
            exception,
            pathState,
            ctx.store,
            defaults,
          );

          const reachable = collectForwardReachable(errorEdge.target, deps.allEdges);
          const subNodes = deps.allNodes.filter(n => reachable.has(n.id));
          const subEdges = deps.allEdges.filter(
            e => reachable.has(e.source) && reachable.has(e.target),
          );

          ctx.log.push(`${'  '.repeat(ctx.depth)}  ⚡ Error caught at ${candidate.id} → error path`);
          const prevEntry = ctx.entryParentNodeId;
          ctx.entryParentNodeId = candidate.id;
          const resultCStream = await deps.runSubgraph(subNodes, subEdges, errorCStream, ctx);
          ctx.entryParentNodeId = prevEntry;

          return { handled: true, resultCStream };
        }
        pathState.errorPropagation?.push({
          from: node.id,
          to: candidate.id,
          action: 'propagated',
        });
      }
    }
    current = pathState.parentOnPath[current] ?? null;
  }

  pathState.errorPropagation?.push({ from: node.id, to: 'run', action: 'unhandled' });
  if (defaults?.failIfUnhandled !== false) {
    throw new UnhandledFloError(exception.message, exception);
  }
  return { handled: false };
}
