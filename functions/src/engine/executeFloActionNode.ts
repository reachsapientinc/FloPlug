/**
 * Flo engine node executor for floActionNode — calls executeFloActionCore in-process.
 */

import { executeFloActionCore } from './executeFloActionCore.js';
import type { MappingRule } from './resolveFieldMappings.js';
import { getMessage, wrapMessage } from './resolveValue.js';
import { setValue } from '../utils/pathUtils.js';
import {
  FloActionNetworkError,
  FloActionValidationError,
  FloActionAuthError,
  FloActionSchemaError,
} from './floActionErrors.js';
import type { StreamSource, NodeHttpTrace, FloRunMeta } from '@floplug/shared';
import { isReservedStoreKey } from '@floplug/shared';
import {
  resolveFloActionRuntimeFromHub,
  type HubFloActionDocCache,
} from './resolveFloActionNodeHub.js';

export interface FloActionNodeData {
  actionId:      string;
  floKitId:      string;
  connectorId:   string;
  connectionId:  string;
  outputTarget:  StreamSource;
  outputVarName: string;
  flaLabel?:     string;
  mappingRules?: MappingRule[];
  inputSource?:  StreamSource;
  inputVarName?: string;
  urlVariables?: Record<string, { source: string; value: string }>;
}

export interface FloActionExecutionContext {
  node:        FloActionNodeData;
  cStream:     Record<string, unknown>;
  localStore:  Record<string, unknown>;
  globalStore: Record<string, unknown>;
  hubId:       string;
  tenantId:    string;
  userId?:     string;
  nodeId?:     string;
  dryRun?:     boolean;
  floRunMeta?: Readonly<FloRunMeta>;
  /** Per-run cache for hub FloActionNodes lookups */
  hubFloActionCache?: HubFloActionDocCache;
}

export interface FloActionNodeResult {
  cStream:     Record<string, unknown>;
  localStore:  Record<string, unknown>;
  globalStore: Record<string, unknown>;
  logLine:     string;
  httpTrace?:  NodeHttpTrace;
}

function resolveInputPayload(
  ctx: FloActionExecutionContext,
): Record<string, unknown> {
  const { node, cStream, localStore, globalStore } = ctx;
  const source = node.inputSource ?? 'cStream';

  switch (source) {
    case 'local': {
      const val = node.inputVarName
        ? localStore[node.inputVarName]
        : localStore;
      return (val !== null && typeof val === 'object')
        ? val as Record<string, unknown>
        : { value: val };
    }
    case 'global': {
      const val = node.inputVarName
        ? globalStore[node.inputVarName]
        : globalStore;
      return (val !== null && typeof val === 'object')
        ? val as Record<string, unknown>
        : { value: val };
    }
    default: {
      const msg = getMessage(cStream);
      return (msg !== null && typeof msg === 'object' && !Array.isArray(msg))
        ? msg as Record<string, unknown>
        : { value: msg };
    }
  }
}

