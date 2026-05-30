/**
 * Pure helpers to migrate legacy connector URL tokens (hostname, path, …)
 * to generic urlToken1, urlToken2, … without recreating connector auth config.
 */

import type { ConnectorUrlToken, ConnectorUrlTokenSource } from './connectorUrlTokens.js';
import {
  assembleConnectorUrl,
  deriveWorkdayModuleName,
  normalizeWorkdayVersion,
  plugNodeTokensForConnector,
  floActionNodeTokensForConnector,
  type ConnectionUrlFields,
  type KitUrlContext,
} from './connectorUrlTokens.js';

export interface TokenKeyMigration {
  source:   ConnectorUrlTokenSource;
  oldKey:   string;
  newKey:   string;
  oldField?: string;
}

export interface ConnectorUrlMigrationPlan {
  connectorId:       string;
  alreadyMigrated: boolean;
  newTokens:         ConnectorUrlToken[];
  urlPatternPreview: string;
  keyMigrations:     TokenKeyMigration[];
}

export interface MigrationStats {
  connectors:     number;
  floKits:        number;
  floConnections: number;
  plugs:          number;
  floActionNodes: number;
  flos:           number;
  floVersions:    number;
  skipped:        number;
}

export function isGenericUrlTokenKey(key: string): boolean {
  return /^urlToken\d+$/i.test(key.trim());
}

/** True when every non-static token already uses urlTokenN keys. */
export function connectorTokensAlreadyMigrated(tokens: ConnectorUrlToken[] = []): boolean {
  const dynamic = tokens.filter(t => t.source !== 'static');
  if (dynamic.length === 0) return false;
  return dynamic.every(t => isGenericUrlTokenKey(t.key));
}

function lookupAliases(m: TokenKeyMigration): string[] {
  const aliases = new Set<string>();
  if (m.oldKey?.trim()) aliases.add(m.oldKey.trim());
  if (m.oldField?.trim()) aliases.add(m.oldField.trim());
  return [...aliases];
}

/** Build migration plan for one connector's urlTokens array. */
export function planConnectorUrlTokenMigration(input: {
  connectorId: string;
  urlTokens?: ConnectorUrlToken[];
}): ConnectorUrlMigrationPlan {
  const tokens = (input.urlTokens ?? []).map(t => ({ ...t }));
  const alreadyMigrated = connectorTokensAlreadyMigrated(tokens);

  if (alreadyMigrated) {
    return {
      connectorId:       input.connectorId,
      alreadyMigrated:   true,
      newTokens:         tokens,
      urlPatternPreview: assembleConnectorUrl(tokens, {}, true),
      keyMigrations:     tokens
        .filter(t => t.source !== 'static')
        .map(t => ({
          source:   t.source,
          oldKey:   t.key,
          newKey:   t.key,
          oldField: t.field,
        })),
    };
  }

  const keyMigrations: TokenKeyMigration[] = [];
  let n = 0;
  const newTokens = tokens.map(t => {
    if (t.source === 'static') return { ...t };
    n += 1;
    const newKey = `urlToken${n}`;
    keyMigrations.push({
      source:   t.source,
      oldKey:   t.key?.trim() || t.field?.trim() || newKey,
      newKey,
      oldField: t.field,
    });
    const normalizedSources = t.sources?.length ? t.sources : [t.source];
    return {
      ...t,
      key:   newKey,
      field: newKey,
      sources: normalizedSources,
      source: normalizedSources[0] ?? t.source,
    };
  });

  return {
    connectorId:       input.connectorId,
    alreadyMigrated:   false,
    newTokens,
    urlPatternPreview: assembleConnectorUrl(newTokens, {}, true),
    keyMigrations,
  };
}

/** Remap flat string map (plug/floAction values) for one token source. */
export function remapUrlValueMap(
  values: Record<string, string> | undefined,
  migrations: TokenKeyMigration[],
  source: ConnectorUrlTokenSource,
): Record<string, string> {
  if (!values) return {};
  const out: Record<string, string> = {};
  const relevant = migrations.filter(m => m.source === source);

  for (const m of relevant) {
    let val = '';
    for (const alias of lookupAliases(m)) {
      if (values[alias]?.trim()) {
        val = values[alias].trim();
        break;
      }
    }
    if (!val && values[m.newKey]?.trim()) val = values[m.newKey].trim();
    if (val) out[m.newKey] = val;
  }

  for (const [k, v] of Object.entries(values)) {
    if (!v?.trim()) continue;
    if (relevant.some(m => m.newKey === k)) continue;
    if (relevant.some(m => lookupAliases(m).includes(k))) continue;
    out[k] = v.trim();
  }
  return out;
}

/** Remap connectionId → token values maps (hub plug / FloAction admin values). */
export function remapUrlValuesByConnection(
  byConnection: Record<string, Record<string, string>> | undefined,
  migrations: TokenKeyMigration[],
  source: ConnectorUrlTokenSource,
): Record<string, Record<string, string>> {
  if (!byConnection) return {};
  const out: Record<string, Record<string, string>> = {};
  for (const [connId, vals] of Object.entries(byConnection)) {
    const remapped = remapUrlValueMap(vals, migrations, source);
    if (Object.keys(remapped).length > 0) out[connId] = remapped;
  }
  return out;
}

