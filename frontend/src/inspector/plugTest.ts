import { httpsCallable } from 'firebase/functions';
import type { Functions } from 'firebase/functions';
import type { Node } from '@xyflow/react';

export { DEFAULT_NODE_TEST_INPUT as DEFAULT_PLUG_TEST_INPUT, parseNodeTestInput as parsePlugTestInput } from './nodeTestPayload';
import { DEFAULT_NODE_TEST_INPUT, parseNodeTestInput } from './nodeTestPayload';

/** Run a single plug node with user-provided cStream input (like connector test). */
export async function testPlugNode(
  functions: Functions,
  hubId: string,
  tenantId: string,
  node: Node,
  onUpdate: (nodeId: string, patch: Record<string, unknown>) => void,
): Promise<boolean> {
  if (node.type !== 'plugNode') return false;

  const d = node.data as Record<string, unknown>;
  const plugId = d.plugId as string | undefined;
  if (!plugId) {
    onUpdate(node.id, { _loading: false, _result: 'No plugId on node', _isError: true });
    return true;
  }

  const rawInput = String(d.testInputJson ?? DEFAULT_NODE_TEST_INPUT);
  const parsed = parseNodeTestInput(rawInput);
  if (parsed.ok === false) {
    onUpdate(node.id, { _loading: false, _result: parsed.error, _isError: true });
    return true;
  }
  const inputJson = parsed.value;

  onUpdate(node.id, { _loading: true, _result: 'Running plug…', _isError: false });

  try {
    const fn = httpsCallable<
      {
        hubId: string;
        tenantId: string;
        plugId: string;
        inputJson: Record<string, unknown>;
        nodeConfig: Record<string, unknown>;
      },
      { success: boolean; logLine: string; message: string; output: unknown }
    >(functions, 'testPlugNode');

    const res = await fn({
      hubId,
      tenantId,
      plugId,
      inputJson,
      nodeConfig: {
        dryRun:        true,
        urlVariables:  d.urlVariables,
        emailBindings: d.emailBindings,
        connectionId:  d.connectionId,
        outputTarget:  d.outputTarget ?? 'cStream',
        outputVarName: d.outputVarName ?? '',
        method:        d.method,
        authProtocol:  d.authProtocol,
        nodeType:      d.nodeType,
      },
    });

    const { logLine, output } = res.data;
    let outputPreview = '';
    try {
      outputPreview = JSON.stringify(output, null, 2);
      if (outputPreview.length > 2000) {
        outputPreview = outputPreview.slice(0, 2000) + '\n…';
      }
    } catch {
      outputPreview = String(output ?? '');
    }

    onUpdate(node.id, {
      _loading: false,
      _result: `${logLine}\n\n${outputPreview}`,
      _isError: false,
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    onUpdate(node.id, { _loading: false, _result: msg, _isError: true });
  }
  return true;
}
