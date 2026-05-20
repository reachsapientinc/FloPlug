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

function walkXsdElement(
  schema: any, elementName: string, pathPrefix: string,
  results: ParsedField[], depth: number,
): ParsedField[] {
  if (depth > 12) return results;
  const elements: any[] = [].concat(schema['xsd:element'] ?? schema['element'] ?? []);
  const el = elements.find((e: any) => e['@_name'] === elementName);
  if (!el) return results;

  const required  = el['@_minOccurs'] !== '0' && el['@_minOccurs'] !== 0;
  const repeating = el['@_maxOccurs'] === 'unbounded' || Number(el['@_maxOccurs'] ?? 1) > 1;
  const xsdType   = el['@_type'] ?? 'xsd:string';
  const docNode   = el['xsd:annotation']?.['xsd:documentation'] ?? el['annotation']?.['documentation'];
  const path      = pathPrefix ? `${pathPrefix}.${elementName}` : elementName;
  const complexContent = el['xsd:complexType'] ?? el['complexType'] ?? el['xsd:sequence'] ?? el['sequence'];

  if (!complexContent) {
    const complexTypes: any[] = [].concat(schema['xsd:complexType'] ?? schema['complexType'] ?? []);
    const typeName = xsdType.split(':').pop() ?? '';
    const typeDef  = complexTypes.find((t: any) => t['@_name'] === typeName);
    const enums: string[] = typeDef?.['xsd:restriction']?.['xsd:enumeration']?.map((e: any) => e['@_value'])
      ?? typeDef?.['restriction']?.['enumeration']?.map((e: any) => e['@_value']) ?? [];
    results.push({
      path, label: toLabel(elementName), xsdType, required, repeating,
      enumValues: enums.length > 0 ? enums : undefined,
      helpText: typeof docNode === 'string' ? docNode : undefined,
    });
    return results;
  }

  const sequence = complexContent['xsd:sequence'] ?? complexContent['sequence'] ?? complexContent;
  const children: any[] = [].concat(sequence['xsd:element'] ?? sequence['element'] ?? []);
  for (const child of children) {
    const childName: string = child['@_name'] ?? '';
    if (childName) walkXsdElement(schema, childName, path, results, depth + 1);
  }
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

function parseXsdElement(xsdContent: string, elementName: string): ParsedField[] {
  const parsed = xmlParser.parse(xsdContent);
  const schema = parsed['xsd:schema'] ?? parsed['schema'] ?? {};
  return walkXsdElement(schema, elementName, '', [], 0);
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
): ParsedField[] {
  switch (schemaType) {
    case 'wsdl':    return parseWsdlOperation(rawSchema, operationName);
    case 'xsd':     return parseXsdElement(rawSchema, operationName);
    case 'openapi': return parseOpenApiOperation(rawSchema, operationName);
    default:
      throw new Error(`Unsupported schema type: ${schemaType}`);
  }
}
