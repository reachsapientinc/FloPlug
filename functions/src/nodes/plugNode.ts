// functions/src/nodes/plugNode.ts
//
// Changes in this version:
//  1. resolvePlugCredentials checks nd.connectionId (developer's canvas choice)
//     BEFORE plug.connectionId (plug's admin default).
//  2. Connection is loaded from the correct tenant path:
//     FloPlugHubs/{hubId}/Tenants/{tenantId}/FloConnections/{connectionId}
//  3. All other behaviour (output target, URL resolution, applyAuth) unchanged.

import { applyAuth }              from '../engine/applyAuth.js';
import { getFirestore }           from 'firebase-admin/firestore';
import type {
  PlugConfig, AuthProtocol, PlugVariableBinding, PlugCredentialValues,
} from '@floplug/shared';
import { COLLECTIONS, HUB_COLLECTIONS, SUB_COLLECTIONS } from '@floplug/shared';
import {
  wrapMessage, getMessage, resolveUrl, type ValueBinding,
} from './cStreamMeta.js';
import type { FloConnectionDoc } from '@floplug/shared';

// ── Credential resolution priority ───────────────────────────────────────────
// 1. nd.connectionId  — developer chose a specific connection on the canvas
// 2. plug.connectionId — plug's admin-configured default connection
// 3. plug.credentials  — legacy inline credentials (pre-FloConnection plugs)
// 4. Error

async function resolvePlugCredentials(
  plug:     PlugConfig,
  hubId:    string,
  tenantId: string,
  /** connectionId from node.data — developer's canvas choice (overrides plug default) */
  nodeConnectionId?: string,
): Promise<PlugCredentialValues> {
  const effectiveConnectionId = nodeConnectionId || plug.connectionId;

  if (effectiveConnectionId) {
    console.log(`[plugNode] Loading credentials from FloConnection: ${effectiveConnectionId} (source: ${nodeConnectionId ? 'node/canvas' : 'plug default'})`);
    const connSnap = await getFirestore()
      .collection(COLLECTIONS.HUBS).doc(hubId)
      .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
      .collection(HUB_COLLECTIONS.FLO_CONNECTIONS).doc(effectiveConnectionId)
      .get();

    if (!connSnap.exists) {
      throw new Error(
        `FloConnection "${effectiveConnectionId}" not found under tenant ${tenantId}. ` +
        `Ensure a Hub Admin has created this connection in the Connections tab.`
      );
    }

    const connData = connSnap.data() as FloConnectionDoc;
    if (!connData.isActive) {
      throw new Error(`FloConnection "${effectiveConnectionId}" is inactive. Contact your Hub Admin.`);
    }

    const creds = connData.credentials;
    if (!creds || Object.keys(creds).length === 0) {
      throw new Error(
        `FloConnection "${effectiveConnectionId}" has no credentials configured. ` +
        `Contact your Hub Admin to complete the connection setup.`
      );
    }
    console.log(`[plugNode] Credentials loaded from FloConnection "${connData.name}" (${effectiveConnectionId})`);
    return creds;
  }

  // Legacy: inline credentials on the plug doc
  if (plug.credentials && Object.keys(plug.credentials).length > 0) {
    console.log(`[plugNode] Using inline credentials from plug "${plug.name}" (legacy — migrate to FloConnection)`);
    return plug.credentials;
  }

  throw new Error(
    `Plug "${plug.name}" has no credentials. ` +
    `Configure a FloConnection in the Connections tab or have a Hub Admin add inline credentials.`
  );
}

// ── Main executor ─────────────────────────────────────────────────────────────

