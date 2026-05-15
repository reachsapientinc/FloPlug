/**
 * functions/src/nodes/cStreamMeta.ts
 *
 * CStreamEnvelope — the internal flow envelope.
 *
 * Throughout a flow, data travels as a plain value (cStream).
 * When a TemplateNode renders content with a specific MIME type,
 * the content type needs to travel alongside without polluting
 * the content itself (which may be raw XML, CSV, plain text, etc.).
 *
 * Solution: a thin envelope { value, contentType } used ONLY inside
 * the flow runner. The endNode unwraps it and emits correctly.
 *
 * Rules:
 *   - Only TemplateNode wraps into an envelope.
 *   - All other nodes receive the raw value (unwrapped before dispatch).
 *   - EndNode detects the envelope and formats the final output.
 *   - Mapper/Filter/Function/VarStore all operate on raw cStream —
 *     they never see the envelope wrapper.
 *
 * This means:
 *   XML template → downstream nodes get the raw XML string
 *   JSON template → downstream nodes get the parsed object
 *   CSV/text/html → downstream nodes get the raw string
 *   Content-type is preserved for the endNode to use.
 */

export type CStreamContentType =
  | 'text/plain'
  | 'application/xml'
  | 'application/json'
  | 'text/html'
  | 'text/csv';

export interface CStreamEnvelope {
  __floplug_envelope: true;
  value:              unknown;
  contentType:        CStreamContentType;
}

/** Wrap a rendered value with its content type. */
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
 * Use this at the top of every node executor to ensure
 * they always receive raw content regardless of upstream.
 */
export function unwrap(val: unknown): unknown {
  return isEnvelope(val) ? val.value : val;
}

/**
 * Unwrap and return both value + contentType.
 * contentType defaults to 'application/json' when not an envelope
 * (backwards compatible — plain objects have always been treated as JSON).
 */
export function unwrapWithMeta(val: unknown): { value: unknown; contentType: CStreamContentType } {
  if (isEnvelope(val)) return { value: val.value, contentType: val.contentType };
  return { value: val, contentType: 'application/json' };
}
