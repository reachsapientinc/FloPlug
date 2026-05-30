/**
 * functions/src/nodes/variableStoreNode.ts
 *
 * Reads from or writes to the global/local variable store.
 *
 * Supports multi-row mode (nd.rows[]) and legacy single-row mode
 * (nd.action / nd.scope / nd.varName / nd.sourcePath / nd.targetPath).
 *
 * Actions:
 *   set   — writes cStream (or a dot-path within it) into the named variable
 *   get   — injects the named variable into cStream (at a dot-path or as replacement)
 *   clear — deletes the named variable from the store
 */

import { getValue, setValue } from '../utils/pathUtils.js';
import type { NodeResult, NodeStore } from '@floplug/shared';
import { isReservedStoreKey } from '@floplug/shared';

interface StoreRow {
  action:     'set' | 'get' | 'clear';
  scope:      'global' | 'local';
  varName:    string;
  sourcePath: string;
  targetPath: string;
}

function applyRow(
  cStream: unknown,
  row:     StoreRow,
  store:   NodeStore,
): { cStream: unknown; logLine: string } {
  const { action, scope, varName, sourcePath, targetPath } = row;

  if (!varName) return { cStream, logLine: '⚠ VarStore: no varName — skipped' };
  if (isReservedStoreKey(varName)) {
    return { cStream, logLine: `⚠ VarStore: "${varName}" is read-only (floRunMeta)` };
  }

  const ss: Record<string, any> = scope === 'local' ? store.local : store.global;

  if (action === 'set') {
    ss[varName] = sourcePath ? getValue(cStream, sourcePath) : cStream;
    return { cStream, logLine: `✓ VarStore SET ${scope}.${varName}` };
  }

  if (action === 'get') {
    const val: any = ss[varName];
    if (val !== undefined && targetPath) {
      const next: Record<string, any> = { ...(cStream as object) };
      setValue(next, targetPath, val);
      return { cStream: next, logLine: `✓ VarStore GET ${scope}.${varName} → ${targetPath}` };
    }
    return {
      cStream: val !== undefined ? val : cStream,
      logLine: `✓ VarStore GET ${scope}.${varName}`,
    };
  }

  // clear
  delete ss[varName];
  return { cStream, logLine: `✓ VarStore CLEAR ${scope}.${varName}` };
}

// ── Main executor ─────────────────────────────────────────────────────────────

export function executeVariableStoreNode(
  cStream: unknown,
  nd:      Record<string, any>,
  store:   NodeStore,
): NodeResult {
  // ── Multi-row mode ────────────────────────────────────────────────────────
  if (Array.isArray(nd.rows) && nd.rows.length > 0) {
    const lines: string[] = [];
    let current = cStream;

    for (const row of nd.rows as StoreRow[]) {
      const { cStream: next, logLine } = applyRow(current, row, store);
      current = next;
      lines.push(logLine);
    }

    return { cStream: current, logLine: lines.join(' | ') };
  }

  // ── Legacy single-row mode ────────────────────────────────────────────────
  const row: StoreRow = {
    action:     (nd.action     as StoreRow['action'])  ?? 'set',
    scope:      (nd.scope      as StoreRow['scope'])   ?? 'global',
    varName:    String(nd.varName    ?? ''),
    sourcePath: String(nd.sourcePath ?? ''),
    targetPath: String(nd.targetPath ?? ''),
  };

  const { cStream: next, logLine } = applyRow(cStream, row, store);
  return { cStream: next, logLine };
}
