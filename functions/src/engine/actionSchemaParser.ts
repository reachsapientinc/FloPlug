/**
 * WSDL / XSD / OpenAPI → ParsedField[] — shared by designer callable and FloAction engine.
 */

import { XMLParser } from 'fast-xml-parser';
import type { ParsedField } from '@floplug/shared';

const xmlParser = new XMLParser({
  ignoreAttributes:    false,
  attributeNamePrefix: '@_',
  isArray: (name) => [
    'xsd:element', 'xsd:complexType', 'xsd:sequence', 'xsd:enumeration',
    'wsdl:message', 'wsdl:operation', 'element', 'complexType', 'sequence',
  ].includes(name),
});

function toLabel(name: string): string {
  return name.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').replace(/\s+/g, ' ').trim();
}

function walkJsonSchema(
  schema: any, pathPrefix: string, results: ParsedField[],
  $defs: Record<string, any>, depth = 0,
): void {
  if (depth > 12) return;
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    const resolved = $defs[refName];
    if (resolved) walkJsonSchema(resolved, pathPrefix, results, $defs, depth);
    return;
  }
  const props    = schema.properties ?? {};
  const required = new Set<string>(schema.required ?? []);
  for (const [key, val] of Object.entries(props)) {
    const propSchema = val as any;
    const path       = pathPrefix ? `${pathPrefix}.${key}` : key;
    const isRequired = required.has(key);
    const repeating  = propSchema.type === 'array';
    const xsdType    = propSchema.type === 'array'
      ? `array<${propSchema.items?.type ?? 'object'}>`
      : propSchema.type ?? 'string';
    if (propSchema.type === 'object' || propSchema.$ref || propSchema.type === 'array') {
      const next = propSchema.type === 'array' ? propSchema.items : propSchema;
      if (next) walkJsonSchema(next, path, results, $defs, depth + 1);
    } else {
      results.push({
        path, label: toLabel(key), xsdType, required: isRequired, repeating,
        enumValues: propSchema.enum, helpText: propSchema.description,
      });
    }
  }
}

function isXsdBuiltinType(typeName: string): boolean {
  const t = typeName.toLowerCase();
  return ['string', 'boolean', 'decimal', 'float', 'double', 'integer', 'int', 'long',
    'date', 'datetime', 'time', 'anytype', 'id', 'idref'].includes(t);
}

/** List top-level xsd:element @name values in a parsed schema object. */
export function listXsdRootElementNames(schema: any): string[] {
  const elements: any[] = [].concat(schema['xsd:element'] ?? schema['element'] ?? []);
  return elements
    .map((el: any) => el['@_name'] as string | undefined)
    .filter((name): name is string => !!name);
}

/**
 * Map actionId (e.g. put_sales_item) to a Workday-style XSD root element
 * (e.g. Put_Sales_Item_Request) using schema index or heuristics.
 */
export function resolveXsdRootElementForAction(
  actionId:      string,
  operationName: string | undefined,
  availableRoots: string[],
): string {
  if (availableRoots.length === 0) {
    throw new Error(`No top-level elements in XSD for action "${actionId}"`);
  }

  const candidates: string[] = [];
  if (operationName) candidates.push(operationName);
  candidates.push(actionId);

  const parts = actionId.split('_').filter(Boolean);
  const titleParts = parts.map(p =>
    p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(),
  );
  const pascal = titleParts.join('_');

  candidates.push(pascal);
  candidates.push(`${pascal}_Request`);
  candidates.push(`${pascal}_Input`);
  candidates.push(`${pascal}_Data`);
  candidates.push(`${pascal}_Type`);

  if (parts[0]?.toLowerCase() === 'put' && parts.length > 1) {
    const rest = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('_');
    candidates.push(`Put_${rest}`);
    candidates.push(`Put_${rest}_Request`);
  }
  if (parts[0]?.toLowerCase() === 'get' && parts.length > 1) {
    const rest = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('_');
    candidates.push(`Get_${rest}`);
    candidates.push(`Get_${rest}_Request`);
  }

  const byLower = new Map(availableRoots.map(a => [a.toLowerCase(), a]));
  for (const c of candidates) {
    const hit = byLower.get(c.toLowerCase());
    if (hit) return hit;
  }

  const key = parts.join('').toLowerCase();
  for (const root of availableRoots) {
    const norm = root.replace(/_/g, '').toLowerCase();
    if (norm.includes(key) || key.includes(norm.replace(/request|input|response|data/g, ''))) {
      return root;
    }
  }

  throw new Error(
    `No XSD root element matched action "${actionId}". ` +
    `Tried: ${candidates.slice(0, 8).join(', ')}. ` +
    `Available (${availableRoots.length}): ${availableRoots.slice(0, 25).join(', ')}` +
    `${availableRoots.length > 25 ? '…' : ''}`,
  );
}

