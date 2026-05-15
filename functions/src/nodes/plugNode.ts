// functions/src/nodes/plugNode.ts
import { applyAuth }      from '../engine/applyAuth.js';
import { resolvePlugUrl } from '../engine/resolvePlugUrl.js';
import { getFirestore }   from 'firebase-admin/firestore';
import type { PlugConfig, AuthProtocol, PlugVariableBinding} from '@floplug/shared';

import {COLLECTIONS,HUB_COLLECTIONS,SUB_COLLECTIONS} from '@floplug/shared';

export const executePlugNode = async (
  cStream: unknown,
  nd:      Record<string, any>,
  store:   { global: Record<string, any>; local: Record<string, any> },
): Promise<{ cStream: unknown; logLine: string }> => {

  const { hubId, tenantId, plugId, urlVariables, method } = nd;

  console.log(`[plugNode] START plugId=${plugId} hubId=${hubId} tenantId=${tenantId}`);

  // 1. Load plug
  const plugSnap = await getFirestore()
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
    .collection(HUB_COLLECTIONS.PLUGS).doc(plugId)
    .get();
  if (!plugSnap.exists) throw new Error(`Plug not found: ${plugId}`);
  const plug = plugSnap.data() as PlugConfig;
  console.log(`[plugNode] Loaded plug: "${plug.name}" protocol=${plug.authProtocol}`);

  // 2. Load auth protocol
  const protoSnap = await getFirestore()
    .collection(COLLECTIONS.GLOBAL_SETTINGS)
    .doc(SUB_COLLECTIONS.AUTH_TYPES)
    .get();
  const authProtocols = protoSnap.data()?.authProtocols as AuthProtocol[] ?? [];
  const authProtocol  = authProtocols.find(p => p.name === plug.authProtocol);
  if (!authProtocol) throw new Error(`Auth protocol not found: ${plug.authProtocol}`);
  console.log(`[plugNode] Auth protocol: ${authProtocol.name} authStyle=${(authProtocol as any).authStyle ?? 'derived'}`);

  // 3. Merge developer urlVariables with admin defaultValues from variableHints
  const mergedVariables: Record<string, PlugVariableBinding> = {};

  for (const hint of plug.variableHints ?? []) {
    if (hint.defaultValue) {
      mergedVariables[hint.name] = { source: 'static', value: hint.defaultValue };
    }
  }
  for (const [key, binding] of Object.entries((urlVariables ?? {}) as Record<string, PlugVariableBinding>)) {
    if (binding?.value) mergedVariables[key] = binding;
  }
  console.log(`[plugNode] Resolved urlVariables: ${JSON.stringify(mergedVariables)}`);

  // 4. Resolve URL
  const url = resolvePlugUrl(
    plug.urlPattern,
    mergedVariables,
    { cStream, globalVars: store.global, localVars: store.local }
  );
  console.log(`[plugNode] Resolved URL: ${url}`);

  // 5. Apply auth
  const auth = await applyAuth(authProtocol, plug.credentials);

  // 6. Build request body
  //    If cStream has a .value field (from TemplateNode XML output) use that,
  //    otherwise serialize the whole cStream as JSON
  const stream  = cStream as any;
  const rawBody = (stream?.value != null)
    ? String(stream.value)
    : JSON.stringify(cStream ?? {});

  const finalBody = auth.soapEnvelope ? auth.soapEnvelope(rawBody) : rawBody;

  console.log(`[plugNode] Method: ${method ?? 'POST'}`);
  console.log(`[plugNode] Headers: ${JSON.stringify(auth.headers)}`);
  if (auth.soapEnvelope) {
    console.log('[plugNode] ─── SOAP ENVELOPE ───');
    console.log(finalBody);
    console.log('[plugNode] ─── END SOAP ENVELOPE ───');
  } else {
    console.log(`[plugNode] Body: ${rawBody.slice(0, 500)}`);
  }

  // 7. Execute HTTP request
  const response = await fetch(url, {
    method:  method ?? 'POST',
    headers: { ...auth.headers },
    body:    finalBody,
  });

  const responseText = await response.text();
  const statusLine   = `${response.status} ${response.statusText}`;

  console.log(`[plugNode] Response status: ${statusLine}`);
  console.log(`[plugNode] Response body (first 2000 chars):\n${responseText.slice(0, 2000)}`);

  if (!response.ok) {
    console.error(`[plugNode] FAILED: ${statusLine}\n${responseText}`);
    throw new Error(`Plug request failed [${statusLine}]:\n${responseText}`);
  }

  // 8. Parse response
  //    Try JSON first, fall back to raw text with contentType marker
  let parsed: unknown;
  let contentType = 'xml';

  try {
    parsed      = JSON.parse(responseText);
    contentType = 'json';
    console.log(`[plugNode] Response parsed as JSON`);
  } catch {
    // Keep as raw string — downstream nodes (EndNode, TemplateNode) handle XML
    parsed      = { value: responseText, contentType: 'xml' };
    contentType = 'xml';
    console.log(`[plugNode] Response kept as XML (${responseText.length} chars)`);
  }

  // 9. Merge into cStream — spread parsed on top so downstream nodes get it
  const nextCStream = {
    ...(typeof cStream === 'object' && cStream !== null ? cStream as object : {}),
    ...(typeof parsed  === 'object' && parsed  !== null ? parsed  as object : {}),
    _plugResponse: {
      url,
      status:      response.status,
      contentType,
      // Store full response for visibility — truncate only in log, not in data
      body:        responseText,
    },
  };

  const logLine = [
    `✓ PlugNode: ${plug.name}`,
    `→ ${url}`,
    `[${statusLine}]`,
    `${contentType.toUpperCase()} ${responseText.length} chars`,
  ].join(' ');

  return { cStream: nextCStream, logLine };
};