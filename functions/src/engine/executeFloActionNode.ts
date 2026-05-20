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
import type { StreamSource } from '@floplug/shared';

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
}

export interface FloActionNodeResult {
  cStream:     Record<string, unknown>;
  localStore:  Record<string, unknown>;
  globalStore: Record<string, unknown>;
  logLine:     string;
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
  const { node, hubId, tenantId, cStream, localStore, globalStore } = ctx;

  const missing = (['actionId', 'connectorId', 'connectionId'] as const)
    .filter(f => !node[f]);
  if (missing.length > 0) {
    throw new FloActionValidationError(
      'FloAction node missing actionId, connectorId, or connectionId',
      [...missing],
      {
        actionId:     node.actionId ?? '',
        connectionId: node.connectionId ?? '',
        connectorId:  node.connectorId ?? '',
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
    });
  } catch (err) {
    if (err instanceof FloActionValidationError) throw err;
    if (err instanceof FloActionAuthError) throw err;
    if (err instanceof FloActionSchemaError) throw err;
    if (err instanceof FloActionNetworkError) throw err;
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
  } else if (outputTarget === 'local' && outputVarName) {
    setValue(nextLocal as Record<string, unknown>, outputVarName, payload);
  } else if (outputTarget === 'global' && outputVarName) {
    setValue(nextGlobal as Record<string, unknown>, outputVarName, payload);
  } else {
    nextCStream = wrapMessage(payload, { source: ctx.nodeId ?? 'floActionNode' }) as Record<string, unknown>;
  }

  const payloadKeys = Object.keys(payload).filter(k => !k.startsWith('_')).slice(0, 8).join(', ');
  const logLine = [
    `✓ FloAction: ${node.actionId}`,
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
  };
}
