/**
 * Resolve XSD enumeration values (Workday ID @type, restrictions, unions).
 * Shared by flatten index compile and live schema parser.
 */

function refLocalName(typeRef?: string): string {
  if (!typeRef) return '';
  return typeRef.includes(':') ? (typeRef.split(':').pop() ?? typeRef) : typeRef;
}

function isXsdBuiltinType(name: string): boolean {
  const t = name.toLowerCase();
  return t.startsWith('xsd:') || t.startsWith('xs:')
    || ['string', 'boolean', 'decimal', 'integer', 'date', 'datetime', 'time'].includes(t);
}

function findSimpleType(schema: any, typeName: string): any | undefined {
  const simpleTypes: any[] = [].concat(schema['xsd:simpleType'] ?? schema['simpleType'] ?? []);
  return simpleTypes.find((t: any) => t['@_name'] === typeName);
}

function findComplexType(schema: any, typeName: string): any | undefined {
  const complexTypes: any[] = [].concat(schema['xsd:complexType'] ?? schema['complexType'] ?? []);
  return complexTypes.find((t: any) => t['@_name'] === typeName);
}

function localXmlTag(key: string): string {
  const i = key.indexOf(':');
  return i >= 0 ? key.slice(i + 1) : key;
}

/** Collect all wd:/xsd:enumeration @value nodes under restriction (incl. annotation/appinfo). */
function collectEnumerationValues(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined) return out;
  if (Array.isArray(node)) {
    for (const item of node) collectEnumerationValues(item, out);
    return out;
  }
  if (typeof node !== 'object') return out;

  for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
    if (localXmlTag(key) === 'enumeration') {
      const items: unknown[] = Array.isArray(val) ? val : val != null ? [val] : [];
      for (const e of items) {
        const v = (e as Record<string, unknown>)?.['@_value'];
        if (typeof v === 'string' && v.trim()) out.push(v.trim());
      }
      continue;
    }
    if (typeof val === 'object') collectEnumerationValues(val, out);
  }
  return out;
}

function extractEnumValues(typeDef: any): string[] {
  if (!typeDef) return [];
  const restriction = typeDef['xsd:restriction'] ?? typeDef['restriction'];
  if (!restriction) return [];
  const fromWalk = collectEnumerationValues(restriction);
  return [...new Set(fromWalk)];
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
      merged.push(...resolveTypeEnumerationsInSchema(schema, m, visited));
    }
    return [...new Set(merged)];
  }

  const base = refLocalName(restriction['@_base'] as string | undefined);
  if (base) return resolveTypeEnumerationsInSchema(schema, base, visited);
  return [];
}

/** Resolve enumeration values for an XSD type reference (Workday ID @type attributes). */
export function resolveTypeEnumerationsInSchema(
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
    if (base) return resolveTypeEnumerationsInSchema(schema, base, visited);
  }

  // Workday: scan ID/Reference simpleTypes when direct lookup misses (union types).
  const simpleTypes: any[] = [].concat(schema['xsd:simpleType'] ?? schema['simpleType'] ?? []);
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

/** Guess @type enumeration type names from a *Reference element name. */
export function inferIdTypesForReferenceName(
  referenceElementName: string,
  schema: any,
): string[] {
  const base = referenceElementName.replace(/_Reference$/i, '').replace(/Reference$/i, '');
  if (!base) return [];

  const candidates = [
    `${base}_ID`,
    `${base}ObjectID`,
    `${base}_IDType`,
    `${base}ObjectIDType`,
    `${base}ReferenceID`,
    `${base}ObjectType`,
    `${base}ReferenceEnumeration`,
    `${referenceElementName}Enumeration`,
    `${base}_ReferenceEnumeration`,
  ];

  const merged = new Set<string>();
  for (const typeName of candidates) {
    for (const v of resolveTypeEnumerationsInSchema(schema, typeName)) {
      merged.add(v);
    }
  }

  const simpleTypes: any[] = [].concat(schema['xsd:simpleType'] ?? schema['simpleType'] ?? []);
  const baseLower = base.toLowerCase();
  const baseTokens = baseLower.split('_').filter(t => t.length > 2);
  for (const st of simpleTypes) {
    const stName = (st['@_name'] as string | undefined) ?? '';
    const stLower = stName.toLowerCase();
    if (!/id|objectid/i.test(stName)) continue;
    const matchesBase = baseTokens.length === 0
      || baseTokens.every(t => stLower.includes(t))
      || stLower.includes(baseLower.replace(/_/g, ''));
    if (!matchesBase) continue;
    const restriction = st['xsd:restriction'] ?? st['restriction'];
    for (const v of enumsFromRestriction(restriction, schema, new Set())) {
      merged.add(v);
    }
  }

  return [...merged];
}

/** Default wd:type token for Workday *Reference elements (e.g. Revenue_Category_ID). */
export function workdayDefaultIdTypeToken(referenceElementName: string): string {
  const base = referenceElementName.replace(/_Reference$/i, '').replace(/Reference$/i, '');
  return base ? `${base}_ID` : 'WID';
}