export async function executeFloActionNode(
  ctx: FloActionExecutionContext,
): Promise<FloActionNodeResult> {
  const { hubId, tenantId, cStream, localStore, globalStore } = ctx;

  const resolved = await resolveFloActionRuntimeFromHub(
    hubId,
    tenantId,
    ctx.node as unknown as Record<string, unknown>,
    ctx.hubFloActionCache,
  );

  const node: FloActionNodeData = {
    ...ctx.node,
    floKitId:     resolved.floKitId || ctx.node.floKitId,
    actionId:     resolved.actionId,
    connectorId:  resolved.connectorId,
    connectionId: resolved.connectionId,
  };

  const missing = (['actionId', 'connectorId', 'connectionId', 'floKitId'] as const)
    .filter(f => !node[f]);
  if (missing.length > 0) {
    throw new FloActionValidationError(
      missing.includes('floKitId')
        ? 'FloAction node missing floKitId — re-add the node from the FloAction palette'
        : 'FloAction node missing actionId, connectorId, or connectionId — check Hub Admin FloActionNodes config and inspector picks',
      [...missing],
      {
        actionId:     node.actionId ?? '',
        connectionId: node.connectionId ?? '',
        connectorId:  node.connectorId ?? '',
        floKitId:     node.floKitId ?? '',
      },
    );
  }

  const inputPayload = resolveInputPayload(ctx);

  let result: Awaited<ReturnType<typeof executeFloActionCore>>;
  try {
    result = await executeFloActionCore({
      hubId,
      tenantId,
      userId:       ctx.userId,
      actionId:     node.actionId,
      floKitId:     node.floKitId,
      connectorId:  node.connectorId,
      connectionId: node.connectionId,
      cStream:      inputPayload,
      localStore,
      globalStore,
      mappingRules: node.mappingRules,
      urlVariables: node.urlVariables,
      dryRun:       ctx.dryRun === true,
      floRunMeta:   ctx.floRunMeta,
    });
  } catch (err) {
    if (err instanceof FloActionValidationError && err.debug) {
      const dbg = err.debug;
      (err as FloActionValidationError & { httpTrace?: NodeHttpTrace }).httpTrace = {
        method:         dbg.method,
        url:            dbg.url || '(validation failed before HTTP)',
        requestHeaders: dbg.headersSafe,
        requestBody:    dbg.requestBody,
        status:         0,
        statusText:     'Validation failed',
        responseBody:   err.inputHint ?? err.message,
      };
    }
    if (err instanceof FloActionValidationError) throw err;
    if (err instanceof FloActionAuthError) throw err;
    if (err instanceof FloActionSchemaError) throw err;
    if (err instanceof FloActionNetworkError) {
      const netErr = err as FloActionNetworkError & { httpTrace?: NodeHttpTrace };
      if (netErr.httpTrace) throw netErr;
      throw err;
    }
    throw err;
  }

  if (result._actionStatus === 'error') {
    throw new FloActionNetworkError(
      'FloAction returned error status',
      {
        actionId:     node.actionId,
        connectionId: node.connectionId,
        connectorId:  node.connectorId,
      },
    );
  }

  const outputTarget  = node.outputTarget ?? 'cStream';
  const outputVarName = node.outputVarName ?? '';
  const payload       = result.payload;

  let nextCStream    = cStream;
  let nextLocal      = { ...localStore };
  let nextGlobal     = { ...globalStore };

  if (outputTarget === 'cStream') {
    nextCStream = wrapMessage(
      { ...((getMessage(cStream) as Record<string, unknown>) ?? {}), ...payload },
      { source: ctx.nodeId ?? 'floActionNode', contentType: 'application/json' },
    ) as Record<string, unknown>;
  } else if (outputTarget === 'local' && outputVarName && !isReservedStoreKey(outputVarName)) {
    setValue(nextLocal as Record<string, unknown>, outputVarName, payload);
  } else if (outputTarget === 'global' && outputVarName && !isReservedStoreKey(outputVarName)) {
    setValue(nextGlobal as Record<string, unknown>, outputVarName, payload);
  } else {
    nextCStream = wrapMessage(payload, { source: ctx.nodeId ?? 'floActionNode' }) as Record<string, unknown>;
  }

  const payloadKeys = Object.keys(payload).filter(k => !k.startsWith('_')).slice(0, 8).join(', ');
  const logLine = [
    ctx.dryRun ? '[DRY RUN]' : '✓',
    `FloAction: ${node.actionId}`,
    `[${node.connectorId}/${node.connectionId}]`,
    `${result.executionMs}ms`,
    result.unmappedFields.length ? `unmapped:${result.unmappedFields.length}` : '',
    `→ ${outputTarget}${outputVarName ? '.' + outputVarName : ''}`,
    payloadKeys ? `keys:[${payloadKeys}]` : '',
  ].filter(Boolean).join(' ');

  console.log(`[executeFloActionNode] ${logLine}`);

  return {
    cStream:    nextCStream,
    localStore: nextLocal,
    globalStore: nextGlobal,
    logLine,
    httpTrace:  result.httpTrace,
  };
}