function legacyConnectionValue(conn: ConnectionUrlFields, field: string): string {
  if (field === 'hostname' || field === 'host') return conn.hostname?.trim() ?? '';
  if (field === 'tenantKey' || field === 'tenant') return conn.tenantKey?.trim() ?? '';
  if (field === 'baseUrl' || field === 'url') return conn.baseUrl?.trim() ?? '';
  return conn.urlTokenValues?.[field]?.trim() ?? '';
}

function legacyKitValue(kit: KitUrlContext, field: string): string {
  if (field === 'serviceModule' || field === 'module') {
    return kit.serviceModule?.trim()
      || (kit.schemaLabel ? deriveWorkdayModuleName(kit.schemaLabel) : '');
  }
  if (field === 'serviceVersion' || field === 'version') {
    return kit.serviceVersion?.trim()
      || normalizeWorkdayVersion(kit.schemaVersion)
      || '';
  }
  return kit.urlTokenValues?.[field]?.trim() ?? '';
}

const CONNECTION_LEGACY_BY_ORDINAL = ['hostname', 'tenantKey', 'baseUrl'] as const;
const KIT_LEGACY_BY_ORDINAL = ['serviceModule', 'serviceVersion'] as const;

/** Populate urlTokenValues on a FloConnection from legacy fields + old keys. */
export function migrateConnectionUrlValues(
  conn: ConnectionUrlFields,
  migrations: TokenKeyMigration[],
): Record<string, string> {
  const out: Record<string, string> = { ...(conn.urlTokenValues ?? {}) };
  const connectionMigrations = migrations.filter(x => x.source === 'connection');
  connectionMigrations.forEach((m, index) => {
    if (out[m.newKey]?.trim()) return;
    let val = '';
    for (const alias of lookupAliases(m)) {
      if (conn.urlTokenValues?.[alias]?.trim()) {
        val = conn.urlTokenValues[alias].trim();
        break;
      }
      const leg = legacyConnectionValue(conn, alias);
      if (leg) { val = leg; break; }
    }
    if (!val && index < CONNECTION_LEGACY_BY_ORDINAL.length) {
      val = legacyConnectionValue(conn, CONNECTION_LEGACY_BY_ORDINAL[index]);
    }
    if (val) out[m.newKey] = val;
  });
  return out;
}

/** Populate urlTokenValues on a FloKit from legacy fields + old keys. */
export function migrateKitUrlValues(
  kit: KitUrlContext,
  migrations: TokenKeyMigration[],
): Record<string, string> {
  const out: Record<string, string> = { ...(kit.urlTokenValues ?? {}) };
  const kitMigrations = migrations.filter(x => x.source === 'kit');
  kitMigrations.forEach((m, index) => {
    if (out[m.newKey]?.trim()) return;
    let val = '';
    for (const alias of lookupAliases(m)) {
      if (kit.urlTokenValues?.[alias]?.trim()) {
        val = kit.urlTokenValues[alias].trim();
        break;
      }
      const leg = legacyKitValue(kit, alias);
      if (leg) { val = leg; break; }
    }
    if (!val && index < KIT_LEGACY_BY_ORDINAL.length) {
      val = legacyKitValue(kit, KIT_LEGACY_BY_ORDINAL[index]);
    }
    if (val) out[m.newKey] = val;
  });
  return out;
}

export interface UrlVariableBinding {
  source: string;
  value:  string;
}

/** Remap canvas urlVariables / url bindings keyed by token key. */
export function remapUrlVariableBindings(
  bindings: Record<string, UrlVariableBinding> | undefined,
  migrations: TokenKeyMigration[],
  sources: ConnectorUrlTokenSource[],
): Record<string, UrlVariableBinding> {
  if (!bindings) return {};
  const relevant = migrations.filter(m => sources.includes(m.source));
  const out: Record<string, UrlVariableBinding> = {};

  for (const m of relevant) {
    let binding: UrlVariableBinding | undefined;
    for (const alias of lookupAliases(m)) {
      if (bindings[alias]?.value?.trim()) {
        binding = bindings[alias];
        break;
      }
    }
    if (!binding && bindings[m.newKey]?.value?.trim()) binding = bindings[m.newKey];
    if (binding) out[m.newKey] = binding;
  }

  for (const [k, b] of Object.entries(bindings)) {
    if (relevant.some(m => m.newKey === k)) continue;
    if (relevant.some(m => lookupAliases(m).includes(k))) continue;
    out[k] = b;
  }
  return out;
}

