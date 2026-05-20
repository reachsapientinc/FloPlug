/**
 * Server-side FloAction execution — auth, HTTP, mapping, response parse.
 * Used by executeFloAction Cloud Function and executeFloActionNode (in-process).
 */

import { getFirestore } from 'firebase-admin/firestore';
import type {
  AuthProtocol, ConnectorDoc, FloConnectionDoc, PlugCredentialValues,
} from '@floplug/shared';
import { COLLECTIONS, HUB_COLLECTIONS, SUB_COLLECTIONS } from '@floplug/shared';
import { applyAuth } from './applyAuth.js';
import { loadActionDocWithSchema } from './resolveActionSchema.js';
import { resolveFloActionMappingTarget } from './resolveFloActionMappingTarget.js';
import { resolveFieldMappings, type MappingRule } from './resolveFieldMappings.js';
import { buildRequestBody } from './buildRequestBody.js';
import { parseActionResponse } from './parseActionResponse.js';
import {
  FloActionAuthError,
  FloActionNetworkError,
  FloActionValidationError,
  type FloActionErrorContext,
} from './floActionErrors.js';
import { getMessage } from './resolveValue.js';

const db = getFirestore();

const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES      = 3;

export interface FloActionDebugInfo {
  resolved:            Record<string, unknown>;
  requestBody:         string;
  requestBodyInner:    string;
  url:                 string;
  method:              string;
  contentType:         string;
  unmappedFields:      string[];
  unmappedRequired:    string[];
  mappedFieldCount:    number;
  schemaFieldCount:    number;
  headersSafe:         Record<string, string>;
  validationWouldFail: boolean;
}

export interface ExecuteFloActionInput {
  hubId:         string;
  tenantId:      string;
  userId?:       string;
  actionId:      string;
  floKitId?:     string;
  connectorId:   string;
  connectionId:  string;
  cStream:       Record<string, unknown>;
  localStore:    Record<string, unknown>;
  globalStore:   Record<string, unknown>;
  mappingRules?: MappingRule[];
  /** Return resolved map + request preview (no secrets). */
  debug?:        boolean;
  /** Build request but do not call the connector API. Implies debug output. */
  dryRun?:       boolean;
}

export interface ExecuteFloActionResult {
  payload:         Record<string, unknown>;
  unmappedFields:  string[];
  executionMs:     number;
  _actionStatus:   'success' | 'error';
  debug?:          FloActionDebugInfo;
}

function errorContext(input: ExecuteFloActionInput): FloActionErrorContext {
  return {
    actionId:     input.actionId,
    connectionId: input.connectionId,
    connectorId:  input.connectorId,
  };
}

async function loadFloConnection(
  hubId: string, tenantId: string, connectionId: string, connectorId: string,
): Promise<FloConnectionDoc> {
  const snap = await db
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
    .collection(HUB_COLLECTIONS.FLO_CONNECTIONS).doc(connectionId)
    .get();

  if (!snap.exists) {
    throw new FloActionAuthError(
      `FloConnection "${connectionId}" not found`,
      { actionId: '', connectionId, connectorId },
    );
  }

  const conn = { id: snap.id, ...snap.data() } as FloConnectionDoc;
  if (!conn.isActive) {
    throw new FloActionAuthError(
      `FloConnection "${connectionId}" is inactive`,
      { actionId: '', connectionId, connectorId },
    );
  }
  if (conn.connectorId && conn.connectorId !== connectorId) {
    throw new FloActionAuthError(
      `FloConnection connectorId mismatch: expected ${connectorId}, got ${conn.connectorId}`,
      { actionId: '', connectionId, connectorId },
    );
  }
  return conn;
}

async function loadAuthProtocol(authProtocolName: string): Promise<AuthProtocol> {
  const snap = await db
    .collection(COLLECTIONS.GLOBAL_SETTINGS)
    .doc(SUB_COLLECTIONS.AUTH_TYPES)
    .get();
  const protocols = (snap.data()?.authProtocols ?? snap.data()?.authTypes ?? []) as AuthProtocol[];
  const protocol  = protocols.find(p => p.name === authProtocolName);
  if (!protocol) {
    throw new Error(`Auth protocol not found: ${authProtocolName}`);
  }
  return protocol;
}

async function loadConnectorDoc(connectorId: string): Promise<ConnectorDoc> {
  const snap = await db.doc(`${COLLECTIONS.CONNECTORS}/${connectorId}`).get();
  if (!snap.exists) throw new Error(`Connector not found: ${connectorId}`);
  return { id: snap.id, ...snap.data() } as ConnectorDoc;
}

function mergeProtocolWithConnector(
  protocol: AuthProtocol,
  connector: ConnectorDoc,
): AuthProtocol {
  const override = connector.authOverride;
  if (!override) return protocol;
  return {
    ...protocol,
    grantType: protocol.grantType ?? override.grantType,
    runtimeConfig: {
      ...(protocol.runtimeConfig ?? {}),
      ...(override.grantType ? { grantType: override.grantType } : {}),
    },
  };
}

function buildUrl(hostname: string, endpoint: string, queryParam?: Record<string, string>): string {
  const base = hostname.replace(/\/$/, '');
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  let url    = `${base}${path}`;
  if (queryParam && Object.keys(queryParam).length > 0) {
    const qs = new URLSearchParams(queryParam).toString();
    url += (url.includes('?') ? '&' : '?') + qs;
  }
  return url;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  ctx: FloActionErrorContext,
): Promise<Response> {
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok || res.status < 500) return res;
      lastErr = new FloActionNetworkError(
        `HTTP ${res.status} from connector endpoint`,
        ctx,
        res.status,
      );
    } catch (err) {
      clearTimeout(timer);
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
    if (attempt < MAX_RETRIES - 1) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
    }
  }

  throw new FloActionNetworkError(
    lastErr?.message ?? 'Network request failed after retries',
    ctx,
  );
}

