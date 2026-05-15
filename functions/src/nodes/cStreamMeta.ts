/**
 * functions/src/nodes/cStreamMeta.ts
 *
 * Two concerns live here:
 *
 * 1. CStreamEnvelope — thin wrapper TemplateNode uses to carry a MIME
 *    content-type alongside rendered output so EndNode can emit correctly.
 *    Only TemplateNode wraps; all other nodes call unwrap() on arrival.
 *
 * 2. Re-exports of the canonical cStream helpers from resolveValue.ts
 *    (getMessage, wrapMessage, passThroughMessage) so node files only
 *    need to import from one place.
 *
 * Canonical cStream shape (set by every node that produces output):
 *   {
 *     message:  <current payload>,
 *     _meta: {
 *       contentType?: string,
 *       status?:      number,
 *       source?:      string,
 *     }
 *   }
 *
 * Resolution convention (used by resolveValue.ts):
 *   "cStream"        → cStream.message  (whole payload)
 *   "cStream.empId"  → cStream.message.empId
 *   "local.myVar"    → store.local.myVar
 *   "global.cfg.key" → store.global.cfg.key
 */

export type CStreamContentType =
  | 'text/plain'
  | 'text/xml'
  | 'application/xml'
  | 'application/json'
  | 'text/html'
  | 'text/csv';

export interface CStreamEnvelope {
  __floplug_envelope: true;
  value:              unknown;
  contentType:        CStreamContentType;
}

/** Wrap a rendered value with its content type (TemplateNode only). */
export function wrapEnvelope(value: unknown, contentType: CStreamContentType): CStreamEnvelope {
  return { __floplug_envelope: true, value, contentType };
}

/** True if the value is a FloPlug envelope. */
export function isEnvelope(val: unknown): val is CStreamEnvelope {
  return (
    typeof val === 'object' &&
    val !== null &&
    (val as any).__floplug_envelope === true
  );
}

/**
 * Unwrap an envelope to its raw value.
 * If not an envelope, returns the value as-is.
 */
export function unwrap(val: unknown): unknown {
  return isEnvelope(val) ? val.value : val;
}

/**
 * Unwrap and return both value + contentType.
 * contentType defaults to 'application/json' when not an envelope.
 */
export function unwrapWithMeta(val: unknown): { value: unknown; contentType: CStreamContentType } {
  if (isEnvelope(val)) return { value: val.value, contentType: val.contentType };
  // Check if it's a canonical cStream envelope with _meta.contentType
  if (
    typeof val === 'object' && val !== null &&
    'message' in (val as any)
  ) {
    const cs    = val as Record<string, unknown>;
    const meta  = cs._meta as Record<string, unknown> | undefined;
    const ct    = (meta?.contentType as CStreamContentType | undefined) ?? 'application/json';
    return { value: cs.message, contentType: ct };
  }
  return { value: val, contentType: 'application/json' };
}

// ── Re-export canonical helpers so nodes import from one place ────────────────
export {
  getMessage,
  wrapMessage,
  passThroughMessage,
  resolveToString,
  resolveToRaw,
  resolveUrl,
  type ValueBinding,
  type ValueSource,
  type ResolveContext,
} from '../engine/resolveValue.js';
