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
import { COLLECTIONS, HUB_COLLECTIONS, SUB_COLLECTIONS, isReservedStoreKey } from '@floplug/shared';
import {
  wrapMessage, resolveUrl, type ValueBinding,
} from './cStreamMeta.js';
import { unwrapWithMeta } from './cStreamMeta.js';
import type { FloConnectionDoc, NodeHttpTrace, ConnectorDoc } from '@floplug/shared';
import { redactSecretHeaders } from '@floplug/shared';
import { isConnectionBackedPlugUrlVar, type FloRunMeta } from '@floplug/shared';
import {
  buildPlugSegmentValues,
  resolveConnectorTokenUrl,
} from '../engine/resolveConnectorUrlRuntime.js';
import { plugNodeTokensForConnector } from '@floplug/shared';

// ── Credential resolution priority ───────────────────────────────────────────
// 1. nd.connectionId  — developer chose a specific connection on the canvas
// 2. plug.connectionId — plug's admin-configured default connection
// 3. plug.credentials  — legacy inline credentials (pre-FloConnection plugs)
// 4. Error

function applyConnectionUrlBindings(
  mergedVariables: Record<string, ValueBinding>,
  conn: FloConnectionDoc,
): void {
  if (conn.hostname) {
    mergedVariables.hostname = { source: 'static', value: conn.hostname };
  }
  if (conn.tenantKey) {
    mergedVariables.tenant    = { source: 'static', value: conn.tenantKey };
    mergedVariables.tenantKey = { source: 'static', value: conn.tenantKey };
  }
  if (conn.baseUrl) {
    mergedVariables.baseUrl = { source: 'static', value: conn.baseUrl };
    mergedVariables.url     = { source: 'static', value: conn.baseUrl };
  }
}

async function resolvePlugCredentials(
  plug:     PlugConfig,
  hubId:    string,
  tenantId: string,
  /** connectionId from node.data — developer's canvas choice (overrides plug default) */
  nodeConnectionId?: string,
): Promise<{ credentials: PlugCredentialValues; connection?: FloConnectionDoc }> {
  const effectiveConnectionId = nodeConnectionId || plug.defaultConnectionId || plug.connectionId;
  const plugAllowed = plug.allowedConnectionIds ?? [];

  if (plugAllowed.length > 0 && effectiveConnectionId && !plugAllowed.includes(effectiveConnectionId)) {
    throw new Error(
      `Connection "${effectiveConnectionId}" is not allowed for plug "${plug.name}". ` +
      `Choose one of the connections configured by your hub admin.`,
    );
  }

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
    return { credentials: creds, connection: connData };
  }

  // Legacy: inline credentials on the plug doc
  if (plug.credentials && Object.keys(plug.credentials).length > 0) {
    console.log(`[plugNode] Using inline credentials from plug "${plug.name}" (legacy — migrate to FloConnection)`);
    return { credentials: plug.credentials };
  }

  throw new Error(
    `Plug "${plug.name}" has no connection. ` +
    `Select a connection on the plug node or configure a FloConnection in Hub Admin.`
  );
}

// ── Main executor ─────────────────────────────────────────────────────────────

