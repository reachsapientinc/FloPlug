/**
 * Mapper node — FloExpression engine for mapping rules.
 * See mapperNode_v1 comments in git history for rule syntax examples.
 */

import { getValue, setValue } from '../utils/pathUtils.js';
import { applyTransform } from '../utils/transformEngine.js';
import {
  safeEvalExpression,
  looksLikeExpression,
  buildEvalContext,
  type FloRunMeta,
} from '@floplug/shared';

function resolveSource(
  srcExpr: string,
  item:    unknown,
  ctx:     ReturnType<typeof buildEvalContext>,
): unknown {
  if (looksLikeExpression(srcExpr)) {
    return safeEvalExpression(srcExpr, ctx);
  }
  return getValue(item, srcExpr);
}

export const executeMapper = (
  payload: unknown,
  nodeData: Record<string, unknown>,
  store?: { local?: Record<string, unknown>; global?: Record<string, unknown> },
  floRunMeta?: Readonly<FloRunMeta>,
) => {
  const mappings = (nodeData.mappings as string[]) ?? [];
  const mapMode  = (nodeData.mapMode  as string)  ?? 'pure';

  const mapItem = (item: unknown): unknown => {
    if (item === null || item === undefined) return {};

    const res: Record<string, unknown> = (mapMode === 'transform') ? { ...(item as object) } : {};

    const ctx = buildEvalContext(
      item as Record<string, unknown>,
      store,
      floRunMeta,
    );

    for (const m of mappings) {
      const parts = m.split(/→|->|=>/).map(s => s.trim());
      if (parts.length < 2) continue;

      const lhs = parts[0];
      const tgt = parts[1];

      let srcPath:       string;
      let transformCode: string | undefined;
      let val:           unknown;

      if (lhs.includes('|') && !looksLikeExpression(lhs)) {
        const sub = lhs.split('|').map(s => s.trim());
        srcPath       = sub[0];
        transformCode = sub[1];
        val           = getValue(item, srcPath);
        if (val !== undefined && transformCode) {
          val = applyTransform(val, transformCode);
        }
      } else {
        srcPath = lhs;
        val     = resolveSource(lhs, item, ctx);
      }

      if (val !== undefined) {
        setValue(res, tgt, val);
        if (mapMode === 'transform' && srcPath !== tgt && srcPath in res) {
          delete res[srcPath];
        }
      }
    }

    return res;
  };

  return Array.isArray(payload) ? payload.map(mapItem) : mapItem(payload);
};
