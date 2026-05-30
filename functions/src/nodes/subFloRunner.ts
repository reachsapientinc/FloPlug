/**
 * Execute an inline SubFlo compartment on the same canvas.
 */

import {
  NODE_TYPES,
  buildEvalContext,
  safeEvalExpression,
  isReservedStoreKey,
  nodeDisplayTitle,
  type NodeResult,
  type RunContext,
} from '@floplug/shared';
import type { SubFloInputArg, SubFloInputBinding, SubFloReturnBinding } from '@floplug/shared';
import { compartmentEdges, nodeSubFloId } from '@floplug/shared';
import { unwrapWithMeta } from '../nodes/cStreamMeta.js';
import { getValue } from '../utils/pathUtils.js';

export interface FloNode { id: string; type: string; data: Record<string, unknown>; }
export interface FloEdge {
  source:       string;
  target:       string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export type FloRunner = (
  nodes:          FloNode[],
  edges:          FloEdge[],
  initialCStream: unknown,
  ctx:            RunContext,
) => Promise<unknown>;

export class SubFloReturnSignal extends Error {
  constructor(
    readonly returnValues: Record<string, unknown>,
    readonly cStream: unknown,
  ) {
    super('SubFloReturn');
    this.name = 'SubFloReturnSignal';
  }
}

function resolveReturnBinding(
  binding: SubFloReturnBinding,
  cStream: unknown,
  store: { local: Record<string, unknown>; global: Record<string, unknown> },
  floRunMeta: RunContext['floRunMeta'],
): unknown {
  const { value: msg } = unwrapWithMeta(cStream);
  const item = (msg && typeof msg === 'object' && !Array.isArray(msg))
    ? msg as Record<string, unknown>
    : {};
  const ctx = buildEvalContext(
    typeof cStream === 'object' && cStream !== null
      ? cStream as Record<string, unknown>
      : { message: cStream },
    store,
    floRunMeta,
  );

  if (binding.source === 'expression') {
    return safeEvalExpression(binding.value, ctx, undefined);
  }
  if (binding.source === 'local') {
    return getValue(store.local, binding.value);
  }
  return getValue(item, binding.value) ?? getValue(cStream, binding.value);
}

export function executeSubFloReturnNode(
  cStream: unknown,
  nd: Record<string, unknown>,
  store: { local: Record<string, unknown>; global: Record<string, unknown> },
  floRunMeta?: RunContext['floRunMeta'],
): SubFloReturnSignal {
  const bindings = (nd.returnBindings as SubFloReturnBinding[] | undefined) ?? [];
  const returnValues: Record<string, unknown> = {};
  for (const b of bindings) {
    if (!b.argName?.trim()) continue;
    returnValues[b.argName.trim()] = resolveReturnBinding(b, cStream, store, floRunMeta);
  }
  return new SubFloReturnSignal(returnValues, cStream);
}

function bindSubFloInputs(
  anchor: FloNode,
  bindings: SubFloInputBinding[],
  store: { local: Record<string, unknown>; global: Record<string, unknown> },
  cStream: unknown,
  floRunMeta?: RunContext['floRunMeta'],
): Record<string, unknown> {
  const inputArgs = (anchor.data.inputArgs as SubFloInputArg[] | undefined) ?? [];
  const bindingMap = Object.fromEntries(
    bindings.map(b => [b.argName, b.valueExpr]),
  );
  const subLocal: Record<string, unknown> = {};
  const { value: msg } = unwrapWithMeta(cStream);
  const item = (msg && typeof msg === 'object' && !Array.isArray(msg))
    ? msg as Record<string, unknown>
    : {};
  const ctx = buildEvalContext(
    typeof cStream === 'object' && cStream !== null
      ? cStream as Record<string, unknown>
      : { message: cStream },
    store,
    floRunMeta,
  );

  for (const arg of inputArgs) {
    const name = arg.name?.trim();
    if (!name || isReservedStoreKey(name)) continue;
    const raw = bindingMap[name]?.trim() || arg.defaultValue?.trim() || '';
    if (!raw) {
      if (arg.required) {
        throw new Error(`SubFlo input "${name}" is required`);
      }
      continue;
    }
    subLocal[name] = safeEvalExpression(raw, ctx, raw);
    void item;
  }
  return subLocal;
}

export async function executeInvokeSubFloNode(
  cStream:   unknown,
  nd:        Record<string, unknown>,
  ctx:       RunContext,
  allNodes:  FloNode[],
  allEdges:  FloEdge[],
  runFlow:   FloRunner,
): Promise<NodeResult & { returnValues?: Record<string, unknown> }> {
  const targetId = String(nd.targetSubFloId ?? '');
  if (!targetId) {
    return { cStream, logLine: '⚠ InvokeSubFlo: no SubFlo selected — skipped' };
  }

  const anchor = allNodes.find(n => n.id === targetId && n.type === NODE_TYPES.SUB_FLO);
  if (!anchor) {
    return { cStream, logLine: `⚠ InvokeSubFlo: SubFlo ${targetId} not found` };
  }

  if (ctx.depth >= 5) {
    return { cStream, logLine: '⚠ InvokeSubFlo: max nesting depth reached' };
  }

  const compartmentNodes = allNodes.filter(
    n => n.id === targetId || nodeSubFloId(n) === targetId,
  );
  const ids = new Set(compartmentNodes.map(n => n.id));
  const compartmentEdgesList = compartmentEdges(ids, allEdges);

  const bindings = (nd.inputBindings as SubFloInputBinding[] | undefined) ?? [];
  let subLocal: Record<string, unknown>;
  try {
    subLocal = bindSubFloInputs(anchor, bindings, ctx.store, cStream, ctx.floRunMeta);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { cStream, logLine: `⚠ InvokeSubFlo: ${msg}` };
  }

  const subCtx: RunContext = {
    ...ctx,
    depth: ctx.depth + 1,
    store: { global: ctx.store.global, local: { ...subLocal } },
  };

  let resultCStream = cStream;
  let returnValues: Record<string, unknown> = {};

  try {
    resultCStream = await runFlow(
      compartmentNodes,
      compartmentEdgesList,
      cStream,
      subCtx,
    );
  } catch (e: unknown) {
    if (e instanceof SubFloReturnSignal) {
      resultCStream = e.cStream;
      returnValues = e.returnValues;
    } else {
      throw e;
    }
  }

  const returnArgs = (anchor.data.returnArgs as { name: string }[] | undefined) ?? [];
  for (const arg of returnArgs) {
    const name = arg.name?.trim();
    if (!name || isReservedStoreKey(name)) continue;
    if (returnValues[name] !== undefined) {
      ctx.store.local[name] = returnValues[name];
    }
  }

  const canvasName = nodeDisplayTitle(anchor.data as Record<string, unknown>, targetId);
  return {
    cStream: resultCStream,
    returnValues,
    logLine: `✓ InvokeSubFlo: ${canvasName} (${Object.keys(returnValues).length} return arg(s))`,
  };
}
