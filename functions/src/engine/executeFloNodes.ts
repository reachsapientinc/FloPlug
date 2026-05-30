// functions/src/engine/executeFloNodes.ts
//
// Changes:
//  1. startNode wraps inputJson as canonical { message: inputJson, _meta: {} }
//  2. endNode reads from unwrapWithMeta — handles both envelope types
//  3. All nodes receive nd.outputTarget / nd.outputVarName so the engine
//     can honour local/global storage without changing individual node files
//  4. PLUG case routes by nodeType then authProtocol fallback
//  5. safeCs() helper normalises incoming cStream to canonical shape if needed

import { getFirestore }              from 'firebase-admin/firestore';
import { executeMapper }             from '../nodes/mapperNode.js';
import { executeFilterNode }         from '../nodes/filterNode.js';
import { executeSwitchNode }         from '../nodes/switchNode.js';
import { executeFunctionNode }       from '../nodes/functionNode.js';
import { executeVariableStoreNode }  from '../nodes/variableStoreNode.js';
import { executeTemplateNode }       from '../nodes/templateNode.js';
import { executeFifNode }            from '../nodes/fifNode.js';
import { executeLoopNode } from '../nodes/loopNode.js';
import {
  executeInvokeSubFloNode,
  executeSubFloReturnNode,
} from '../nodes/subFloRunner.js';
import { executePlugNode }           from '../nodes/plugNode.js';
import { executeEmailNode }          from '../nodes/emailNode.js';
import { executeFloActionNode }      from './executeFloActionNode.js';
import { floActionErrorToHubDiagnostics } from './floActionHubDiagnostics.js';
import type { HubFloActionDocCache } from './resolveFloActionNodeHub.js';
import {
  executeWorkdayNode, executeSalesforceNode,
  executeSapNode, executeOracleNode,
}                                    from '../nodes/connectorNodes.js';
import { unwrapWithMeta, isEnvelope } from '../nodes/cStreamMeta.js';
import { wrapMessage }               from '../nodes/cStreamMeta.js';
import { getValue, setValue }        from '../utils/pathUtils.js';
import type { RunContext, NodeExecutionHubPayload, NodeHttpTrace } from '@floplug/shared';
import { isReservedStoreKey } from '@floplug/shared';
import { NODE_TYPES, COLLECTIONS, HUB_COLLECTIONS, getPublishedGraph } from '@floplug/shared';
import {
  filterExecutableMainNodes,
  filterExecutableMainEdges,
} from '@floplug/shared';
import {
  nodeLabel,
  parseNodeDataPersistence,
  buildPersistedInputSnapshot,
  buildPersistedOutputSnapshot,
  shouldPersistNodeExecution,
} from '@floplug/shared';
import { RunKilledError, touchRunHeartbeat } from './runLifecycle.js';

const db = getFirestore();

function cloneForHubRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || value === undefined) return undefined;
  try {
    const cloned = JSON.parse(JSON.stringify(value));
    return typeof cloned === 'object' && !Array.isArray(cloned)
      ? cloned as Record<string, unknown>
      : { value: cloned };
  } catch {
    return { _summary: String(value).slice(0, 500) };
  }
}