/** Scan merged schema simpleTypes related to a reference base name. */
export function scanSchemaForReferenceIdTypes(schema: any, referenceElementName: string): string[] {
  const base = referenceElementName.replace(/_Reference$/i, '').replace(/Reference$/i, '');
  if (!base) return [];

  const baseLower = base.toLowerCase();
  const baseCompact = baseLower.replace(/_/g, '');
  const found = new Set<string>();
  const simpleTypes: any[] = [].concat(schema['xsd:simpleType'] ?? schema['simpleType'] ?? []);

  for (const st of simpleTypes) {
    const stName = (st['@_name'] as string | undefined) ?? '';
    const stLower = stName.toLowerCase();
    const stCompact = stLower.replace(/_/g, '');
    const related = stLower.includes(baseLower)
      || baseLower.includes(stLower.slice(0, Math.min(20, stLower.length)))
      || stCompact.includes(baseCompact.slice(0, Math.min(14, baseCompact.length)));
    if (!related) continue;
    if (!/id|reference|object|enumeration/i.test(stName)) continue;

    const restriction = st['xsd:restriction'] ?? st['restriction'];
    for (const v of enumsFromRestriction(restriction, schema, new Set())) {
      found.add(v);
    }
  }

  return [...found];
}

/**
 * Resolve allowed wd:type values for a Workday reference field — never returns empty for *_Reference.
 */
export function resolveReferenceIdEnumerations(
  referenceElementName: string,
  mergedSchema: any,
  options?: {
    rawTypeName?:   string;
    complexDef?:    any;
    idElement?:       any;
    index?:           { complexTypes: Map<string, any>; simpleTypes: Map<string, any> };
  },
): { idTypes: string[]; pattern: 'nested_id' | 'simple_content' } {
  const index = options?.index;
  let pattern: 'nested_id' | 'simple_content' = 'nested_id';
  const collected = new Set<string>();

  const add = (values: string[]) => {
    for (const v of values) if (v) collected.add(v);
  };

  const idElement = options?.idElement
    ?? (options?.complexDef ? findIdElementInComplex(options.complexDef) : undefined);

  if (idElement && index) {
    add(resolveIdTypesFromIdElement(idElement, index, mergedSchema));
  }

  const complexDef = options?.complexDef
    ?? (options?.rawTypeName && index ? index.complexTypes.get(options.rawTypeName) : undefined);

  if (complexDef) {
    const typeAttr = getSimpleContentTypeAttribute(complexDef);
    if (typeAttr) {
      add(resolveTypeEnumerationsInSchema(mergedSchema, typeAttr['@_type'] as string | undefined));
      pattern = 'simple_content';
    }
  }

  if (options?.rawTypeName) {
    add(resolveTypeEnumerationsInSchema(mergedSchema, options.rawTypeName));
    const named = index?.complexTypes.get(options.rawTypeName);
    if (named) {
      const typeAttr = getSimpleContentTypeAttribute(named);
      if (typeAttr) {
        add(resolveTypeEnumerationsInSchema(mergedSchema, typeAttr['@_type'] as string | undefined));
        pattern = 'simple_content';
      }
    }
  }

  add(inferIdTypesForReferenceName(referenceElementName, mergedSchema));
  add(scanSchemaForReferenceIdTypes(mergedSchema, referenceElementName));

  let idTypes = [...collected];
  if (idTypes.length === 0) {
    idTypes = [workdayDefaultIdTypeToken(referenceElementName)];
  } else {
    idTypes.sort((a, b) => a.localeCompare(b));
  }

  return { idTypes, pattern };
}

function findIdElementInComplex(
  complexDef: any,
): any | undefined {
  const stack: any[] = [complexDef];
  while (stack.length) {
    const node = stack.pop()!;
    for (const el of [].concat(node['xsd:element'] ?? node['element'] ?? [])) {
      const n = (el['@_name'] as string | undefined) ?? refLocalName(el['@_ref'] as string | undefined);
      if (n === 'ID') return el;
    }
    stack.push(
      ...[].concat(
        node['xsd:sequence'] ?? node['sequence'] ?? [],
        node['xsd:choice'] ?? node['choice'] ?? [],
        node['xsd:all'] ?? node['all'] ?? [],
      ),
    );
    const cc = node['xsd:complexContent'] ?? node['complexContent'];
    if (cc) stack.push(cc['xsd:extension'] ?? cc['extension'] ?? cc['xsd:restriction'] ?? cc['restriction']);
    const sc = node['xsd:simpleContent'] ?? node['simpleContent'];
    if (sc) stack.push(sc['xsd:extension'] ?? sc['extension'] ?? sc['xsd:restriction'] ?? sc['restriction']);
  }
  return undefined;
}

function resolveIdTypesFromIdElement(
  idElement: any,
  index: { complexTypes: Map<string, any>; simpleTypes: Map<string, any> },
  mergedSchema: any,
): string[] {
  const idTypeRaw = refLocalName(idElement['@_type'] as string | undefined);
  const idComplex = index.complexTypes.get(idTypeRaw);
  if (!idComplex) {
    return resolveTypeEnumerationsInSchema(mergedSchema, idElement['@_type'] as string | undefined);
  }
  const typeAttr = getSimpleContentTypeAttribute(idComplex)
    ?? [].concat(idComplex['xsd:attribute'] ?? idComplex['attribute'] ?? [])
      .find((a: any) => a['@_name'] === 'type');
  if (!typeAttr) return [];
  return resolveTypeEnumerationsInSchema(mergedSchema, typeAttr['@_type'] as string | undefined);
}

/** Attribute `type` on simpleContent extension (Workday *ReferenceType). */
export function getSimpleContentTypeAttribute(complexDef: any): any | undefined {
  const sc = complexDef?.['xsd:simpleContent'] ?? complexDef?.['simpleContent'];
  const ext = sc?.['xsd:extension'] ?? sc?.['extension'];
  if (!ext) return undefined;
  const attrs: any[] = [].concat(ext['xsd:attribute'] ?? ext['attribute'] ?? []);
  return attrs.find((a: any) => a['@_name'] === 'type');
}