export const executePlugNode = async (
  cStream: unknown,
  nd:      Record<string, any>,
  store:   { global: Record<string, any>; local: Record<string, any> },
  floRunMeta?: Readonly<FloRunMeta>,
): Promise<{ cStream: unknown; logLine: string; httpTrace?: NodeHttpTrace }> => {

  const previewBody = (body: string, max = 800): string =>
    body.length > max ? `${body.slice(0, max)}\n… [${body.length} chars total]` : body;

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
    if (binding?.value && !isConnectionBackedPlugUrlVar(key)) {
      mergedVariables[key] = binding as ValueBinding;
    }
  }

  // ── 4. Resolve credentials + connection-backed URL segments ─────────────
  const { credentials, connection } = await resolvePlugCredentials(
    plug, hubId, tenantId, nodeConnectionId,
  );
  if (connection) {
    applyConnectionUrlBindings(mergedVariables, connection);
  }

  // ── 5. Resolve URL ────────────────────────────────────────────────────────
  const cs  = cStream as Record<string, unknown>;
  const ctx = { cStream: cs, store, floRunMeta };

  const connectorSnap = await getFirestore()
    .doc(`${COLLECTIONS.CONNECTORS}/${plug.connectorId}`)
    .get();
  const connector = connectorSnap.exists
    ? ({ id: connectorSnap.id, ...connectorSnap.data() } as ConnectorDoc)
    : null;

  const plugValues = {
    ...(plug.plugUrlValuesByConnection?.[nodeConnectionId || plug.defaultConnectionId || plug.connectionId || ''] ?? {}),
    ...buildPlugSegmentValues(
      plugNodeTokensForConnector(connector),
      mergedVariables,
      ctx,
    ),
  };

  const tokenUrl = resolveConnectorTokenUrl({
    connector,
    connection,
    plugValues,
  });

  const url = tokenUrl && /^https?:\/\//i.test(tokenUrl)
    ? tokenUrl
    : resolveUrl(plug.urlPattern, mergedVariables, ctx);
  console.log(`[plugNode] Resolved URL: ${url}`);

  const auth = await applyAuth(authProtocol, credentials);

  // ── 6. Build request body ─────────────────────────────────────────────────
  // Unwrap TemplateNode envelope / canonical cStream so XML is sent raw, not JSON.
  const { value: payload, contentType: inboundContentType } = unwrapWithMeta(cs);

  let rawBody: string;
  if (payload == null) {
    rawBody = '';
  } else if (typeof payload === 'string') {
    rawBody = payload;
  } else if (
    inboundContentType.includes('xml')
    || inboundContentType.includes('html')
    || inboundContentType.includes('text/plain')
  ) {
    rawBody = typeof payload === 'object' && payload !== null && 'value' in (payload as object)
      ? String((payload as { value: unknown }).value)
      : String(payload);
  } else {
    rawBody = JSON.stringify(payload);
  }

  const finalBody = auth.soapEnvelope ? auth.soapEnvelope(rawBody) : rawBody;

  const headers: Record<string, string> = { ...auth.headers };
  if (!headers['Content-Type'] && !headers['content-type']) {
    if (inboundContentType.includes('xml')) {
      headers['Content-Type'] = 'text/xml; charset=utf-8';
    } else if (inboundContentType.includes('json')) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
    }
  }

  console.log(`[plugNode] Method: ${method ?? 'POST'}`);
  console.log(`[plugNode] Content-Type: ${headers['Content-Type'] ?? headers['content-type'] ?? '(from auth)'}`);
  console.log(`[plugNode] Body length: ${finalBody.length} chars (inbound ${inboundContentType})`);
  console.log(`[plugNode] Headers: ${JSON.stringify(auth.headers)}`);

  const dryRun = nd.dryRun === true;
  if (dryRun) {
    const httpTrace: NodeHttpTrace = {
      method:             method ?? 'POST',
      url,
      requestHeaders:     redactSecretHeaders({ ...auth.headers }),
      requestBody:        finalBody,
      requestBodyPreview: previewBody(finalBody),
      status:             200,
      statusText:         'OK (simulated — dry run)',
      responseBody:         '[DRY RUN] No HTTP request was sent.',
      responseBodyPreview:  '[DRY RUN] Simulated response',
    };
    const parsedMessage = {
      _dryRun: true,
      _simulated: true,
      inboundPreview: previewBody(finalBody, 400),
    };
    const meta = { contentType: inboundContentType, status: 200, source: nd.id ?? 'plugNode', dryRun: true };
    const logLine = `[DRY RUN] PlugNode: ${plug.name} → ${url} (${finalBody.length} chars, not sent)`;
    if (outputTarget === 'local' && outputVarName) {
      store.local[outputVarName] = parsedMessage;
      return { cStream: cs, logLine, httpTrace };
    }
    if (outputTarget === 'global' && outputVarName && !isReservedStoreKey(outputVarName)) {
      store.global[outputVarName] = parsedMessage;
      return { cStream: cs, logLine, httpTrace };
    }
    return { cStream: wrapMessage(parsedMessage, meta), logLine, httpTrace };
  }

  // ── 7. HTTP request ───────────────────────────────────────────────────────
  const response = await fetch(url, {
    method:  method ?? 'POST',
    headers,
    body:    finalBody,
  });

  const responseText = await response.text();
  const statusLine   = `${response.status} ${response.statusText}`;
  console.log(`[plugNode] Response: ${statusLine} (${responseText.length} chars)`);

  const contentTypeHeader = response.headers.get('content-type');
  const httpTrace: NodeHttpTrace = {
    method:               method ?? 'POST',
    url,
    requestHeaders:       redactSecretHeaders({ ...auth.headers }),
    requestBody:          finalBody,
    requestBodyPreview:   previewBody(finalBody),
    status:               response.status,
    statusText:           response.statusText,
    responseBody:         responseText,
    responseBodyPreview:  previewBody(responseText),
    ...(contentTypeHeader ? { responseContentType: contentTypeHeader } : {}),
  };

  if (!response.ok) {
    const err = new Error(`Plug request failed [${statusLine}]:\n${responseText}`) as Error & { httpTrace?: NodeHttpTrace };
    err.httpTrace = httpTrace;
    throw err;
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
    return { cStream: nextCs, logLine, httpTrace };
  }

  if (outputTarget === 'global' && outputVarName && !isReservedStoreKey(outputVarName)) {
    store.global[outputVarName] = parsedMessage;
    const nextCs = typeof cs === 'object' && cs !== null
      ? { ...cs, _meta: { ...(cs._meta as object ?? {}), source: nd.id ?? 'plugNode' } }
      : cs;
    return { cStream: nextCs, logLine, httpTrace };
  }

  return {
    cStream: wrapMessage(parsedMessage, meta),
    logLine,
    httpTrace,
  };
};
