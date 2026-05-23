/**
 * WSDL / XSD / OpenAPI → ParsedField[] — shared by designer callable and FloAction engine.
 */

import { XMLParser } from 'fast-xml-parser';
import type { ParsedField } from '@floplug/shared';

const xmlParser = new XMLParser({
  ignoreAttributes:    false,
  attributeNamePrefix: '@_',
  isArray: (name) => [
    'xsd:element', 'xsd:complexType', 'xsd:simpleType', 'xsd:sequence', 'xsd:enumeration',
    'wsdl:message', 'wsdl:operation', 'element', 'complexType', 'simpleType', 'sequence',
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

function refLocalName(ref?: string): string {
  if (!ref) return '';
  return ref.split(':').pop() ?? ref;
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

/** XSD: minOccurs omitted defaults to 1; only explicit 0 means optional. */
function isElementLocallyRequired(el: any): boolean {
  const mo = el['@_minOccurs'];
  return mo !== '0' && mo !== 0;
}

function walkContainerChildren(
  schema: any,
  container: any,
  pathPrefix: string,
  results: ParsedField[],
  depth: number,
  ancestorsRequired: boolean,
): void {
  const children: any[] = [].concat(container['xsd:element'] ?? container['element'] ?? []);
  for (const child of children) {
    walkXsdChildNode(schema, child, pathPrefix, results, depth + 1, ancestorsRequired);
  }

  const nested: any[] = []
    .concat(container['xsd:sequence'] ?? container['sequence'] ?? [])
    .concat(container['xsd:choice'] ?? container['choice'] ?? [])
    .concat(container['xsd:all'] ?? container['all'] ?? []);
  for (const n of nested) {
    walkContainerChildren(schema, n, pathPrefix, results, depth + 1, ancestorsRequired);
  }

  const groups: any[] = [].concat(container['xsd:group'] ?? container['group'] ?? []);
  for (const g of groups) {
    const ref = refLocalName(g['@_ref'] as string | undefined);
    if (!ref) continue;
    const groupDef = findGroup(schema, ref);
    if (!groupDef) continue;
    const groupContainer = groupDef['xsd:sequence'] ?? groupDef['sequence']
      ?? groupDef['xsd:choice'] ?? groupDef['choice']
      ?? groupDef['xsd:all'] ?? groupDef['all']
      ?? groupDef;
    walkContainerChildren(schema, groupContainer, pathPrefix, results, depth + 1, ancestorsRequired);
  }
}

function findComplexType(schema: any, typeName: string): any | undefined {
  const complexTypes: any[] = [].concat(schema['xsd:complexType'] ?? schema['complexType'] ?? []);
  return complexTypes.find((t: any) => t['@_name'] === typeName);
}

function findGlobalElement(schema: any, elementName: string): any | undefined {
  const elements: any[] = [].concat(schema['xsd:element'] ?? schema['element'] ?? []);
  return elements.find((e: any) => e['@_name'] === elementName);
}

function findGroup(schema: any, groupName: string): any | undefined {
  const groups: any[] = [].concat(schema['xsd:group'] ?? schema['group'] ?? []);
  return groups.find((g: any) => g['@_name'] === groupName);
}

function findSimpleType(schema: any, typeName: string): any | undefined {
  const simpleTypes: any[] = [].concat(schema['xsd:simpleType'] ?? schema['simpleType'] ?? []);
  return simpleTypes.find((t: any) => t['@_name'] === typeName);
}

function extractEnumValues(typeDef: any): string[] {
  if (!typeDef) return [];
  const restriction = typeDef['xsd:restriction'] ?? typeDef['restriction'];
  if (!restriction) return [];
  const enums: any[] = [].concat(
    restriction['xsd:enumeration'] ?? restriction['enumeration'] ?? [],
  );
  return enums
    .map((e: any) => e['@_value'] as string | undefined)
    .filter((v): v is string => !!v);
}

function enumsFromRestriction(restriction: any, schema: any, visited: Set<string>): string[] {
  if (!restriction) return [];
  const direct = extractEnumValues({ restriction });
  if (direct.length > 0) return direct;

  const union = restriction['xsd:union'] ?? restriction['union'];
  if (union) {
    const members = String(union['@_memberTypes'] ?? '').split(/\s+/).filter(Boolean);
    const merged: string[] = [];
    for (const m of members) {
      merged.push(...resolveTypeEnumerations(schema, m, visited));
    }
    return [...new Set(merged)];
  }

  const base = refLocalName(restriction['@_base'] as string | undefined);
  if (base) return resolveTypeEnumerations(schema, base, visited);
  return [];
}

/** Resolve enumeration values for an XSD type reference (Workday ID @type attributes). */
function resolveTypeEnumerations(
  schema: any,
  typeRef?: string,
  visited: Set<string> = new Set(),
): string[] {
  const name = refLocalName(typeRef ?? '');
  if (!name || isXsdBuiltinType(name)) return [];
  if (visited.has(name)) return [];
  visited.add(name);

  const simple = findSimpleType(schema, name);
  if (simple) {
    const restriction = simple['xsd:restriction'] ?? simple['restriction'];
    const fromRestriction = enumsFromRestriction(restriction, schema, visited);
    if (fromRestriction.length > 0) return fromRestriction;
    const fromSimple = extractEnumValues(simple);
    if (fromSimple.length > 0) return fromSimple;
  }

  const complex = findComplexType(schema, name);
  if (complex) {
    const fromComplex = extractEnumValues(complex);
    if (fromComplex.length > 0) return fromComplex;
    const sc = complex['xsd:simpleContent'] ?? complex['simpleContent'];
    const ext = sc?.['xsd:extension'] ?? sc?.['extension'];
    const base = refLocalName(ext?.['@_base'] as string | undefined);
    if (base) return resolveTypeEnumerations(schema, base, visited);
  }

  const simpleTypes: any[] = [].concat(schema['xsd:simpleType'] ?? schema['simpleType'] ?? []);
  for (const st of simpleTypes) {
    const stName = st['@_name'] as string | undefined;
    if (!stName || stName !== name) continue;
    const restriction = st['xsd:restriction'] ?? st['restriction'];
    const fromRestriction = enumsFromRestriction(restriction, schema, visited);
    if (fromRestriction.length > 0) return fromRestriction;
  }

  // Workday: @type often references a union/simpleType defined elsewhere in the same schema file
  for (const st of simpleTypes) {
    const stName = (st['@_name'] as string | undefined) ?? '';
    if (!stName || (!stName.includes('ID') && !stName.includes('Reference'))) continue;
    const restriction = st['xsd:restriction'] ?? st['restriction'];
    const base = refLocalName(restriction?.['@_base'] as string | undefined);
    if (base && base !== name) continue;
    const fromRestriction = enumsFromRestriction(restriction, schema, new Set());
    if (fromRestriction.length > 0 && stName.toLowerCase().includes(name.toLowerCase().slice(0, 8))) {
      return fromRestriction;
    }
  }

  return [];
}

function expandComplexType(
  schema: any,
  typeDef: any,
  pathPrefix: string,
  results: ParsedField[],
  depth: number,
  ancestorsRequired: boolean,
): void {
  const direct = typeDef['xsd:sequence'] ?? typeDef['sequence']
              ?? typeDef['xsd:all'] ?? typeDef['all']
              ?? typeDef['xsd:choice'] ?? typeDef['choice']
              ?? typeDef['xsd:complexType'] ?? typeDef['complexType'];
  if (direct) {
    walkContainerChildren(schema, direct, pathPrefix, results, depth, ancestorsRequired);
    return;
  }

  // Handles Workday-style complexContent/extension base="...Type"
  const complexContent = typeDef['xsd:complexContent'] ?? typeDef['complexContent'];
  const extension = complexContent?.['xsd:extension'] ?? complexContent?.['extension'];
  if (!extension) return;

  const extContainer = extension['xsd:sequence'] ?? extension['sequence']
                    ?? extension['xsd:all'] ?? extension['all']
                    ?? extension['xsd:choice'] ?? extension['choice'];
  if (extContainer) {
    walkContainerChildren(schema, extContainer, pathPrefix, results, depth, ancestorsRequired);
  }

  const base = refLocalName(extension['@_base'] as string | undefined);
  if (base && !isXsdBuiltinType(base)) {
    const baseType = findComplexType(schema, base);
    if (baseType) {
      expandComplexType(schema, baseType, pathPrefix, results, depth + 1, ancestorsRequired);
    }
  }
}

/** Walk one XSD element node (inline or by type reference) — not limited to schema root. */
function walkXsdChildNode(
  schema: any,
  el: any,
  pathPrefix: string,
  results: ParsedField[],
  depth: number,
  ancestorsRequired: boolean,
): void {
  if (depth > 12) return;

  const name = (el['@_name'] as string | undefined) ?? refLocalName(el['@_ref'] as string | undefined);
  if (!name) return;

  const locallyRequired = isElementLocallyRequired(el);
  const required        = ancestorsRequired && locallyRequired;
  const childAncestorsRequired = ancestorsRequired && locallyRequired;
  const repeating = el['@_maxOccurs'] === 'unbounded' || Number(el['@_maxOccurs'] ?? 1) > 1;
  let xsdType   = (el['@_type'] as string) ?? 'xsd:string';
  const docNode   = el['xsd:annotation']?.['xsd:documentation'] ?? el['annotation']?.['documentation'];
  const path      = pathPrefix ? `${pathPrefix}.${name}` : name;

  // Handle <xsd:element ref="wd:Foo"> by resolving referenced global element
  if (!el['@_name'] && el['@_ref']) {
    const refName = refLocalName(el['@_ref'] as string);
    const refEl = findGlobalElement(schema, refName);
    if (refEl) {
      const merged = {
        ...refEl,
        ...el,
        '@_name': name,
        '@_type': (el['@_type'] as string | undefined) ?? (refEl['@_type'] as string | undefined),
      };
      walkXsdChildNode(schema, merged, pathPrefix, results, depth + 1, ancestorsRequired);
      return;
    }
  }

  const inlineComplex = el['xsd:complexType'] ?? el['complexType'] ?? el['xsd:sequence'] ?? el['sequence'];
  if (inlineComplex) {
    const container = inlineComplex['xsd:sequence'] ?? inlineComplex['sequence']
                   ?? inlineComplex['xsd:all'] ?? inlineComplex['all']
                   ?? inlineComplex['xsd:choice'] ?? inlineComplex['choice']
                   ?? inlineComplex;
    walkContainerChildren(schema, container, path, results, depth, childAncestorsRequired);
    return;
  }

  const typeName = xsdType.split(':').pop() ?? '';

  if (typeName && !isXsdBuiltinType(typeName)) {
    const typeDef = findComplexType(schema, typeName);
    if (typeDef) {
      const before = results.length;
      expandComplexType(schema, typeDef, path, results, depth, childAncestorsRequired);
      if (results.length > before) return;
    }
  }

  const typeDef  = findComplexType(schema, typeName);
  if (typeDef && emitSimpleContentIdFields(schema, typeDef, path, name, required, results)) {
    return;
  }

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

/** Workday ID_Type pattern: value + @type (enumeration) as mappable fields. */
function emitSimpleContentIdFields(
  schema: any,
  typeDef: any,
  path: string,
  elementName: string,
  required: boolean,
  results: ParsedField[],
): boolean {
  const simpleContent = typeDef['xsd:simpleContent'] ?? typeDef['simpleContent'];
  const extension = simpleContent?.['xsd:extension'] ?? simpleContent?.['extension'];
  if (!extension) return false;

  const attrs: any[] = [].concat(extension['xsd:attribute'] ?? extension['attribute'] ?? []);
  let emitted = false;
  for (const attr of attrs) {
    const attrName = attr['@_name'] as string | undefined;
    if (!attrName) continue;
    const attrRequired = required && attr['@_use'] === 'required';
    const inlineType   = attr['xsd:simpleType'] ?? attr['simpleType'];
    const inlineRestriction = inlineType?.['xsd:restriction'] ?? inlineType?.['restriction'];
    let enumValues = enumsFromRestriction(inlineRestriction, schema, new Set());
    if (enumValues.length === 0) {
      enumValues = resolveTypeEnumerations(schema, attr['@_type'] as string | undefined);
    }
    results.push({
      path:       `${path}.@${attrName}`,
      label:      attrName === 'type' ? 'ID type' : `${toLabel(elementName)} @${attrName}`,
      xsdType:    (attr['@_type'] as string) ?? 'xsd:string',
      required:   attrRequired,
      repeating:  false,
      enumValues: enumValues.length > 0 ? enumValues : undefined,
      helpText:   enumValues.length > 0
        ? `Allowed ${attrName} values for ${toLabel(elementName)}`
        : undefined,
    });
    emitted = true;
  }

  const base = refLocalName(extension['@_base'] as string | undefined);
  if (base) {
    results.push({
      path,
      label:    toLabel(elementName),
      xsdType:  base.includes(':') ? base : `xsd:${base}`,
      required,
      repeating: false,
      helpText: 'ID value (text content)',
    });
    emitted = true;
  }
  return emitted;
}

function walkXsdElement(
  schema: any, elementName: string, pathPrefix: string,
  results: ParsedField[], depth: number,
): ParsedField[] {
  if (depth > 12) return results;
  const elements: any[] = [].concat(schema['xsd:element'] ?? schema['element'] ?? []);
  const el = elements.find((e: any) => e['@_name'] === elementName);
  if (!el) return results;

  walkXsdChildNode(schema, el, pathPrefix, results, depth, true);
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

export function parseXsdSchemaFields(
  schema: any,
  actionId: string,
  operationName: string | undefined,
  cachedRootNames?: string[],
): ParsedField[] {
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

function parseXsdElement(
  xsdContent:    string,
  actionId:      string,
  operationName: string | undefined,
  cachedRootNames?: string[],
): ParsedField[] {
  const parsed = xmlParser.parse(xsdContent);
  const schema = parsed['xsd:schema'] ?? parsed['schema'] ?? {};
  return parseXsdSchemaFields(schema, actionId, operationName, cachedRootNames);
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
