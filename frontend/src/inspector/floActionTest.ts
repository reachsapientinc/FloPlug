import { httpsCallable } from 'firebase/functions';
import type { Functions } from 'firebase/functions';
import type { Node } from '@xyflow/react';
import { DEFAULT_NODE_TEST_INPUT, parseNodeTestInput } from './nodeTestPayload';

/** Run a single FloAction node with user-provided cStream input (Designer node test). */
export async function testFloActionNode(
  functions: Functions,
  hubId: string,
  tenantId: string,
  node: Node,
  onUpdate: (nodeId: string, patch: Record<string, unknown>) => void,
): Promise<boolean> {
  if (node.type !== 'floActionNode') return false;

  const d = node.data as Record<string, unknown>;
  const actionId     = String(d.actionId ?? '');
  const connectorId  = String(d.connectorId ?? '');
  const connectionId = String(d.connectionId ?? '');
  const floKitId     = String(d.floKitId ?? '');

  if (!actionId || !connectorId || !connectionId || !floKitId) {
    onUpdate(node.id, {
      _loading: false,
      _result: 'Select action, connection, and FloKit before testing.',
      _isError: true,
    });
    return true;
  }

  const rawInput = String(d.testInputJson ?? DEFAULT_NODE_TEST_INPUT);
  const parsed = parseNodeTestInput(rawInput);
  if (parsed.ok === false) {
    onUpdate(node.id, { _loading: false, _result: parsed.error, _isError: true });
    return true;
  }

  onUpdate(node.id, { _loading: true, _result: 'Running FloAction…', _isError: false });

  try {
    const fn = httpsCallable<
      {
        hubId: string;
        tenantId: string;
        actionId: string;
        connectorId: string;
        connectionId: string;
        floKitId: string;
        cStream: Record<string, unknown>;
        mappingRules?: unknown[];
        urlVariables?: Record<string, { source: string; value: string }>;
        dryRun?: boolean;
      },
      { payload?: unknown; executionMs?: number; httpTrace?: { url?: string; status?: number } }
    >(functions, 'executeFloAction');

    const res = await fn({
      hubId,
      tenantId,
      actionId,
      connectorId,
      connectionId,
      floKitId,
      cStream: parsed.value,
      mappingRules: (d.mappingRules as unknown[]) ?? [],
      urlVariables: d.urlVariables as Record<string, { source: string; value: string }> | undefined,
      dryRun: true,
    });

    const payload = res.data?.payload ?? res.data;
    let outputPreview = '';
    try {
      outputPreview = JSON.stringify(payload, null, 2);
      if (outputPreview.length > 2000) {
        outputPreview = outputPreview.slice(0, 2000) + '\n…';
      }
    } catch {
      outputPreview = String(payload ?? '');
    }

    const url = res.data?.httpTrace?.url;
    const status = res.data?.httpTrace?.status;
    const header = `[DRY RUN] Simulated FloAction (${res.data?.executionMs ?? 0}ms)` +
      (url ? `\nWould call: ${url}${status ? ` (${status})` : ''}` : '') +
      '\n\n';

    onUpdate(node.id, {
      _loading: false,
      _result: `${header}${outputPreview}`,
      _isError: false,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    onUpdate(node.id, { _loading: false, _result: msg, _isError: true });
  }
  return true;
}
