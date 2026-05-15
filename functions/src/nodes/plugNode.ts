// functions/src/nodes/plugNode.ts
//
// Changes:
//  1. Response wrapped as canonical { message, _meta } instead of spreading
//     _plugResponse onto cStream root.
//  2. Output target support: nd.outputTarget ('cStream'|'local'|'global')
//     and nd.outputVarName. When local/global, cStream passes through unchanged.
//  3. Request body built from cStream.message (canonical) with fallback to
//     cStream.value (legacy TemplateNode envelope).
//  4. resolvePlugUrl uses resolveUrl from resolveValue.ts for consistency.

import { applyAuth }              from '../engine/applyAuth.js';
import { getFirestore }           from 'firebase-admin/firestore';
import type { PlugConfig, AuthProtocol, PlugVariableBinding } from '@floplug/shared';
import { COLLECTIONS, HUB_COLLECTIONS, SUB_COLLECTIONS }     from '@floplug/shared';
import { wrapMessage, getMessage, resolveUrl, type ValueBinding } from './cStreamMeta.js';

export const executePlugNode = async (
  cStream: unknown,
  nd:      Record<string, any>,
  store:   { global: Record<string, any>; local: Record<string, any> },
): Promise<{ cStream: unknown; logLine: string }> => {

  const { hubId, tenantId, plugId, urlVariables, method } = nd;
  const outputTarget  = (nd.outputTarget  as string) || 'cStream';
  const outputVarName = (nd.outputVarName as string) || '';

  console.log(`[plugNode] START plugId=${plugId} hubId=${hubId} outputTarget=${outputTarget}`);

  // ── 1. Load plug ────────────────────────────────────────────────────────────
  const plugSnap = await getFirestore()
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
    .collection(HUB_COLLECTIONS.PLUGS).doc(plugId)
    .get();
  if (!plugSnap.exists) throw new Error(`Plug not found: ${plugId}`);
  const plug = plugSnap.data() as PlugConfig;
  console.log(`[plugNode] Loaded plug: "${plug.name}" protocol=${plug.authProtocol}`);

  // ── 2. Load auth protocol ───────────────────────────────────────────────────
  const protoSnap = await getFirestore()
    .collection(COLLECTIONS.GLOBAL_SETTINGS)
    .doc(SUB_COLLECTIONS.AUTH_TYPES)
    .get();
  const authProtocols = protoSnap.data()?.authProtocols as AuthProtocol[] ?? [];
  const authProtocol  = authProtocols.find(p => p.name === plug.authProtocol);
  if (!authProtocol) throw new Error(`Auth protocol not found: ${plug.authProtocol}`);

  // ── 3. Merge urlVariables with admin defaultValues ──────────────────────────
  const mergedVariables: Record<string, ValueBinding> = {};
  for (const hint of plug.variableHints ?? []) {
    if (hint.defaultValue) {
      mergedVariables[hint.name] = { source: 'static', value: hint.defaultValue };
    }
  }
  for (const [key, binding] of Object.entries(
    (urlVariables ?? {}) as Record<string, PlugVariableBinding>
  )) {
    if (binding?.value) mergedVariables[key] = binding as ValueBinding;
  }

  // ── 4. Resolve URL ──────────────────────────────────────────────────────────
  const cs = cStream as Record<string, unknown>;
  const url = resolveUrl(plug.urlPattern, mergedVariables, { cStream: cs, store });
  console.log(`[plugNode] Resolved URL: ${url}`);

  // ── 5. Apply auth ───────────────────────────────────────────────────────────
  const auth = await applyAuth(authProtocol, plug.credentials);

  // ── 6. Build request body ───────────────────────────────────────────────────
  // Priority: cStream.message (canonical) → cStream.value (legacy TemplateNode) → full cStream
  const msg     = getMessage(cs);
  const rawBody = (msg != null && typeof msg === 'string')
    ? msg                                            // already a string (XML, CSV, etc.)
    : (msg != null)
      ? JSON.stringify(msg)                          // object → JSON
      : ((cs as any)?.value != null)
        ? String((cs as any).value)                 // legacy TemplateNode .value field
        : JSON.stringify(cs ?? {});                  // full cStream fallback

  const finalBody = auth.soapEnvelope ? auth.soapEnvelope(rawBody) : rawBody;

  console.log(`[plugNode] Method: ${method ?? 'POST'}`);
  console.log(`[plugNode] Headers: ${JSON.stringify(auth.headers)}`);
  if (auth.soapEnvelope) {
    console.log('[plugNode] ─── SOAP ENVELOPE ───\n' + finalBody + '\n[plugNode] ─── END ───');
  } else {
    console.log(`[plugNode] Body (first 500): ${rawBody.slice(0, 500)}`);
  }

  // ── 7. HTTP request ─────────────────────────────────────────────────────────
  const response = await fetch(url, {
    method:  method ?? 'POST',
    headers: { ...auth.headers },
    body:    finalBody,
  });

  const responseText = await response.text();
  const statusLine   = `${response.status} ${response.statusText}`;
  console.log(`[plugNode] Response: ${statusLine} (${responseText.length} chars)`);

  if (!response.ok) {
    throw new Error(`Plug request failed [${statusLine}]:\n${responseText}`);
  }

  // ── 8. Parse response ───────────────────────────────────────────────────────
  let parsedMessage: unknown;
  let contentType = 'text/xml';

  try {
    parsedMessage = JSON.parse(responseText);
    contentType   = 'application/json';
    console.log('[plugNode] Response parsed as JSON');
  } catch {
    // Raw string — XML or other text format
    parsedMessage = responseText;
    contentType   = 'text/xml';
    console.log(`[plugNode] Response kept as text/xml (${responseText.length} chars)`);
  }

  // ── 9. Route output ─────────────────────────────────────────────────────────
  const meta = { contentType, status: response.status, source: nd.id ?? 'plugNode' };

  const logLine = [
    `✓ PlugNode: ${plug.name}`,
    `→ ${url}`,
    `[${statusLine}]`,
    `${contentType} ${responseText.length} chars`,
    outputTarget !== 'cStream' ? `→ ${outputTarget}.${outputVarName}` : '',
  ].filter(Boolean).join(' ');

  if (outputTarget === 'local' && outputVarName) {
    store.local[outputVarName] = parsedMessage;
    // cStream passes through unchanged — just update _meta.source
    const nextCs = typeof cs === 'object' && cs !== null
      ? { ...cs, _meta: { ...(cs._meta as object ?? {}), source: nd.id ?? 'plugNode' } }
      : cs;
    return { cStream: nextCs, logLine };
  }

  if (outputTarget === 'global' && outputVarName) {
    store.global[outputVarName] = parsedMessage;
    const nextCs = typeof cs === 'object' && cs !== null
      ? { ...cs, _meta: { ...(cs._meta as object ?? {}), source: nd.id ?? 'plugNode' } }
      : cs;
    return { cStream: nextCs, logLine };
  }

  // Default: overwrite cStream with canonical envelope
  return {
    cStream: wrapMessage(parsedMessage, meta),
    logLine,
  };
};