export const executePlugNode = async (
  cStream: unknown,
  nd:      Record<string, any>,
  store:   { global: Record<string, any>; local: Record<string, any> },
): Promise<{ cStream: unknown; logLine: string }> => {

  const { hubId, tenantId, plugId, urlVariables, method } = nd;
  const outputTarget     = (nd.outputTarget  as string) || 'cStream';
  const outputVarName    = (nd.outputVarName as string) || '';
  // Developer's canvas connection choice — takes priority over plug default
  const nodeConnectionId = (nd.connectionId  as string) || '';

  console.log(`[plugNode] START plugId=${plugId} hubId=${hubId} outputTarget=${outputTarget} nodeConnectionId=${nodeConnectionId || '(none)'}`);

  // ── 1. Load plug ──────────────────────────────────────────────────────────
  const plugSnap = await getFirestore()
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
    .collection(HUB_COLLECTIONS.PLUGS).doc(plugId)
    .get();
  if (!plugSnap.exists) throw new Error(`Plug not found: ${plugId}`);
  const plug = plugSnap.data() as PlugConfig;
  console.log(`[plugNode] Loaded plug: "${plug.name}" protocol=${plug.authProtocol}`);

  // ── 2. Load auth protocol ─────────────────────────────────────────────────
  const protoSnap = await getFirestore()
    .collection(COLLECTIONS.GLOBAL_SETTINGS)
    .doc(SUB_COLLECTIONS.AUTH_TYPES)
    .get();
  const authProtocols = protoSnap.data()?.authProtocols as AuthProtocol[] ?? [];
  const authProtocol  = authProtocols.find(p => p.name === plug.authProtocol);
  if (!authProtocol) throw new Error(`Auth protocol not found: ${plug.authProtocol}`);

  // ── 3. Merge urlVariables with admin defaultValues ────────────────────────
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

  // ── 4. Resolve URL ────────────────────────────────────────────────────────
  const cs  = cStream as Record<string, unknown>;
  const url = resolveUrl(plug.urlPattern, mergedVariables, { cStream: cs, store });
  console.log(`[plugNode] Resolved URL: ${url}`);

  // ── 5. Resolve credentials (canvas choice > plug default > inline) ────────
  const credentials = await resolvePlugCredentials(plug, hubId, tenantId, nodeConnectionId);
  const auth = await applyAuth(authProtocol, credentials);

  // ── 6. Build request body ─────────────────────────────────────────────────
  const msg     = getMessage(cs);
  const rawBody = (msg != null && typeof msg === 'string')
    ? msg
    : (msg != null)
      ? JSON.stringify(msg)
      : ((cs as any)?.value != null)
        ? String((cs as any).value)
        : JSON.stringify(cs ?? {});

  const finalBody = auth.soapEnvelope ? auth.soapEnvelope(rawBody) : rawBody;

  console.log(`[plugNode] Method: ${method ?? 'POST'}`);
  console.log(`[plugNode] Headers: ${JSON.stringify(auth.headers)}`);

  // ── 7. HTTP request ───────────────────────────────────────────────────────
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

  // ── 8. Parse response ─────────────────────────────────────────────────────
  let parsedMessage: unknown;
  let contentType = 'text/xml';

  try {
    parsedMessage = JSON.parse(responseText);
    contentType   = 'application/json';
    console.log('[plugNode] Response parsed as JSON');
  } catch {
    parsedMessage = responseText;
    contentType   = 'text/xml';
    console.log(`[plugNode] Response kept as text/xml (${responseText.length} chars)`);
  }

  // ── 9. Route output ───────────────────────────────────────────────────────
  const meta    = { contentType, status: response.status, source: nd.id ?? 'plugNode' };
  const connLabel = nodeConnectionId
    ? `conn:${nodeConnectionId}`
    : (plug.connectionId ? `conn:${plug.connectionId}` : 'inline-creds');

  const logLine = [
    `✓ PlugNode: ${plug.name}`,
    `[${connLabel}]`,
    `→ ${url}`,
    `[${statusLine}]`,
    `${contentType} ${responseText.length} chars`,
    outputTarget !== 'cStream' ? `→ ${outputTarget}.${outputVarName}` : '',
  ].filter(Boolean).join(' ');

  if (outputTarget === 'local' && outputVarName) {
    store.local[outputVarName] = parsedMessage;
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

  return {
    cStream: wrapMessage(parsedMessage, meta),
    logLine,
  };
};
