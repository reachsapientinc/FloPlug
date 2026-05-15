/**
 * functions/src/engine/resolveValue.ts
 *
 * Single source of truth for resolving a value binding against the
 * canonical cStream structure, local store, and global store.
 *
 * Canonical cStream shape (internal):
 *   {
 *     message:  <current payload — THE data flowing through the flo>,
 *     _meta: {
 *       contentType?: string,   // 'text/xml', 'application/json', etc.
 *       status?:      number,   // HTTP status from last plug
 *       source?:      string,   // node id that produced this
 *     }
 *   }
 *
 * Resolution rules:
 *   source=cStream, path=""        → cStream.message  (whole payload)
 *   source=cStream, path="empId"   → cStream.message.empId
 *   source=cStream, path="a.b.c"   → cStream.message.a.b.c
 *   source=local,   path="myVar"   → store.local.myVar
 *   source=local,   path="a.b"     → store.local.a.b
 *   source=global,  path="cfg.key" → store.global.cfg.key
 *   source=static,  path="hello"   → "hello"  (literal string)
 *
 * Backward-compat: if cStream does not yet have a .message wrapper
 * (e.g. produced by an old node), the whole cStream is treated as
 * the message so existing flos keep working without migration.
 */

import { getValue } from '../utils/pathUtils.js';

export type ValueSource = 'static' | 'cStream' | 'local' | 'global';

export interface ValueBinding {
  source: ValueSource;
  value:  string;         // path for cStream/local/global; literal for static
}

export interface ResolveContext {
  cStream: Record<string, unknown>;
  store:   { local: Record<string, unknown>; global: Record<string, unknown> };
}

/**
 * Extract the message payload from a canonical cStream envelope.
 * Falls back to the whole cStream for backward compatibility.
 */
export function getMessage(cStream: Record<string, unknown>): unknown {
  // New canonical shape: { message: <payload>, _meta: {...} }
  if ('message' in cStream) return cStream.message;
  // Legacy: cStream IS the payload — return as-is
  return cStream;
}

/**
 * Wrap a node result as a canonical cStream envelope.
 * Call this in every node that produces output.
 */
export function wrapMessage(
  payload:     unknown,
  meta?: {
    contentType?: string;
    status?:      number;
    source?:      string;
  },
): Record<string, unknown> {
  return {
    message: payload,
    _meta:   meta ?? {},
  };
}

/**
 * Pass cStream through unchanged, replacing only _meta.source.
 * Used by nodes that mutate cStream.message in place.
 */
export function passThroughMessage(
  cStream:  Record<string, unknown>,
  newMessage: unknown,
  source?:  string,
): Record<string, unknown> {
  const existingMeta = (cStream._meta as Record<string, unknown>) ?? {};
  return {
    message: newMessage,
    _meta:   { ...existingMeta, ...(source ? { source } : {}) },
  };
}

/**
 * Resolve a single ValueBinding to a string value.
 * Used by emailNode and any other node with named field bindings.
 */
export function resolveToString(
  binding:  ValueBinding | undefined,
  ctx:      ResolveContext,
): string {
  if (!binding) return '';
  const raw = resolveToRaw(binding, ctx);
  if (raw == null) return '';
  if (typeof raw === 'object') return JSON.stringify(raw);
  return String(raw);
}

/**
 * Resolve a single ValueBinding to its raw (uncoerced) value.
 * Returns undefined if the path resolves to nothing.
 */
export function resolveToRaw(
  binding: ValueBinding | undefined,
  ctx:     ResolveContext,
): unknown {
  if (!binding) return undefined;

  switch (binding.source) {
    case 'static':
      return binding.value;

    case 'cStream': {
      const msg = getMessage(ctx.cStream);
      if (!binding.value) return msg;                        // bare "cStream" → whole message
      if (msg == null || typeof msg !== 'object') return undefined;
      return getValue(msg as Record<string, unknown>, binding.value);
    }

    case 'local':
      return binding.value
        ? getValue(ctx.store.local, binding.value)
        : ctx.store.local;

    case 'global':
      return binding.value
        ? getValue(ctx.store.global, binding.value)
        : ctx.store.global;

    default:
      return undefined;
  }
}

/**
 * Resolve a URL pattern like "https://host/{{tenantId}}/workers"
 * replacing {{varName}} tokens using the provided bindings map.
 */
export function resolveUrl(
  pattern:  string,
  bindings: Record<string, ValueBinding>,
  ctx:      ResolveContext,
): string {
  return pattern.replace(/\{\{(\w+)\}\}/g, (_, varName: string) => {
    const b = bindings[varName];
    if (!b) return varName;
    return resolveToString(b, ctx);
  });
}