interface FloNode { id: string; type: string; data: Record<string, unknown>; }
interface FloEdge {
  source:       string;
  target:       string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

const MAX_DEPTH = 5;

/**
 * Ensure cStream is always in canonical { message, _meta } shape.
 * Wraps legacy plain objects/values that pre-date the canonical structure.
 */
function safeCs(val: unknown): Record<string, unknown> {
  if (val === null || val === undefined) return wrapMessage(null) as Record<string, unknown>;
  if (typeof val === 'object' && val !== null && 'message' in (val as object)) {
    return val as Record<string, unknown>;
  }
  if (isEnvelope(val)) {
    const { value, contentType } = unwrapWithMeta(val);
    return wrapMessage(value, { contentType }) as Record<string, unknown>;
  }
  return wrapMessage(val) as Record<string, unknown>;
}

export function topoSort(nodes: FloNode[], edges: FloEdge[]): FloNode[] {
  const deg: Record<string, number>   = {};
  const adj: Record<string, string[]> = {};
  for (const n of nodes) { deg[n.id] = 0; adj[n.id] = []; }
  for (const e of edges) { adj[e.source].push(e.target); deg[e.target]++; }
  const queue = nodes.filter(n => deg[n.id] === 0).map(n => n.id);
  const out: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const nxt of adj[id]) { if (--deg[nxt] === 0) queue.push(nxt); }
  }
  const map = Object.fromEntries(nodes.map(n => [n.id, n]));
  return out.map(id => map[id]).filter(Boolean);
}

export async function loadFlo(
  hubId: string, tenantId: string, wsId: string, floId: string
): Promise<{ nodes: FloNode[]; edges: FloEdge[] }> {
  const snap = await db
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
    .collection(HUB_COLLECTIONS.WORKSPACES).doc(wsId)
    .collection(HUB_COLLECTIONS.FLOS).doc(floId)
    .get();
  if (!snap.exists) throw new Error(`Flo ${floId} not found in ws ${wsId}`);
  const d = snap.data()!;
  const published = getPublishedGraph(d as Record<string, unknown>);
  if (!published?.nodes?.length) {
    throw new Error(`Flo ${floId} has no published graph — publish before invoking as sub-flow.`);
  }
  return { nodes: published.nodes as FloNode[], edges: published.edges as FloEdge[] };
}

async function getConnectorCreds(
  hubId: string, tenantId: string, connectorId: string
): Promise<Record<string, string> | null> {
  try {
    const snap = await db
      .collection(COLLECTIONS.HUBS).doc(hubId)
      .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
      .collection(HUB_COLLECTIONS.CONNECTORS).doc(connectorId)
      .get();
    return snap.exists ? (snap.data() as Record<string, string>) : null;
  } catch { return null; }
}

export async function executeFloNodes(
  nodes:          FloNode[],
  edges:          FloEdge[],
  initialCStream: unknown,
  ctx:            RunContext
): Promise<unknown> {
  if (ctx.depth > MAX_DEPTH) {
    ctx.log.push(`⚠ Max nesting depth (${MAX_DEPTH}) reached — aborting sub-flo`);
    return initialCStream;
  }

  const allNodes = (ctx.graphNodes as FloNode[] | undefined) ?? nodes;
  const allEdges = (ctx.graphEdges as FloEdge[] | undefined) ?? edges;
  ctx.graphNodes = allNodes;
  ctx.graphEdges = allEdges;

  const runningFullGraph = nodes.length === allNodes.length;
  const execNodes = runningFullGraph
    ? filterExecutableMainNodes(allNodes, allEdges) as FloNode[]
    : nodes;
  const execEdges = runningFullGraph
    ? filterExecutableMainEdges(allNodes, allEdges) as FloEdge[]
    : edges;

  return executeFloNodesInner(execNodes, execEdges, initialCStream, ctx, allNodes, allEdges);
}

