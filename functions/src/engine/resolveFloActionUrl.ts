/**
 * Build outbound URL for FloAction — connector urlTokens (primary), then legacy plug pattern / kit fallback.
 */

import { getFirestore } from 'firebase-admin/firestore';
import type {
  ActionDoc, ConnectorDoc, ConnectorSchema, FloConnectionDoc, FloKitDoc, PlugVariableBinding,
} from '@floplug/shared';
import {
  COLLECTIONS, HUB_COLLECTIONS, SUB_COLLECTIONS,
  isConnectionBackedPlugUrlVar,
  resolveConnectorUrlMode,
  connectorUrlModeRequiresTokens,
} from '@floplug/shared';
import { resolveUrl, type ValueBinding } from './resolveValue.js';
import { loadSchemaDoc } from './loadSchemaFlattenIndex.js';
import {
  kitUrlContextFromKit,
  resolveConnectorTokenUrl,
  buildPlugSegmentValues,
  floActionNodeTokensFromConnectorDoc,
} from './resolveConnectorUrlRuntime.js';

const db = getFirestore();

export function normalizeHttpBase(hostOrUrl: string): string {
  const trimmed = hostOrUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isPlaceholderEndpoint(endpoint: string): boolean {
  const ep = endpoint.trim();
  return !ep || ep === '/';
}

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

async function loadConnector(connectorId: string): Promise<ConnectorDoc | null> {
  const snap = await db.doc(`${COLLECTIONS.CONNECTORS}/${connectorId}`).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as ConnectorDoc;
}

async function loadKit(connectorId: string, floKitId: string): Promise<FloKitDoc | null> {
  const snap = await db
    .doc(`${COLLECTIONS.CONNECTORS}/${connectorId}/${SUB_COLLECTIONS.FLOKITS}/${floKitId}`)
    .get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as FloKitDoc;
}

async function loadKitSchema(connectorId: string, kit: FloKitDoc): Promise<ConnectorSchema | null> {
  const servicesSchemaId = kit.servicesSchemaId ?? kit.wsdlSchemaId ?? kit.schemaId ?? '';
  if (!servicesSchemaId) return null;
  const schemaRaw = await loadSchemaDoc(connectorId, servicesSchemaId);
  return schemaRaw ? schemaRaw as unknown as ConnectorSchema : null;
}

async function loadHubFloActionNode(
  hubId: string,
  tenantId: string,
  floKitId: string,
): Promise<Record<string, unknown> | null> {
  const snap = await db
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
    .collection(HUB_COLLECTIONS.FLOACTIONNODES)
    .doc(`flan_${floKitId}`)
    .get();
  if (!snap.exists) return null;
  return snap.data() as Record<string, unknown>;
}

async function loadHubPlugSegmentValues(
  hubId: string,
  tenantId: string,
  connectorId: string,
  connectionId: string,
): Promise<Record<string, string>> {
  if (!connectionId) return {};
  const snap = await db
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
    .collection(HUB_COLLECTIONS.PLUGS)
    .where('connectorId', '==', connectorId)
    .where('isActive', '==', true)
    .limit(8)
    .get();

  for (const doc of snap.docs) {
    const byConn = doc.data().plugUrlValuesByConnection as Record<string, Record<string, string>> | undefined;
    if (byConn?.[connectionId]) return byConn[connectionId];
  }
  return {};
}

async function loadHubPlugUrlPattern(
  hubId: string,
  tenantId: string,
  connectorId: string,
): Promise<{ urlPattern: string; urlVariables: Record<string, PlugVariableBinding>; variableHints: { name: string; defaultValue?: string }[] } | null> {
  const snap = await db
    .collection(COLLECTIONS.HUBS).doc(hubId)
    .collection(HUB_COLLECTIONS.TENANTS).doc(tenantId)
    .collection(HUB_COLLECTIONS.PLUGS)
    .where('connectorId', '==', connectorId)
    .where('isActive', '==', true)
    .limit(8)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data();
    const urlPattern = String(data.urlPattern ?? '').trim();
    if (!urlPattern) continue;
    if (urlPattern.includes('{{hostname}}') || urlPattern.includes('ccx/service') || urlPattern.startsWith('http')) {
      return {
        urlPattern,
        urlVariables: (data.urlVariables ?? {}) as Record<string, PlugVariableBinding>,
        variableHints: (data.variableHints ?? []) as { name: string; defaultValue?: string }[],
      };
    }
  }
  return null;
}

function resolvePlugStyleUrl(
  urlPattern: string,
  urlVariables: Record<string, PlugVariableBinding>,
  variableHints: { name: string; defaultValue?: string }[],
  connection: FloConnectionDoc,
): string {
  const mergedVariables: Record<string, ValueBinding> = {};
  for (const hint of variableHints) {
    if (hint.defaultValue) {
      mergedVariables[hint.name] = { source: 'static', value: hint.defaultValue };
    }
  }
  for (const [key, binding] of Object.entries(urlVariables)) {
    if (binding?.value && !isConnectionBackedPlugUrlVar(key)) {
      mergedVariables[key] = binding as ValueBinding;
    }
  }
  applyConnectionUrlBindings(mergedVariables, connection);
  return resolveUrl(urlPattern, mergedVariables, {
    cStream: {},
    store: { local: {}, global: {} },
  });
}

