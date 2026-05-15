// functions/src/utils/schemaParser.ts
// Uses fast-xml-parser — already available in most Node environments

import { XMLParser } from 'fast-xml-parser';
import type {ParsedField} from '@floplug/shared';

const parser = new XMLParser({
  ignoreAttributes:    false,
  attributeNamePrefix: '@_',
  isArray: (name) => [
    'xsd:element', 'xsd:complexType', 'xsd:sequence',
    'xsd:enumeration', 'wsdl:message', 'wsdl:operation',
  ].includes(name),
});

export async function parseWsdlOperation(
  wsdlContent:   string,
  operationName: string,
): Promise<ParsedField[]> {
  const parsed = parser.parse(wsdlContent);
  const definitions = parsed['wsdl:definitions'] ?? parsed['definitions'];
  const types = definitions['wsdl:types']?.['xsd:schema'] ?? [];

  // Find the input message for this operation
  const operations: any[] = definitions['wsdl:portType']?.['wsdl:operation'] ?? [];
  const op = operations.find((o: any) => o['@_name'] === operationName);
  if (!op) throw new Error(`Operation "${operationName}" not found in WSDL`);

  const inputMsgName = op['wsdl:input']?.['@_message']?.split(':').pop();
  const messages: any[] = definitions['wsdl:message'] ?? [];
  const inputMsg = messages.find((m: any) => m['@_name'] === inputMsgName);
  const rootElement = inputMsg?.['wsdl:part']?.['@_element']?.split(':').pop();

  // Walk the XSD type tree starting from rootElement
  return walkXsdElement(types, rootElement, '', []);
}

export async function parseXsdElement(
  xsdContent:   string,
  elementName:  string,
): Promise<ParsedField[]> {
  const parsed = parser.parse(xsdContent);
  const schema = parsed['xsd:schema'] ?? parsed['schema'];
  return walkXsdElement(schema, elementName, '', []);
}

function walkXsdElement(
  schema:      any,
  elementName: string,
  pathPrefix:  string,
  results:     ParsedField[],
  depth = 0,
): ParsedField[] {
  // Guard against infinite recursion on circular type refs
  if (depth > 12) return results;

  const elements: any[] = [].concat(schema['xsd:element'] ?? []);
  const el = elements.find((e: any) => e['@_name'] === elementName);
  if (!el) return results;

  const required  = el['@_minOccurs'] !== '0' && el['@_minOccurs'] !== 0;
  const repeating = el['@_maxOccurs'] === 'unbounded' || Number(el['@_maxOccurs'] ?? 1) > 1;
  const xsdType   = el['@_type'] ?? 'xsd:string';
  const docNode   = el['xsd:annotation']?.['xsd:documentation'];
  const path      = pathPrefix ? `${pathPrefix}.${elementName}` : elementName;

  // If it's a simple type, add as a field
  if (!el['xsd:complexType'] && !el['xsd:sequence']) {
    // Check for enumerations
    const complexTypes: any[] = [].concat(schema['xsd:complexType'] ?? []);
    const typeName = xsdType.split(':').pop();
    const typeDef  = complexTypes.find((t: any) => t['@_name'] === typeName);
    const enums: string[] = typeDef?.['xsd:restriction']?.['xsd:enumeration']
      ?.map((e: any) => e['@_value']) ?? [];

    results.push({
      path,
      label:      toLabel(elementName),
      xsdType,
      required,
      repeating,
      enumValues: enums.length > 0 ? enums : undefined,
      helpText:   typeof docNode === 'string' ? docNode : undefined,
    });
    return results;
  }

  // If complex type, recurse into children
  const sequence = el['xsd:complexType']?.['xsd:sequence'] ??
                   el['xsd:sequence'] ?? {};
  const children: any[] = [].concat(sequence['xsd:element'] ?? []);

  for (const child of children) {
    const childName = child['@_name'];
    if (childName) walkXsdElement(schema, childName, path, results, depth + 1);
  }

  return results;
}

// "First_Name" → "First Name"
function toLabel(name: string): string {
  return name.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
}