export function tokenDefsFromConnectorTokens(
  tokens: ConnectorUrlToken[],
  source: ConnectorUrlTokenSource,
): { key: string; label?: string; description?: string; field?: string }[] {
  const list = source === 'plugNode'
    ? plugNodeTokensForConnector({ urlTokens: tokens })
    : source === 'floActionNode'
      ? floActionNodeTokensForConnector({ urlTokens: tokens })
      : tokens.filter(t => t.source === source);
  return list.map(t => ({
    key:         t.key,
    label:       t.label,
    description: t.description,
    field:       t.field,
  }));
}

export interface CanvasNodeMigrationInput {
  node: Record<string, unknown>;
  connectorId: string;
  plan: ConnectorUrlMigrationPlan;
  /** plugId → connectorId for plugNode matching */
  plugConnectorById?: Record<string, string>;
}

/** Migrate URL-related fields on a designer canvas node (plugNode / floActionNode). */
export function migrateCanvasNodeData(input: CanvasNodeMigrationInput): {
  node: Record<string, unknown>;
  changed: boolean;
} {
  const { node, connectorId, plan, plugConnectorById = {} } = input;
  const type = String(node.type ?? '');
  const data = { ...(node.data as Record<string, unknown> ?? {}) };
  let changed = false;

  const touch = (patch: Record<string, unknown>) => {
    Object.assign(data, patch);
    changed = true;
  };

  if (type === 'plugNode') {
    const plugId = String(data.plugId ?? '');
    const plugConnector = plugConnectorById[plugId];
    if (plugConnector && plugConnector !== connectorId) {
      return { node, changed: false };
    }
    const urlVars = remapUrlVariableBindings(
      data.urlVariables as Record<string, UrlVariableBinding> | undefined,
      plan.keyMigrations,
      ['plugNode'],
    );
    if (JSON.stringify(urlVars) !== JSON.stringify(data.urlVariables ?? {})) {
      touch({ urlVariables: urlVars });
    }
    const plugUrlByConn = remapUrlValuesByConnection(
      data.plugUrlValuesByConnection as Record<string, Record<string, string>> | undefined,
      plan.keyMigrations,
      'plug',
    );
    if (JSON.stringify(plugUrlByConn) !== JSON.stringify(data.plugUrlValuesByConnection ?? {})) {
      touch({ plugUrlValuesByConnection: plugUrlByConn });
    }
    const plugNodeDefs = tokenDefsFromConnectorTokens(plan.newTokens, 'plugNode');
    if (JSON.stringify(plugNodeDefs) !== JSON.stringify(data.plugNodeUrlTokens ?? [])) {
      touch({ plugNodeUrlTokens: plugNodeDefs });
    }
    if (JSON.stringify(plan.newTokens) !== JSON.stringify(data.urlTokensSnapshot ?? [])) {
      touch({ urlTokensSnapshot: plan.newTokens });
    }
  }

  if (type === 'floActionNode') {
    if (String(data.connectorId ?? '') !== connectorId) {
      return { node, changed: false };
    }
    const urlVars = remapUrlVariableBindings(
      data.urlVariables as Record<string, UrlVariableBinding> | undefined,
      plan.keyMigrations,
      ['floActionNode'],
    );
    if (JSON.stringify(urlVars) !== JSON.stringify(data.urlVariables ?? {})) {
      touch({ urlVariables: urlVars });
    }
    const floActionByConn = remapUrlValuesByConnection(
      data.floActionUrlValuesByConnection as Record<string, Record<string, string>> | undefined,
      plan.keyMigrations,
      'floAction',
    );
    if (JSON.stringify(floActionByConn) !== JSON.stringify(data.floActionUrlValuesByConnection ?? {})) {
      touch({ floActionUrlValuesByConnection: floActionByConn });
    }
    const floActionNodeDefs = tokenDefsFromConnectorTokens(plan.newTokens, 'floActionNode');
    if (JSON.stringify(floActionNodeDefs) !== JSON.stringify(data.floActionNodeUrlTokens ?? [])) {
      touch({ floActionNodeUrlTokens: floActionNodeDefs });
    }
    if (JSON.stringify(plan.newTokens) !== JSON.stringify(data.urlTokensSnapshot ?? [])) {
      touch({ urlTokensSnapshot: plan.newTokens });
    }
  }

  if (!changed) return { node, changed: false };
  return { node: { ...node, data }, changed: true };
}

/** Migrate an array of canvas nodes; returns new array if any node changed. */
export function migrateCanvasNodes(
  nodes: unknown[],
  input: Omit<CanvasNodeMigrationInput, 'node'>,
): { nodes: unknown[]; changed: boolean; changedCount: number } {
  let changedCount = 0;
  const next = nodes.map(raw => {
    const node = raw as Record<string, unknown>;
    const result = migrateCanvasNodeData({ ...input, node });
    if (result.changed) changedCount += 1;
    return result.node;
  });
  return { nodes: next, changed: changedCount > 0, changedCount };
}

export function emptyMigrationStats(): MigrationStats {
  return {
    connectors:     0,
    floKits:        0,
    floConnections: 0,
    plugs:          0,
    floActionNodes: 0,
    flos:           0,
    floVersions:    0,
    skipped:        0,
  };
}
