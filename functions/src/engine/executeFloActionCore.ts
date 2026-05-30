/**
 * Server-side FloAction execution — auth, HTTP, mapping, response parse.
 * Used by executeFloAction Cloud Function and executeFloActionNode (in-process).
 */

import { getFirestore } from 'firebase-admin/firestore';
import type {
  AuthProtocol, ConnectorDoc, FloConnectionDoc, PlugCredentialValues, PlugVariableBinding, NodeHttpTrace,
} from '@floplug/shared';
import { COLLECTIONS, HUB_COLLECTIONS, SUB_COLLECTIONS, redactSecretHeaders } from '@floplug/shared';
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
  type FloActionDebugInfo,
} from './floActionErrors.js';
import { getMessage } from './resolveValue.js';
import { resolveFloActionRequestUrl } from './resolveFloActionUrl.js';
import { getValue } from '../utils/pathUtils.js';

const db = getFirestore();

const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES      = 3;

function detectMappingInputMismatch(
  cStream: Record<string, unknown>,
  mappingRules: MappingRule[] | undefined,
): string | undefined {
  const rules = mappingRules ?? [];
  const jsonPathRules = rules.filter(
    r => r.sourceType === 'cStream' && r.sourceField && r.sourceField !== 'value',
  );
  if (jsonPathRules.length === 0) return undefined;

  const isWrappedScalar = Object.keys(cStream).length === 1 && 'value' in cStream;
  const scalar = isWrappedScalar ? cStream.value : undefined;
  if (typeof scalar === 'string') {
    const trimmed = scalar.trim();
    if (trimmed.startsWith('<') || trimmed.startsWith('<?xml')) {
      return (
        'cStream input is XML/text from an upstream node, but mapping rules expect JSON paths ' +
        `(e.g. ${jsonPathRules[0]?.sourceField}). ` +
        'Add a Variable Store node before template/plug nodes to preserve the JSON payload, ' +
        'then set FloAction Input Source to local or global.'
      );
    }
  }

  for (const rule of jsonPathRules) {
    const val = rule.sourceField ? getValue(cStream, rule.sourceField) : undefined;
    if (val !== undefined && val !== null) return undefined;
  }

  if (Object.keys(cStream).length > 0 && jsonPathRules.length > 0) {
    const sample = jsonPathRules[0]?.sourceField ?? '';
    const topKeys = Object.keys(cStream).slice(0, 6).join(', ');
    return (
      `Mapping source "${sample}" not found in FloAction input. ` +
      `Available top-level keys: ${topKeys || '(none)'}. ` +
      'If upstream nodes replaced JSON with XML, store the JSON in a Variable Store and point Input Source to that variable.'
    );
  }

  return undefined;
}

export type { FloActionDebugInfo };

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
  /** Canvas URL segment bindings (floActionNode-classified tokens) */
  urlVariables?: Record<string, { source: string; value: string }>;
  floRunMeta?:   Readonly<import('@floplug/shared').FloRunMeta>;
}