function walkSequenceChildren(
  schema: any,
  sequence: any,
  pathPrefix: string,
  results: ParsedField[],
  depth: number,
): void {
  const children: any[] = [].concat(sequence['xsd:element'] ?? sequence['element'] ?? []);
  for (const child of children) {
    walkXsdChildNode(schema, child, pathPrefix, results, depth + 1);
  }
}

function expandComplexType(
  schema: any,
  typeDef: any,
  pathPrefix: string,
  results: ParsedField[],
  depth: number,
): void {
  const seq = typeDef['xsd:sequence'] ?? typeDef['sequence']
           ?? typeDef['xsd:complexType'] ?? typeDef['complexType'];
  if (seq) walkSequenceChildren(schema, seq, pathPrefix, results, depth);
}

/** Walk one XSD element node (inline or by type reference) — not limited to schema root. */
function walkXsdChildNode(
  schema: any,
  el: any,
  pathPrefix: string,
  results: ParsedField[],
  depth: number,
): void {
  if (depth > 12) return;

  const name = el['@_name'] as string | undefined;
  if (!name) return;

  const required  = el['@_minOccurs'] !== '0' && el['@_minOccurs'] !== 0;
  const repeating = el['@_maxOccurs'] === 'unbounded' || Number(el['@_maxOccurs'] ?? 1) > 1;
  const xsdType   = (el['@_type'] as string) ?? 'xsd:string';
  const docNode   = el['xsd:annotation']?.['xsd:documentation'] ?? el['annotation']?.['documentation'];
  const path      = pathPrefix ? `${pathPrefix}.${name}` : name;

  const inlineComplex = el['xsd:complexType'] ?? el['complexType'] ?? el['xsd:sequence'] ?? el['sequence'];
  if (inlineComplex) {
    const sequence = inlineComplex['xsd:sequence'] ?? inlineComplex['sequence'] ?? inlineComplex;
    walkSequenceChildren(schema, sequence, path, results, depth);
    return;
  }

  const complexTypes: any[] = [].concat(schema['xsd:complexType'] ?? schema['complexType'] ?? []);
  const typeName = xsdType.split(':').pop() ?? '';

  if (typeName && !isXsdBuiltinType(typeName)) {
    const typeDef = complexTypes.find((t: any) => t['@_name'] === typeName);
    if (typeDef) {
      expandComplexType(schema, typeDef, path, results, depth);
      return;
    }
  }

  const typeDef  = complexTypes.find((t: any) => t['@_name'] === typeName);
  const enums: string[] = typeDef?.['xsd:restriction']?.['xsd:enumeration']?.map((e: any) => e['@_value'])
    ?? typeDef?.['restriction']?.['enumeration']?.map((e: any) => e['@_value']) ?? [];

  results.push({
    path,
    label:      toLabel(name),
    xsdType,
    required,
    repeating,
    enumValues: enums.length > 0 ? enums : undefined,
    helpText:   typeof docNode === 'string' ? docNode : undefined,
  });
}

