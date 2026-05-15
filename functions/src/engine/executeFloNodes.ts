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
import { executeFunctionNode }       from '../nodes/functionNode.js';
import { executeVariableStoreNode }  from '../nodes/variableStoreNode.js';
import { executeTemplateNode }       from '../nodes/templateNode.js';
import { executeFifNode }            from '../nodes/fifNode.js';
import { executeLoopNode }           from '../nodes/loopNode.js';
import { executePlugNode }           from '../nodes/plugNode.js';
import { executeEmailNode }          from '../nodes/emailNode.js';
import {
  executeWorkdayNode, executeSalesforceNode,
  executeSapNode, executeOracleNode,
}                                    from '../nodes/connectorNodes.js';
import { unwrapWithMeta }            from '../nodes/cStreamMeta.js';
import { wrapMessage }               from '../nodes/cStreamMeta.js';
import { getValue, setValue }        from '../utils/pathUtils.js';
import type { RunContext }           from '@floplug/shared';
import { NODE_TYPES, COLLECTIONS, HUB_COLLECTIONS } from '@floplug/shared';

const db = getFirestore();

interface FloNode { id: string; type: string; data: Record<string, unknown>; }
interface FloEdge { source: string; target: string; }

const MAX_DEPTH = 5;

/**
 * Ensure cStream is always in canonical { message, _meta } shape.
 * Wraps legacy plain objects/values that pre-date the canonical structure.
 */
function safeCs(val: unknown): Record<string, unknown> {
  if (val === null || val === undefined) return wrapMessage(null) as Record<string, unknown>;
  if (typeof val === 'object' && 'message' in (val as any)) {
    return val as Record<string, unknown>;   // already canonical
  }
  // Legacy — wrap the whole value as message
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
  return { nodes: d.nodes ?? [], edges: d.edges ?? [] };
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

  const { hubId, tenantId, store, log } = ctx;
  const outputs: Record<string, unknown> = {};
  const ordered = topoSort(nodes, edges);

  // Wrap the initial input as canonical cStream on entry
  const canonicalInitial = safeCs(initialCStream);
  let lastCStream: unknown = canonicalInitial;

  for (const node of ordered) {
    log.push(`  ${'  '.repeat(ctx.depth)}↳ ${node.type} (${node.id})`);
    try {
      const incoming = edges.filter(e => e.target === node.id);
      let rawCStream: unknown;
      if (incoming.length === 0)      rawCStream = canonicalInitial;
      else if (incoming.length === 1) rawCStream = outputs[incoming[0].source];
      else rawCStream = incoming.reduce(
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
      const nd: Record<string, any> = { ...node.data, hubId, tenantId, id: node.id };
      let result: unknown;

      switch (node.type) {

        // ── Start ─────────────────────────────────────────────────────────────
        case NODE_TYPES.START: {
          for (const v of (nd.initVars as { key: string; value: string }[]) ?? []) {
            if (v.key) store.global[v.key] = v.value;
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

          if (effectiveNodeType === NODE_TYPES.EMAIL || nd.authProtocol === 'smtp_basic') {
            const { cStream: next, logLine } = await executeEmailNode(cStream, nd, store);
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
            const { cStream: next, logLine } = await executePlugNode(cStream, nd, store);
            result = next;
            log.push(`${'  '.repeat(ctx.depth)}  ${logLine}`);
          }
          break;
        }

        // ── Dedicated email node type (future canvas node) ────────────────────
        case NODE_TYPES.EMAIL: {
          const { cStream: next, logLine } = await executeEmailNode(cStream, nd, store);
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
          const mapped = executeMapper(msg, nd);
          result = wrapMessage(mapped, { source: node.id });
          log.push(`${'  '.repeat(ctx.depth)}  ✓ Mapper: ${nd.mappings?.length ?? 0} rules (${nd.mapMode ?? 'pure'})`);
          break;
        }
        case NODE_TYPES.FILTER: {
          const { value: msg } = unwrapWithMeta(cStream);
          const { cStream: next, logLine } = executeFilterNode(msg, nd, store);
          // If filter kills (null), propagate null; otherwise wrap result
          result = next === null ? null : wrapMessage(next, { source: node.id });
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
          const { cStream: next, logLine } = await executeLoopNode(
            cStream, nd, ctx, executeFloNodes
          );
          result = next;
          for (const line of logLine.split(' | '))
            log.push(`${'  '.repeat(ctx.depth)}  ${line}`);
          break;
        }

        default:
          log.push(`${'  '.repeat(ctx.depth)}  ⚠ Unknown node type: ${node.type}`);
          result = cStream;
      }

      outputs[node.id] = result;
      lastCStream = result;

    } catch (err: any) {
      log.push(`${'  '.repeat(ctx.depth)}  Error in ${node.id}: ${err.message}`);
      outputs[node.id] = null;
    }
  }

  return lastCStream;
}
