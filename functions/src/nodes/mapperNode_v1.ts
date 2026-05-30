/**
 * FILE: functions/src/nodes/mapperNode.ts
 *
 * Updated to use the FloExpression engine.
 *
 * Mapping rule syntax (source side of the arrow):
 *
 *   ① Plain path (unchanged)
 *        cStream.name → target.fullName
 *
 *   ② Legacy pipe transform (unchanged — fully backward-compatible)
 *        cStream.name | toUpperCase → target.nameUpper
 *
 *   ③ Expression (new) — any floExpression on the left of the arrow
 *        concat(cStream.firstName, ' ', cStream.lastName) → target.fullName
 *        substring(cStream.code, 0, 3) → target.prefix
 *        substring(cStream.name, indexOf(cStream.name, '_')+1) → target.suffix
 *        iif(cStream.age >= 18, 'adult', 'minor') → target.ageGroup
 *        format(cStream.salary, '#,##0.00') → target.salaryDisplay
 *        length(cStream.items) → target.itemCount
 *        cStream.price * 1.1 → target.priceWithTax
 *        exists(cStream.email) AND cStream.active == true → target.canNotify
 *
 *   ④ Chained / nested expressions (new)
 *        substring(cStream.name, 0, length(cStream.name)-3) → target.trimmed
 *        substring(indexOf(cStream.name,'_')+1, length(cStream.name)) → target.suffix
 *        pad(upper(trim(cStream.code)), 8, '0', 'l') → target.paddedCode
 *
 * The executor calls evalExpression() for anything that looks like an expression,
 * falls back to getValue() for plain paths, and calls the legacy applyTransform()
 * for the old pipe syntax — so existing saved flos continue to work unchanged.
 */

import { getValue, setValue }      from '../utils/pathUtils.js';
import { applyTransform }          from '../utils/transformEngine.js';
import {
  safeEvalExpression,
  looksLikeExpression,
  type EvalContext,
}                                  from '../utils/floExpression.js';

// ── Resolve the source side of one mapping rule ───────────────────────────────
//
// Given the source expression (everything left of the →) and the current item,
// return the value to write to the target path.
//
// Resolution order:
//  1. Expression — if looksLikeExpression() is true, evaluate via floExpression
//  2. Plain path  — delegate to getValue(item, srcPath)  (existing behaviour)
//
// The pipe (|) is detected upstream and handled separately (legacy path).

function resolveSource(
  srcExpr:  string,
  item:     unknown,
  ctx:      EvalContext,
): unknown {
  // Expressions always use the full context (cStream = item)
  if (looksLikeExpression(srcExpr)) {
    return safeEvalExpression(srcExpr, ctx);
  }
  // Plain dotted path — existing behaviour unchanged
  return getValue(item, srcExpr);
}

// ── Main executor ─────────────────────────────────────────────────────────────

export const executeMapper = (
  payload: unknown,
  nodeData: Record<string, unknown>,
  /** Optional store passed by executeFloNodes for local/global scopes */
  store?: { local?: Record<string, unknown>; global?: Record<string, unknown> },
) => {
  const mappings = (nodeData.mappings as string[]) ?? [];
  const mapMode  = (nodeData.mapMode  as string)  ?? 'pure';

  const mapItem = (item: unknown): unknown => {
    if (item === null || item === undefined) return {};

    const res: Record<string, unknown> = (mapMode === 'transform') ? { ...(item as object) } : {};

    // Evaluation context — item is cStream; local/global from store if provided
    const ctx: EvalContext = {
      cStream: item as Record<string, unknown>,
      local:   store?.local  ?? {},
      global:  store?.global ?? {},
    };

    for (const m of mappings) {
      // ── Split by arrow: lhs → target ──────────────────────────────────────
      const parts = m.split(/→|->|=>/).map(s => s.trim());
      if (parts.length < 2) {
        console.warn(`[mapperNode] Skipping malformed rule (no arrow): "${m}"`);
        continue;
      }

      const lhs = parts[0];   // everything before →
      const tgt = parts[1];   // target path

      let srcPath:        string;
      let transformCode:  string | undefined;
      let val:            unknown;

      // ── Legacy pipe syntax: path | transform ──────────────────────────────
      // Only treat '|' as a pipe when there's no function call on the lhs,
      // to avoid breaking expressions like iif(a|b) (which don't exist in
      // our grammar but guards against future ambiguity).
      if (lhs.includes('|') && !looksLikeExpression(lhs)) {
        const sub  = lhs.split('|').map(s => s.trim());
        srcPath        = sub[0];
        transformCode  = sub[1];
        val            = getValue(item, srcPath);
        console.log(`[mapperNode] legacy pipe | srcPath=${srcPath} transform=${transformCode} val=${val}`);
        if (val !== undefined && transformCode) {
          val = applyTransform(val, transformCode);
        }
      } else {
        // ── Expression or plain path ──────────────────────────────────────
        srcPath = lhs;
        val     = resolveSource(lhs, item, ctx);
        console.log(`[mapperNode] expr/path | src="${lhs}" → "${tgt}" val=`, val);
      }

      // ── Write to target ───────────────────────────────────────────────────
      if (val !== undefined) {
        setValue(res, tgt, val);

        // In transform mode, delete the source key if it differs from target
        if (mapMode === 'transform' && srcPath !== tgt && srcPath in res) {
          delete res[srcPath];
        }
      }
    }

    return res;
  };

  return Array.isArray(payload) ? payload.map(mapItem) : mapItem(payload);
};