export interface ExecuteFloActionResult {
  payload:         Record<string, unknown>;
  unmappedFields:  string[];
  executionMs:     number;
  _actionStatus:   'success' | 'error';
  debug?:          FloActionDebugInfo;
  httpTrace?:      NodeHttpTrace;
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

function appendQueryParams(url: string, queryParam?: Record<string, string>): string {
  if (!queryParam || Object.keys(queryParam).length === 0) return url;
  const qs = new URLSearchParams(queryParam).toString();
  return url + (url.includes('?') ? '&' : '?') + qs;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  ctx: FloActionErrorContext,
): Promise<Response> {
  let lastNetworkErr: FloActionNetworkError | Error | null = null;
  /** Return final 5xx response so caller can attach full httpTrace (do not throw early). */
  let last5xx: Response | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      if (res.status < 500) return res;
      last5xx = res;
    } catch (err) {
      clearTimeout(timer);
      const raw = err instanceof Error ? err.message : String(err);
      if (/failed to parse url/i.test(raw)) {
        lastNetworkErr = new FloActionNetworkError(
          `Invalid FloAction request URL "${url}" — connection hostname must include https:// or a hub plug urlPattern must be configured. (${raw})`,
          ctx,
        );
      } else {
        lastNetworkErr = err instanceof Error ? err : new Error(String(err));
      }
    }
    if (attempt < MAX_RETRIES - 1) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
    }
  }

  if (last5xx) return last5xx;

  throw new FloActionNetworkError(
    lastNetworkErr?.message ?? 'Network request failed after retries',
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

  if (!actionDoc.contentType) {
    if (actionDoc.schemaSource === 'wsdl') {
      actionDoc = { ...actionDoc, contentType: 'text/xml' };
    } else if (actionDoc.schemaSource === 'openapi' || actionDoc.schemaSource === 'graphql') {
      actionDoc = { ...actionDoc, contentType: 'application/json' };
    }
  }
  if (!actionDoc.soapAction && actionDoc.schemaSource === 'wsdl' && actionDoc.operationName) {
    actionDoc = {
      ...actionDoc,
      soapAction: `urn:com.workday/bsvc/${actionDoc.operationName}`,
    };
  }

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
    floRunMeta:   input.floRunMeta,
    /** Production: never server-side guess mappings — explicit rules only */
    explicitRulesOnly: true,
  });

  const requestBodyInner = buildRequestBody(actionDoc, resolved);
  const validationWouldFail = unmappedRequired.length > 0;
  const inputHint = detectMappingInputMismatch(stores.cStream, input.mappingRules);

  const debugInfo: FloActionDebugInfo | undefined = wantDebug || validationWouldFail ? {
    resolved,
    requestBody:         requestBodyInner,
    requestBodyInner,
    url:                 '',
    method:              actionDoc.method ?? 'POST',
    contentType:         actionDoc.contentType ?? 'application/json',
    unmappedFields,
    unmappedRequired,
    mappedFieldCount:    Object.keys(resolved).length,
    schemaFieldCount:    actionDoc.inputSchema?.length ?? 0,
    headersSafe:         {},
    validationWouldFail,
  } : undefined;

  if (validationWouldFail && !input.dryRun) {
    const hint = inputHint ? ` ${inputHint}` : '';
    throw new FloActionValidationError(
      `Required fields could not be mapped: ${unmappedRequired.join(', ')}.${hint}`,
      unmappedRequired,
      ctx,
      { debug: debugInfo, inputHint: inputHint ?? undefined },
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
  const baseUrl    = await resolveFloActionRequestUrl({
    hubId:       input.hubId,
    tenantId:    input.tenantId,
    connectorId: input.connectorId,
    floKitId:    input.floKitId,
    connection,
    actionDoc,
    connector,
    urlVariables: input.urlVariables as Record<string, PlugVariableBinding> | undefined,
  });
  const url        = appendQueryParams(baseUrl, queryParam);

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

  if (debugInfo) {
    debugInfo.url = url;
    debugInfo.requestBody = body;
    debugInfo.headersSafe = redactSecretHeaders(headers);
  }

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
  const responseContentType = response.headers.get('content-type')
    ?? actionDoc.contentType ?? 'application/json';

  const httpTrace: NodeHttpTrace = {
    method,
    url,
    requestHeaders: redactSecretHeaders(headers),
    requestBody:    body,
    status:         response.status,
    statusText:     response.statusText,
    responseBody:   responseText,
    responseContentType,
  };

  if (!response.ok) {
    const snippet = responseText.replace(/\s+/g, ' ').slice(0, 240);
    const netErr = new FloActionNetworkError(
      `Connector HTTP ${response.status} ${response.statusText}: ${method} ${url}` +
      (snippet ? ` — ${snippet}` : ''),
      ctx,
      response.status,
    ) as FloActionNetworkError & { httpTrace?: NodeHttpTrace };
    netErr.httpTrace = httpTrace;
    console.error(
      `[executeFloAction] ${method} ${url} conn=${input.connectionId} ` +
      `status=${response.status} body=${responseText.slice(0, 500)}`,
    );
    throw netErr;
  }

  const contentType = responseContentType;
  const payload     = parseActionResponse(responseText, actionDoc, contentType, ctx);

  return {
    payload,
    unmappedFields,
    executionMs: Date.now() - startMs,
    _actionStatus: 'success',
    debug: debugInfo,
    httpTrace,
  };
}