async function executeFloNodesInner(
  nodes:          FloNode[],
  edges:          FloEdge[],
  initialCStream: unknown,
  ctx:            RunContext,
  allNodes:       FloNode[],
  allEdges:       FloEdge[],
): Promise<unknown> {
  if (ctx.depth > MAX_DEPTH) {
    ctx.log.push(`⚠ Max nesting depth (${MAX_DEPTH}) reached — aborting sub-flo`);
    return initialCStream;
  }

  const { hubId, tenantId, store, log } = ctx;
  const dryRun = ctx.dryRun === true;
  if (dryRun) {
    log.push(`${'  '.repeat(ctx.depth)}[DRY RUN] Simulated execution — no outbound I/O`);
  }
  const hubFloActionCache: HubFloActionDocCache = ctx.hubFloActionCache ?? new Map();
  if (!ctx.hubFloActionCache) ctx.hubFloActionCache = hubFloActionCache;
  const outputs: Record<string, unknown> = {};
  /** floSwitchNode id → winning sourceHandle (branch id or __default__). */
  const switchRoutes: Record<string, string> = {};
  /** loopNode id → exit handle after loop completes. */
  const loopRoutes: Record<string, string> = {};
  const ordered = topoSort(nodes, edges);

  // Wrap the initial input as canonical cStream on entry
  const canonicalInitial = safeCs(initialCStream);
  let lastCStream: unknown = canonicalInitial;

  for (const node of ordered) {
    if (ctx.shouldAbort && await ctx.shouldAbort()) {
      log.push(`${'  '.repeat(ctx.depth)}Run killed by user`);
      throw new RunKilledError();
    }

    if (ctx.runId && ctx.hubId && ctx.tenantId) {
      await touchRunHeartbeat(ctx.hubId, ctx.tenantId, ctx.runId);
    }

    log.push(`  ${'  '.repeat(ctx.depth)}↳ ${node.type} (${node.id})`);
    const nodeStarted = Date.now();
    const logIndexAtStart = log.length;
    let hubBeforeRaw: Record<string, unknown> | undefined;
    let nodeHttpTrace: NodeHttpTrace | undefined;
    const persistCfg = parseNodeDataPersistence(node.data as Record<string, unknown>);
    const willPersist = Boolean(ctx.onNodeComplete && shouldPersistNodeExecution(persistCfg));
    try {
      const incoming = edges.filter(e => e.target === node.id);
      const activeIncoming = incoming.filter(e => {
        const route = switchRoutes[e.source];
        if (route !== undefined) {
          const handle = e.sourceHandle ?? '__default__';
          return handle === route;
        }
        const loopRoute = loopRoutes[e.source];
        if (loopRoute !== undefined) {
          const handle = e.sourceHandle ?? '';
          return handle === loopRoute;
        }
        return true;
      });

      if (incoming.length > 0 && activeIncoming.length === 0) {
        outputs[node.id] = null;
        log.push(`  ${'  '.repeat(ctx.depth)}  → skipped (FloSwitch path inactive)`);
        continue;
      }

      let rawCStream: unknown;
      if (activeIncoming.length === 0)      rawCStream = canonicalInitial;
      else if (activeIncoming.length === 1) rawCStream = outputs[activeIncoming[0].source];
      else rawCStream = activeIncoming.reduce(
        (acc: Record<string, unknown>, e) => {
          const src = outputs[e.source];
          if (typeof src === 'object' && src !== null) return { ...acc, ...(src as object) };
          return acc;
        },
        {} as Record<string, unknown>
      );

      if (rawCStream === null) {
        outputs[node.id] = null;
        log.push(`  ${'  '.repeat(ctx.depth)}  → path terminated by upstream filter`);
        continue;
      }

      const cStream = safeCs(rawCStream);
      if (willPersist) {
        hubBeforeRaw = cloneForHubRecord(cStream);
      }
      const nd: Record<string, any> = { ...node.data, hubId, tenantId, id: node.id, dryRun };
      let result: unknown;

      switch (node.type) {

        // ── Start ─────────────────────────────────────────────────────────────
        case NODE_TYPES.START: {
          for (const v of (nd.initVars as { key: string; value: string }[]) ?? []) {
            if (v.key && !isReservedStoreKey(v.key)) store.global[v.key] = v.value;
          }
          result = canonicalInitial;
          break;
        }

        // ── End ───────────────────────────────────────────────────────────────
        case NODE_TYPES.END: {
          // unwrapWithMeta handles both CStreamEnvelope (TemplateNode) and
          // canonical { message, _meta } shape
          const { value: endValue, contentType } = unwrapWithMeta(cStream);
          const params = (nd.outputParams as string[]) ?? [];
          let finalValue: unknown;

          if (params.length > 0 && typeof endValue === 'object' && endValue !== null) {
            const filtered: Record<string, any> = {};
            for (const p of params) {
              if (p.trim()) {
                const v = getValue(endValue, p.trim());
                if (v !== undefined) setValue(filtered, p.trim(), v);
              }
            }
            finalValue = filtered;
          } else {
            finalValue = endValue;
          }

          result = finalValue;
          lastCStream = result;
          log.push(`${'  '.repeat(ctx.depth)}  ✓ End (${contentType})`);
          break;
        }

        // ── Plug (routes by nodeType, then authProtocol fallback) ─────────────
        case NODE_TYPES.PLUG: {
          const effectiveNodeType = nd.nodeType as string | undefined;
          console.log(`[executeFloNodes] effectiveNodeType: ${effectiveNodeType}`);
          if (effectiveNodeType === NODE_TYPES.EMAIL || nd.authProtocol === 'smtp_basic') {
            const { cStream: next, logLine } = await executeEmailNode(cStream, nd, store, ctx.floRunMeta);
            result = next;
            log.push(`${'  '.repeat(ctx.depth)}  ${logLine}`);
          } else if (effectiveNodeType === NODE_TYPES.WORKDAY) {
            const { cStream: next, logLine } = await executeWorkdayNode(cStream, nd, store, getConnectorCreds);
            result = next;
            log.push(`${'  '.repeat(ctx.depth)}  ${logLine}`);
          } else if (effectiveNodeType === NODE_TYPES.SALESFORCE) {
            const { cStream: next, logLine } = await executeSalesforceNode(cStream, nd, store, getConnectorCreds);
            result = next;
            log.push(`${'  '.repeat(ctx.depth)}  ${logLine}`);
          } else if (effectiveNodeType === NODE_TYPES.SAP) {
            const { cStream: next, logLine } = await executeSapNode(cStream, nd, store, getConnectorCreds);
            result = next;
            log.push(`${'  '.repeat(ctx.depth)}  ${logLine}`);
          } else if (effectiveNodeType === NODE_TYPES.ORACLE) {
            const { cStream: next, logLine } = await executeOracleNode(cStream, nd, store, getConnectorCreds);
            result = next;
            log.push(`${'  '.repeat(ctx.depth)}  ${logLine}`);
          } else {
            const plugOut = await executePlugNode(cStream, nd, store, ctx.floRunMeta);
            result = plugOut.cStream;
            nodeHttpTrace = plugOut.httpTrace;
            log.push(`${'  '.repeat(ctx.depth)}  ${plugOut.logLine}`);
          }
          break;
        }

        // ── Dedicated email node type (future canvas node) ────────────────────
        case NODE_TYPES.EMAIL: {
          const { cStream: next, logLine } = await executeEmailNode(cStream, nd, store, ctx.floRunMeta);
          result = next;
          log.push(`${'  '.repeat(ctx.depth)}  ${logLine}`);
          break;
        }

        // ── Legacy dedicated connector nodes ───────────────────────────────────
        // These still work when dragged from the static palette.
        // When used as plugNode with nodeType set, they're handled in PLUG above.
        case NODE_TYPES.WORKDAY: {
          const { cStream: next, logLine } = await executeWorkdayNode(cStream, nd, store, getConnectorCreds);
          result = next; log.push(`${'  '.repeat(ctx.depth)}  ${logLine}`); break;
        }
        case NODE_TYPES.SALESFORCE: {
          const { cStream: next, logLine } = await executeSalesforceNode(cStream, nd, store, getConnectorCreds);
          result = next; log.push(`${'  '.repeat(ctx.depth)}  ${logLine}`); break;
        }
        case NODE_TYPES.SAP: {
          const { cStream: next, logLine } = await executeSapNode(cStream, nd, store, getConnectorCreds);
          result = next; log.push(`${'  '.repeat(ctx.depth)}  ${logLine}`); break;
        }
        case NODE_TYPES.ORACLE: {
          const { cStream: next, logLine } = await executeOracleNode(cStream, nd, store, getConnectorCreds);
          result = next; log.push(`${'  '.repeat(ctx.depth)}  ${logLine}`); break;
        }

        // ── Transform nodes ────────────────────────────────────────────────────
        // These operate on cStream.message via getValue/setValue internally.
        // They receive the canonical cStream and return it unchanged or modified.
        case NODE_TYPES.MAPPER: {
          // Pass cStream.message to mapper so it operates on the payload
          const { value: msg } = unwrapWithMeta(cStream);
          const mapped = executeMapper(msg, nd, store, ctx.floRunMeta);
          result = wrapMessage(mapped, { source: node.id });
          log.push(`${'  '.repeat(ctx.depth)}  ✓ Mapper: ${nd.mappings?.length ?? 0} rules (${nd.mapMode ?? 'pure'})`);
          break;
        }
        case NODE_TYPES.FILTER: {
          const { value: msg } = unwrapWithMeta(cStream);
          const { cStream: next, logLine } = executeFilterNode(msg, nd, store, ctx.floRunMeta);
          // If filter kills (null), propagate null; otherwise wrap result
          result = next === null ? null : wrapMessage(next, { source: node.id });
          log.push(`${'  '.repeat(ctx.depth)}  ${logLine}`); break;
        }
        case NODE_TYPES.SWITCH: {
          const { value: msg } = unwrapWithMeta(cStream);
          const { cStream: next, logLine, activeHandle } = executeSwitchNode(msg, nd, store, ctx.floRunMeta);
          switchRoutes[node.id] = activeHandle;
          result = wrapMessage(next, { source: node.id });
          log.push(`${'  '.repeat(ctx.depth)}  ${logLine}`); break;
        }
        case NODE_TYPES.VAR_STORE: {
          const { cStream: next, logLine } = executeVariableStoreNode(cStream, nd, store);
          result = next; log.push(`${'  '.repeat(ctx.depth)}  ${logLine}`); break;
        }
        case NODE_TYPES.FUNCTION: {
          const { cStream: next, logLine } = executeFunctionNode(cStream, nd, store);
          result = next; log.push(`${'  '.repeat(ctx.depth)}  ${logLine}`); break;
        }
        case NODE_TYPES.TEMPLATE: {
          // TemplateNode receives cStream.message for interpolation
          const { value: msg } = unwrapWithMeta(cStream);
          const { cStream: next, logLine } = executeTemplateNode(msg, nd, store);
          result = next; log.push(`${'  '.repeat(ctx.depth)}  ${logLine}`); break;
        }
        case NODE_TYPES.FIF: {
          const { cStream: next, logLine } = await executeFifNode(
            cStream, nd, ctx, loadFlo, executeFloNodes
          );
          result = next; log.push(`${'  '.repeat(ctx.depth)}  ${logLine}`); break;
        }
        case NODE_TYPES.LOOP: {
          const { cStream: next, logLine, activeHandle } = await executeLoopNode(
            cStream, nd, ctx, allNodes, allEdges, executeFloNodes, node.id,
          );
          loopRoutes[node.id] = activeHandle;
          result = next;
          for (const line of logLine.split(' | '))
            log.push(`${'  '.repeat(ctx.depth)}  ${line}`);
          break;
        }

        case NODE_TYPES.SUB_FLO: {
          result = cStream;
          log.push(`${'  '.repeat(ctx.depth)}  ✓ SubFlo entry`);
          break;
        }

        case NODE_TYPES.SUB_FLO_RETURN: {
          throw executeSubFloReturnNode(cStream, nd, store, ctx.floRunMeta);
        }

        case NODE_TYPES.INVOKE_SUB_FLO: {
          const { cStream: next, logLine } = await executeInvokeSubFloNode(
            cStream, nd, ctx, allNodes, allEdges, executeFloNodes,
          );
          result = next;
          log.push(`${'  '.repeat(ctx.depth)}  ${logLine}`);
          break;
        }

        // ── FloAction (connector API call with semantic field mapping) ─────────
        case 'floActionNode': {
          const floResult = await executeFloActionNode({
            dryRun,
            floRunMeta: ctx.floRunMeta,
            node: {
              actionId:      String(nd.actionId ?? ''),
              floKitId:      String(nd.floKitId ?? ''),
              connectorId:   String(nd.connectorId ?? ''),
              connectionId:  String(nd.connectionId ?? ''),
              outputTarget:  (nd.outputTarget as 'cStream' | 'local' | 'global') ?? 'cStream',
              outputVarName: String(nd.outputVarName ?? nd.varName ?? ''),
              flaLabel:      nd.flaLabel as string | undefined,
              mappingRules:  nd.mappingRules,
              inputSource:   nd.inputSource,
              inputVarName:  nd.inputVarName,
            },
            cStream:     cStream as Record<string, unknown>,
            localStore:  store.local,
            globalStore: store.global,
            hubId,
            tenantId,
            nodeId:      node.id,
            hubFloActionCache,
          });
          store.local  = floResult.localStore;
          store.global = floResult.globalStore;
          result = floResult.cStream;
          nodeHttpTrace = floResult.httpTrace;
          log.push(`${'  '.repeat(ctx.depth)}  ${floResult.logLine}`);
          break;
        }

        default:
          log.push(`${'  '.repeat(ctx.depth)}  ⚠ Unknown node type: ${node.type}`);
          result = cStream;
      }

      outputs[node.id] = result;
      lastCStream = result;

      if (willPersist) {
        const nodeLogLines = log
          .slice(logIndexAtStart)
          .filter(l => !l.includes('↳'));
        const lastLine = nodeLogLines.length
          ? nodeLogLines[nodeLogLines.length - 1].trim()
          : undefined;
        const afterCs = cloneForHubRecord(result);
        const payload: NodeExecutionHubPayload = {
          nodeId:     node.id,
          nodeType:   node.type,
          nodeLabel:  nodeLabel(node.data as Record<string, unknown>, node.id),
          status:     'ok',
          before:     buildPersistedInputSnapshot({
            config: persistCfg,
            cStream: hubBeforeRaw,
            local:   { ...store.local },
            global:  { ...store.global },
          }),
          after:      buildPersistedOutputSnapshot({
            config: persistCfg,
            cStream: afterCs,
            local:   { ...store.local },
            global:  { ...store.global },
            httpTrace: nodeHttpTrace,
            stripRemoteTrace: dryRun,
          }),
          ...(lastLine ? { logLine: lastLine } : {}),
          durationMs: Date.now() - nodeStarted,
        };
        if (ctx.onNodeComplete) {
          await Promise.resolve(ctx.onNodeComplete(payload));
        }
      }

    } catch (err: any) {
      const hubDiag = floActionErrorToHubDiagnostics(err);
      log.push(`${'  '.repeat(ctx.depth)}  Error in ${node.id}: ${hubDiag.error}`);
      outputs[node.id] = null;
      if (willPersist) {
        const payload: NodeExecutionHubPayload = {
          nodeId:     node.id,
          nodeType:   node.type,
          nodeLabel:  nodeLabel(node.data as Record<string, unknown>, node.id),
          status:     'error',
          before:     buildPersistedInputSnapshot({
            config: persistCfg,
            cStream: hubBeforeRaw,
            local:   { ...store.local },
            global:  { ...store.global },
          }),
          error:      hubDiag.error,
          durationMs: Date.now() - nodeStarted,
        };
        if (ctx.onNodeComplete) {
          await Promise.resolve(ctx.onNodeComplete(payload));
        }
      }
    }
  }

  return lastCStream;
}
