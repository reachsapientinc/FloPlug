import { httpsCallable } from 'firebase/functions';
import type { Functions } from 'firebase/functions';
import type { Node } from '@xyflow/react';

export const DEFAULT_PLUG_TEST_INPUT = JSON.stringify(
  { message: 'Hello FloPlug', value: 42 },
  null,
  2,
);

export function parsePlugTestInput(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Input must be a JSON object' };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
}

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

  const rawInput = String(d.testInputJson ?? DEFAULT_PLUG_TEST_INPUT);
  const parsed = parsePlugTestInput(rawInput);
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
        urlVariables:  d.urlVariables,
        emailBindings: d.emailBindings,
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
