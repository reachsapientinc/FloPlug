/**
 * Runtime helpers — resolve connector urlTokens with live binding values.
 */

import type {
  ConnectorDoc,
  ConnectorUrlToken,
  FloConnectionDoc,
  FloKitDoc,
  ConnectorSchema,
  PlugVariableBinding,
} from '@floplug/shared';
import {
  resolveConnectorUrlMode,
  connectorUrlModeRequiresTokens,
  resolveUrlFromConnector,
  buildKitUrlValues,
  filterUrlTokensBySource,
  resolveKitServicesSchemaId,
} from '@floplug/shared';
import { resolveUrl, type ValueBinding } from './resolveValue.js';

function bindingToString(
  name: string,
  binding: ValueBinding | PlugVariableBinding | undefined,
  ctx: { cStream: Record<string, unknown>; store: { local: Record<string, unknown>; global: Record<string, unknown> } },
): string {
  if (!binding) return '';
  const vb = binding as ValueBinding;
  if (vb.source === 'static') return String(vb.value ?? '').trim();
  return resolveUrl(`{{${name}}}`, { [name]: vb }, ctx).trim();
}

/** Resolve plug segment values from canvas urlVariables + hints. */
export function buildPlugSegmentValues(
  plugTokens: ConnectorUrlToken[],
  mergedVariables: Record<string, ValueBinding>,
  ctx: { cStream: Record<string, unknown>; store: { local: Record<string, unknown>; global: Record<string, unknown> } },
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const token of plugTokens) {
    const field = token.field ?? token.key;
    const binding = mergedVariables[token.key] ?? mergedVariables[field];
    const val = bindingToString(token.key || field, binding, ctx);
    if (val) {
      out[token.key] = val;
      if (field) out[field] = val;
    }
  }
  return out;
}

export function kitUrlContextFromKit(
  kit: FloKitDoc,
  schema?: ConnectorSchema | null,
): Parameters<typeof buildKitUrlValues>[0] {
  return {
    serviceModule:  kit.serviceModule,
    serviceVersion: kit.serviceVersion,
    urlTokenValues: kit.urlTokenValues,
    schemaLabel:    schema?.label ?? schema?.id,
    schemaVersion:  kit.servicesSchemaVersion ?? kit.wsdlSchemaVersion ?? kit.schemaVersion ?? schema?.version,
  };
}

export function resolveConnectorTokenUrl(input: {
  connector:   ConnectorDoc | null | undefined;
  connection?: FloConnectionDoc;
  kit?:        FloKitDoc | null;
  schema?:     ConnectorSchema | null;
  plugValues?:      Record<string, string>;
  floActionValues?: Record<string, string>;
  endpoint?:        string;
}): string | null {
  const connector = input.connector;
  if (!connector) return null;

  const mode = resolveConnectorUrlMode(connector);
  if (!connectorUrlModeRequiresTokens(mode)) return null;

  return resolveUrlFromConnector({
    urlMode:    connector.urlMode,
    category:   connector.category,
    urlTokens:  connector.urlTokens,
    connection: input.connection,
    kit:        input.kit ? kitUrlContextFromKit(input.kit, input.schema) : undefined,
    plugValues: input.plugValues,
    floActionValues: input.floActionValues,
    endpoint:   input.endpoint,
  });
}

export function floActionTokensFromConnectorDoc(connector: ConnectorDoc | null | undefined): ConnectorUrlToken[] {
  return filterUrlTokensBySource(connector?.urlTokens ?? [], 'floAction');
}

export function floActionNodeTokensFromConnectorDoc(connector: ConnectorDoc | null | undefined): ConnectorUrlToken[] {
  return filterUrlTokensBySource(connector?.urlTokens ?? [], 'floActionNode');
}

export function plugTokensFromConnectorDoc(connector: ConnectorDoc | null | undefined): ConnectorUrlToken[] {
  return filterUrlTokensBySource(connector?.urlTokens ?? [], 'plug');
}

export { resolveKitServicesSchemaId };