function joinBaseAndPath(base: string, endpoint: string): string {
  const normalizedBase = normalizeHttpBase(base).replace(/\/+$/, '');
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${normalizedBase}${path}`;
}

/**
 * Resolve the full HTTP URL for a FloAction call.
 * Primary: connector urlTokens. Fallback: hub plug urlPattern, then kit/schema path.
 */
export async function resolveFloActionRequestUrl(input: {
  hubId:       string;
  tenantId:    string;
  connectorId: string;
  floKitId?:   string;
  connection:  FloConnectionDoc;
  actionDoc:   ActionDoc;
  connector?:  ConnectorDoc | null;
  urlVariables?: Record<string, PlugVariableBinding>;
}): Promise<string> {
  const { hubId, tenantId, connectorId, floKitId, connection, actionDoc, urlVariables } = input;
  const endpoint = String(actionDoc.endpoint ?? '').trim();

  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }

  const connector = input.connector ?? await loadConnector(connectorId);
  const urlMode   = resolveConnectorUrlMode(connector ?? {});

  if (connectorUrlModeRequiresTokens(urlMode) && connector?.urlTokens?.length) {
    let kit: FloKitDoc | null = null;
    let schema: ConnectorSchema | null = null;
    if (floKitId) {
      kit = await loadKit(connectorId, floKitId);
      if (kit) schema = await loadKitSchema(connectorId, kit);
    }

    const connId = (connection as { id?: string }).id ?? '';
    const plugValues = await loadHubPlugSegmentValues(hubId, tenantId, connectorId, connId);
    const hubFloAction = floKitId ? await loadHubFloActionNode(hubId, tenantId, floKitId) : null;
    const floActionHubValues = (hubFloAction?.floActionUrlValuesByConnection as Record<string, Record<string, string>> | undefined)?.[connId] ?? {};
    const floActionNodeValues = buildPlugSegmentValues(
      floActionNodeTokensFromConnectorDoc(connector),
      Object.fromEntries(
        Object.entries(urlVariables ?? {}).filter(([, b]) => b?.value).map(([k, b]) => [k, b as ValueBinding]),
      ),
      { cStream: {}, store: { local: {}, global: {} } },
    );
    const floActionValues = { ...floActionHubValues, ...floActionNodeValues };

    const tokenUrl = resolveConnectorTokenUrl({
      connector,
      connection,
      kit,
      schema,
      plugValues,
      floActionValues,
      endpoint: isPlaceholderEndpoint(endpoint) ? undefined : endpoint,
    });
    if (tokenUrl) return tokenUrl;
  }

  if (!isPlaceholderEndpoint(endpoint) && endpoint.includes('ccx/service')) {
    const host = connection.hostname?.trim() ?? connection.baseUrl?.trim() ?? '';
    if (host) return joinBaseAndPath(host, endpoint);
  }

  const plugTemplate = await loadHubPlugUrlPattern(hubId, tenantId, connectorId);
  if (plugTemplate) {
    const url = resolvePlugStyleUrl(
      plugTemplate.urlPattern,
      plugTemplate.urlVariables,
      plugTemplate.variableHints,
      connection,
    );
    if (url && /^https?:\/\//i.test(url)) {
      if (!isPlaceholderEndpoint(endpoint)) return joinBaseAndPath(url.replace(/\/+$/, ''), endpoint);
      return url;
    }
  }

  if (floKitId) {
    const kit = await loadKit(connectorId, floKitId);
    if (kit) {
      const schema = await loadKitSchema(connectorId, kit);
      const ctx = kitUrlContextFromKit(kit, schema);
      const host = connection.hostname?.trim() ?? connection.baseUrl?.trim();
      const tenant = connection.tenantKey?.trim();
      const module = ctx.serviceModule
        ?? (ctx.schemaLabel ? ctx.schemaLabel.replace(/\s+v?\d+(\.\d+)*\s*$/i, '').trim().replace(/\s+/g, '_') : '');
      const version = ctx.serviceVersion ?? ctx.schemaVersion;
      if (host && tenant && module && version) {
        const base = `${normalizeHttpBase(host)}/ccx/service/${tenant}/${module}/${version}`;
        if (isPlaceholderEndpoint(endpoint)) return base;
        return joinBaseAndPath(base, endpoint);
      }
    }
  }

  if (!isPlaceholderEndpoint(endpoint)) {
    const host = connection.hostname?.trim() ?? connection.baseUrl?.trim() ?? '';
    if (host) return joinBaseAndPath(host, endpoint);
  }

  if (urlMode === 'none') {
    throw new Error(
      `Connector "${connectorId}" does not use HTTP service URLs (urlMode: none).`,
    );
  }

  throw new Error(
    `Cannot build FloAction URL for "${actionDoc.id}": configure connector URL segments in Connector Registry ` +
    `(connection, kit, and plug values at their respective admin screens).`,
  );
}