/** Primary mapping input — unwrap cStream.message when using cStream source. */
function primaryMappingStore(
  cStream: Record<string, unknown>,
  localStore: Record<string, unknown>,
  globalStore: Record<string, unknown>,
): { cStream: Record<string, unknown>; localStore: Record<string, unknown>; globalStore: Record<string, unknown> } {
  const msg = getMessage(cStream);
  const payload = (msg !== null && typeof msg === 'object' && !Array.isArray(msg))
    ? msg as Record<string, unknown>
    : { value: msg };
  return { cStream: payload, localStore, globalStore };
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (lower === 'authorization' || lower.includes('api-key') || lower.includes('token')) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function executeFloActionCore(
  input: ExecuteFloActionInput,
): Promise<ExecuteFloActionResult> {
  const startMs = Date.now();
  const ctx     = errorContext(input);
  const wantDebug = input.debug === true || input.dryRun === true;

  let actionDoc = await loadActionDocWithSchema({
    connectorId: input.connectorId,
    actionId:    input.actionId,
    floKitId:    input.floKitId,
  });

  if (input.floKitId) {
    try {
      const target = await resolveFloActionMappingTarget(
        input.connectorId,
        input.floKitId,
        input.actionId,
      );
      if (target.fields.length > 0) {
        actionDoc = { ...actionDoc, inputSchema: target.fields };
      }
    } catch (err) {
      console.warn(`[executeFloAction] kit mapping target fallback: ${err}`);
    }
  }

  const connection  = await loadFloConnection(
    input.hubId, input.tenantId, input.connectionId, input.connectorId,
  );
  const credentials = connection.credentials as PlugCredentialValues;
  if (!credentials || Object.keys(credentials).length === 0) {
    throw new FloActionAuthError(
      `FloConnection "${input.connectionId}" has no credentials configured`,
      ctx,
    );
  }

  const connector     = await loadConnectorDoc(input.connectorId);
  const baseProtocol  = await loadAuthProtocol(connection.authProtocol);
  const protocol      = mergeProtocolWithConnector(baseProtocol, connector);

  const stores = primaryMappingStore(input.cStream, input.localStore, input.globalStore);

  const { resolved, unmappedRequired, unmappedFields } = resolveFieldMappings({
    inputSchema:  actionDoc.inputSchema ?? [],
    cStream:      stores.cStream,
    localStore:   stores.localStore,
    globalStore:  stores.globalStore,
    mappingRules: input.mappingRules,
  });

  const requestBodyInner = buildRequestBody(actionDoc, resolved);
  const validationWouldFail = unmappedRequired.length > 0;

  if (validationWouldFail && !input.dryRun) {
    throw new FloActionValidationError(
      `Required fields could not be mapped: ${unmappedRequired.join(', ')}`,
      unmappedRequired,
      ctx,
    );
  }

  let authResult: Awaited<ReturnType<typeof applyAuth>>;
  try {
    authResult = await applyAuth(protocol, credentials);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new FloActionAuthError(`Authentication failed: ${msg}`, ctx);
  }

  const queryParam = (authResult as { queryParam?: Record<string, string> }).queryParam;
  const url        = buildUrl(connection.hostname ?? '', actionDoc.endpoint, queryParam);

  const headers: Record<string, string> = {
    ...authResult.headers,
    'Content-Type': actionDoc.contentType ?? 'application/json',
  };
  if (actionDoc.soapAction) {
    headers.SOAPAction = actionDoc.soapAction;
  }

  let body = requestBodyInner;
  if (authResult.soapEnvelope) {
    body = authResult.soapEnvelope(requestBodyInner);
  }

  const method = actionDoc.method ?? 'POST';

  const debugInfo: FloActionDebugInfo | undefined = wantDebug ? {
    resolved,
    requestBody:         body,
    requestBodyInner,
    url,
    method,
    contentType:         actionDoc.contentType ?? 'application/json',
    unmappedFields,
    unmappedRequired,
    mappedFieldCount:    Object.keys(resolved).length,
    schemaFieldCount:    actionDoc.inputSchema?.length ?? 0,
    headersSafe:         redactHeaders(headers),
    validationWouldFail,
  } : undefined;

  if (input.dryRun) {
    return {
      payload:       { _dryRun: true, _actionId: input.actionId },
      unmappedFields,
      executionMs:   Date.now() - startMs,
      _actionStatus: validationWouldFail ? 'error' : 'success',
      debug:         debugInfo,
    };
  }

  const init: RequestInit = {
    method,
    headers,
    ...(method !== 'GET' ? { body } : {}),
  };

  console.log(`[executeFloAction] ${method} ${url} action=${input.actionId} conn=${input.connectionId}`);

  const response = await fetchWithRetry(url, init, ctx);
  const responseText = await response.text();

  if (!response.ok) {
    console.error(`[executeFloAction] Error response (${response.status}): ${responseText.slice(0, 500)}`);
    throw new FloActionNetworkError(
      `Connector request failed with status ${response.status}`,
      ctx,
      response.status,
    );
  }

  const contentType = response.headers.get('content-type') ?? actionDoc.contentType ?? 'application/json';
  const payload     = parseActionResponse(responseText, actionDoc, contentType, ctx);

  return {
    payload,
    unmappedFields,
    executionMs: Date.now() - startMs,
    _actionStatus: 'success',
    debug: debugInfo,
  };
}
