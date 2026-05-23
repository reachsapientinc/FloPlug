/**
 * Extract operation / element names from raw schema files.
 * Used on upload, listSchemaOperations, and FloKit / Schema Management UIs.
 */

import { XMLParser } from 'fast-xml-parser';
import type { SchemaOperationRef } from '@floplug/shared';

const xmlParser = new XMLParser({
  ignoreAttributes:    false,
  attributeNamePrefix: '@_',
  isArray: (name) => [
    'xsd:element', 'xsd:complexType', 'xsd:sequence',
    'xsd:enumeration', 'wsdl:message', 'wsdl:operation',
    'wsdl:portType', 'portType', 'element', 'operation',
  ].includes(name),
});

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

function dedupeByName(ops: SchemaOperationRef[]): SchemaOperationRef[] {
  const seen = new Set<string>();
  return ops.filter(o => {
    if (seen.has(o.name)) return false;
    seen.add(o.name);
    return true;
  });
}

export function listOperationsFromContent(
  raw: string,
  schemaType: string,
): SchemaOperationRef[] {
  switch (schemaType) {
    case 'wsdl':
      return listWsdlOperations(raw);
    case 'xsd':
      return listXsdOperations(raw);
    case 'openapi':
    case 'graphql':
      return listOpenApiOperations(raw);
    default:
      return [];
  }
}

function listWsdlOperations(wsdlContent: string): SchemaOperationRef[] {
  const parsed      = xmlParser.parse(wsdlContent);
  const definitions = parsed['wsdl:definitions'] ?? parsed['definitions'] ?? {};
  const portTypes   = [].concat(definitions['wsdl:portType'] ?? definitions['portType'] ?? []);
  const messages    = [].concat(definitions['wsdl:message'] ?? definitions['message'] ?? []);
  const ops: SchemaOperationRef[] = [];

  for (const pt of portTypes) {
    const operations = [].concat((pt as any)['wsdl:operation'] ?? (pt as any)['operation'] ?? []);
    for (const op of operations) {
      const name = (op as any)['@_name'];
      if (!name) continue;
      const inputRefUnknown: unknown =
        (op as any)['wsdl:input']?.['@_message'] ?? (op as any)['input']?.['@_message'];
      const inputMessageName = typeof inputRefUnknown === 'string'
        ? inputRefUnknown.split(':').pop()
        : undefined;
      const msg = inputMessageName
        ? messages.find((m: any) => (m as any)['@_name'] === inputMessageName)
        : undefined;
      const messageParts = [].concat(
        msg?.['wsdl:part'] ?? msg?.['part'] ?? [],
      ) as Array<Record<string, unknown>>;
      const firstPart = messageParts.find((p) =>
        typeof p?.['@_element'] === 'string' || typeof p?.['@_type'] === 'string',
      );
      const requestRootElementRaw: unknown = firstPart?.['@_element'];
      const requestRootElement = typeof requestRootElementRaw === 'string'
        ? requestRootElementRaw.split(':').pop()
        : undefined;
      const requestTypeNameRaw: unknown = firstPart?.['@_type'];
      const requestTypeName = typeof requestTypeNameRaw === 'string'
        ? requestTypeNameRaw.split(':').pop()
        : undefined;
      ops.push({
        name,
        label: name,
        method: 'POST',
        endpoint: '/',
        inputMessageName,
        requestRootElement,
        requestTypeName,
      });
    }
  }

  return dedupeByName(ops);
}

function isXsdOperationElement(name: string): boolean {
  if (name.endsWith('_Request')) return true;
  return /^(Put|Get|Submit|Change|Cancel|Add|Edit|Delete|Create|Update)_/i.test(name);
}

function listXsdOperations(xsdContent: string): SchemaOperationRef[] {
  const parsed = xmlParser.parse(xsdContent);
  const schema = parsed['xsd:schema'] ?? parsed['schema'] ?? {};
  const elements = [].concat(schema['xsd:element'] ?? schema['element'] ?? []);

  return dedupeByName(
    elements
      .map((el: any) => el['@_name'] as string | undefined)
      .filter((name): name is string => !!name)
      .filter(isXsdOperationElement)
      .map(name => ({
        name,
        label: name,
        method: 'POST' as const,
        endpoint: '/',
        requestRootElement: name.endsWith('_Request') ? name : undefined,
      })),
  );
}

function listOpenApiOperations(specContent: string): SchemaOperationRef[] {
  const spec = JSON.parse(specContent) as {
    paths?: Record<string, Record<string, { operationId?: string; summary?: string }>>;
  };
  const ops: SchemaOperationRef[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      const op = operation as { operationId?: string; summary?: string };
      const name = op.operationId
        ?? `${method}_${path.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '')}`;
      ops.push({
        name,
        label: op.summary ?? name,
        method: method.toUpperCase(),
        endpoint: path,
      });
    }
  }

  return dedupeByName(ops);
}

/** Names only — stored on ConnectorSchema.operations */
export function operationNames(ops: SchemaOperationRef[]): string[] {
  return ops.map(o => o.name);
}
