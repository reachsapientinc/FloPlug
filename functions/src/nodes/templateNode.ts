/**
 * functions/src/nodes/templateNode.ts
 *
 * Renders a template string and emits a CStreamEnvelope so the
 * content type travels with the value to the endNode.
 *
 * Interpolation ({{}} only — $$ notation dropped):
 *   {{cStream.path}}  — explicit cStream prefix
 *   {{global.name}}   — global store key
 *   {{local.name}}    — local store key
 *   {{path}}          — no prefix → implicitly cStream.path
 *
 * Content-type behaviour:
 *   application/json  → rendered string is JSON.parsed into a real object
 *                        so downstream nodes receive a traversable object.
 *                        On parse failure the raw string passes through.
 *   all other types   → raw rendered string; downstream receives it as-is.
 *
 * Output modes:
 *   overwrite  → cStream becomes CStreamEnvelope { value, contentType }
 *                EndNode unwraps and emits the raw value in correct format.
 *   store      → rendered value saved to global/local variable;
 *                cStream passes through unchanged (no envelope).
 */

import { getValue }                              from '../utils/pathUtils.js';
import { wrapEnvelope, unwrap }                  from './cStreamMeta.js';
import type { CStreamContentType }               from './cStreamMeta.js';
import type { NodeResult, NodeStore }            from '@floplug/shared';

// ── Renderer ──────────────────────────────────────────────────────────────────

export function renderTemplate(
  template: string,
  cStream:  any,
  store:    NodeStore,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, expr: string) => {
    const t = expr.trim();
    if (t.startsWith('cStream.')) return stringify(getValue(cStream, t.slice(8)));
    if (t.startsWith('global.'))  return stringify(store.global[t.slice(7)]);
    if (t.startsWith('local.'))   return stringify(store.local[t.slice(6)]);
    // no prefix → implicitly cStream
    return stringify(getValue(cStream, t));
  });
}

function stringify(val: unknown): string {
  if (val === undefined || val === null) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

// ── Post-processor ────────────────────────────────────────────────────────────

function coerceOutput(rendered: string, contentType: CStreamContentType): unknown {
  if (contentType === 'application/json') {
    try { return JSON.parse(rendered); } catch { /* fall through */ }
  }
  // All other types (xml, html, csv, plain) → raw string
  return rendered;
}

// ── Main executor ─────────────────────────────────────────────────────────────

export function executeTemplateNode(
  cStream: unknown,
  nd:      Record<string, any>,
  store:   NodeStore,
): NodeResult {
  const template    = String(nd.template    ?? '');
  const outputMode  = String(nd.outputMode  ?? 'overwrite') as 'overwrite' | 'store';
  const contentType = String(nd.contentType ?? 'text/plain') as CStreamContentType;
  const storeScope  = String(nd.storeScope  ?? 'global') as 'global' | 'local';
  const storeName   = String(nd.storeName   ?? '');

  if (!template.trim()) {
    return { cStream, logLine: '⚠ Template: empty template — cStream unchanged' };
  }

  // Always unwrap before rendering — cStream may arrive as an envelope
  // if a previous TemplateNode ran in the same flow.
  const rawCStream = unwrap(cStream);
  const rendered   = renderTemplate(template, rawCStream, store);
  const output     = coerceOutput(rendered, contentType);

  // ── Store mode: save rendered value, pass cStream through ────────────────
  if (outputMode === 'store' && storeName) {
    const s: Record<string, any> = storeScope === 'local' ? store.local : store.global;
    s[storeName] = output;
    return {
      cStream,  // original cStream unchanged
      logLine: `✓ Template (${contentType}): rendered ${rendered.length} chars → ${storeScope}.${storeName}`,
    };
  }

  // ── Overwrite mode: wrap in envelope so endNode knows the content type ────
  // The envelope is transparent to all other nodes (they call unwrap() first).
  return {
    cStream: wrapEnvelope(output, contentType),
    logLine: `✓ Template (${contentType}): rendered ${rendered.length} chars`,
  };
}