function walkXsdElement(
  schema: any, elementName: string, pathPrefix: string,
  results: ParsedField[], depth: number,
): ParsedField[] {
  if (depth > 12) return results;
  const elements: any[] = [].concat(schema['xsd:element'] ?? schema['element'] ?? []);
  const el = elements.find((e: any) => e['@_name'] === elementName);
  if (!el) return results;

  walkXsdChildNode(schema, el, pathPrefix, results, depth);
  return results;
}

function parseWsdlOperation(wsdlContent: string, operationName: string): ParsedField[] {
  const parsed      = xmlParser.parse(wsdlContent);
  const definitions = parsed['wsdl:definitions'] ?? parsed['definitions'] ?? {};
  const types       = definitions['wsdl:types']?.['xsd:schema'] ?? definitions['types']?.['schema'] ?? {};
  const portType    = definitions['wsdl:portType'] ?? definitions['portType'] ?? {};
  const operations: any[] = [].concat(portType['wsdl:operation'] ?? portType['operation'] ?? []);
  const op          = operations.find((o: any) => o['@_name'] === operationName);
  if (!op) {
    throw new Error(
      `Operation "${operationName}" not found in WSDL. Available: ${operations.map((o: any) => o['@_name']).join(', ')}`,
    );
  }
  const inputMsgRef  = op['wsdl:input']?.['@_message'] ?? op['input']?.['@_message'] ?? '';
  const inputMsgName = inputMsgRef.split(':').pop() ?? '';
  const messages: any[] = [].concat(definitions['wsdl:message'] ?? definitions['message'] ?? []);
  const inputMsg     = messages.find((m: any) => m['@_name'] === inputMsgName);
  const partEl       = inputMsg?.['wsdl:part']?.['@_element'] ?? inputMsg?.['part']?.['@_element'] ?? '';
  const rootElement  = partEl.split(':').pop() ?? '';
  return walkXsdElement(types, rootElement, '', [], 0);
}

function parseXsdElement(
  xsdContent:    string,
  actionId:      string,
  operationName: string | undefined,
  cachedRootNames?: string[],
): ParsedField[] {
  const parsed = xmlParser.parse(xsdContent);
  const schema = parsed['xsd:schema'] ?? parsed['schema'] ?? {};
  const roots  = cachedRootNames ?? listXsdRootElementNames(schema);
  const rootEl = resolveXsdRootElementForAction(actionId, operationName, roots);
  const fields = walkXsdElement(schema, rootEl, '', [], 0);
  if (fields.length === 0) {
    throw new Error(
      `XSD element "${rootEl}" matched but produced no fields — schema may use unsupported constructs`,
    );
  }
  return fields;
}

function parseOpenApiOperation(specContent: string, operationName: string): ParsedField[] {
  const spec    = JSON.parse(specContent);
  const results: ParsedField[] = [];
  for (const [, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const [, operation] of Object.entries(pathItem as any)) {
      if ((operation as any).operationId !== operationName) continue;
      const bodySchema = (operation as any).requestBody?.content?.['application/json']?.schema;
      if (bodySchema) walkJsonSchema(bodySchema, '', results, spec.components?.schemas ?? {});
      return results;
    }
  }
  throw new Error(`Operation "${operationName}" not found in OpenAPI spec`);
}

/** Parse raw schema file content into ParsedField[] for a given operation. */
export function parseSchemaFields(
  rawSchema: string,
  schemaType: string,
  operationName: string,
  actionId?: string,
): ParsedField[] {
  const actId = actionId ?? operationName;
  switch (schemaType) {
    case 'wsdl':    return parseWsdlOperation(rawSchema, operationName);
    case 'xsd':     return parseXsdElement(rawSchema, actId, operationName);
    case 'openapi': return parseOpenApiOperation(rawSchema, operationName);
    default:
      throw new Error(`Unsupported schema type: ${schemaType}`);
  }
}
