/**
 * functions/src/nodes/functionNode.ts
 *
 * Runs a user-supplied code snippet in a sandboxed Function constructor.
 *
 * outputMode:
 *   'overwrite' — returned value replaces cStream entirely
 *   'append'    — returned value is written at nd.targetPath within cStream
 *
 * The snippet receives (cStream, global, local) and should return a value.
 */

import { setValue } from '../utils/pathUtils.js';
import type { NodeResult, NodeStore } from '@floplug/shared';

// ── Sandbox runner ────────────────────────────────────────────────────────────

function runCode(
  code:  string,
  cStream: any,
  store: NodeStore,
): any {
  // eslint-disable-next-line no-new-func
  const fn = new Function('cStream', 'global', 'local', code);
  return fn(cStream, store.global, store.local);
}

// ── Main executor ─────────────────────────────────────────────────────────────

export function executeFunctionNode(
  cStream: unknown,
  nd:      Record<string, any>,
  store:   NodeStore,
): NodeResult {
  const code       = String(nd.code       ?? '');
  const outputMode = String(nd.outputMode ?? 'overwrite');
  const targetPath = String(nd.targetPath ?? '');

  if (!code.trim()) {
    return { cStream, logLine: '⚠ Function: empty code — cStream unchanged' };
  }

  const returned = runCode(code, cStream, store);

  if (outputMode === 'append' && targetPath) {
    const next: Record<string, any> =
      typeof cStream === 'object' && cStream ? { ...(cStream as object) } : {};
    setValue(next, targetPath, returned);
    return { cStream: next, logLine: `✓ Function: appended → ${targetPath}` };
  }

  return { cStream: returned, logLine: `✓ Function: overwrite` };
}
