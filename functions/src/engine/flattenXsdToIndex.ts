/**
 * Port of files/Flatten_SOAP_API.xsl — walks merged XSD and emits field rows per operation.
 */

import type { FlattenedFieldRow, FlattenedOperationIndex } from '@floplug/shared';
import { resolveReferenceIdEnumerations } from './xsdEnumResolver.js';

const SKIP_NAMES = new Set(['Descriptor', 'ID', 'type']);

export interface XsdTypeIndex {
  complexTypes: Map<string, any>;
  simpleTypes:  Map<string, any>;
  elements:     Map<string, any>;
  groups:       Map<string, any>;
}

function stripNs(typeRef?: string): string {
  if (!typeRef) return '';
  return typeRef.includes(':') ? (typeRef.split(':').pop() ?? typeRef) : typeRef;
}

export function buildXsdTypeIndex(mergedSchema: any): XsdTypeIndex {
  const complexTypes = new Map<string, any>();
  const simpleTypes  = new Map<string, any>();
  const elements     = new Map<string, any>();
  const groups       = new Map<string, any>();

  for (const ct of [].concat(mergedSchema['xsd:complexType'] ?? mergedSchema['complexType'] ?? [])) {
    const name = ct['@_name'];
    if (name) complexTypes.set(name, ct);
  }
  for (const st of [].concat(mergedSchema['xsd:simpleType'] ?? mergedSchema['simpleType'] ?? [])) {
    const name = st['@_name'];
    if (name) simpleTypes.set(name, st);
  }
  for (const el of [].concat(mergedSchema['xsd:element'] ?? mergedSchema['element'] ?? [])) {
    const name = el['@_name'];
    if (name) elements.set(name, el);
  }
  for (const g of [].concat(mergedSchema['xsd:group'] ?? mergedSchema['group'] ?? [])) {
    const name = g['@_name'];
    if (name) groups.set(name, g);
  }

  return { complexTypes, simpleTypes, elements, groups };
}

export function resolveSearchElementName(
  opName: string,
  elements: Map<string, any>,
): { searchName: string; operationKey: string } | null {
  const withRequest = `${opName}_Request`;
  if (elements.has(withRequest)) {
    const key = opName.endsWith('_Request') ? opName.slice(0, -8) : opName;
    return { searchName: withRequest, operationKey: key };
  }
  if (elements.has(opName)) {
    const key = opName.endsWith('_Request') ? opName.slice(0, -8) : opName;
    return { searchName: opName, operationKey: key };
  }
  return null;
}

function xmlPathToMapperPath(xmlPath: string, requestRoot: string): string {
  const parts = xmlPath.split('/').filter(Boolean);
  if (parts.length === 0) return requestRoot;
  if (parts[0] === requestRoot) return parts.join('.');
  return [requestRoot, ...parts].join('.');
}

function isReferenceElementName(name: string): boolean {
  return name.endsWith('_Reference') || name.endsWith('Reference');
}

function collectComplexChildren(
  complexDef: any,
  index: XsdTypeIndex,
  visitedGroups: Set<string> = new Set(),
): Array<{ node: any; kind: 'element' | 'attribute'; fromChoice?: boolean }> {
  const out: Array<{ node: any; kind: 'element' | 'attribute'; fromChoice?: boolean }> = [];

  const pushFrom = (container: any, opts?: { fromChoice?: boolean }) => {
    if (!container || typeof container !== 'object') return;

    for (const el of [].concat(container['xsd:element'] ?? container['element'] ?? [])) {
      const refName = stripNs(el['@_ref'] as string | undefined);
      if (refName && !el['@_name']) {
        const global = index.elements.get(refName);
        if (global) {
          out.push({
            node: {
              ...global,
              '@_name': refName,
              '@_type': el['@_type'] ?? global['@_type'],
              '@_minOccurs': el['@_minOccurs'] ?? global['@_minOccurs'],
              '@_maxOccurs': el['@_maxOccurs'] ?? global['@_maxOccurs'],
            },
            kind: 'element',
            fromChoice: opts?.fromChoice,
          });
          continue;
        }
      }
      out.push({ node: el, kind: 'element', fromChoice: opts?.fromChoice });
    }

    for (const attr of [].concat(container['xsd:attribute'] ?? container['attribute'] ?? [])) {
      out.push({ node: attr, kind: 'attribute', fromChoice: opts?.fromChoice });
    }

    for (const seq of [].concat(container['xsd:sequence'] ?? container['sequence'] ?? [])) {
      pushFrom(seq, opts);
    }
    for (const ch of [].concat(container['xsd:choice'] ?? container['choice'] ?? [])) {
      pushFrom(ch, { fromChoice: true });
    }
    for (const all of [].concat(container['xsd:all'] ?? container['all'] ?? [])) {
      pushFrom(all, opts);
    }

    for (const g of [].concat(container['xsd:group'] ?? container['group'] ?? [])) {
      const groupRef = stripNs(g['@_ref'] as string | undefined);
      if (!groupRef || visitedGroups.has(groupRef)) continue;
      visitedGroups.add(groupRef);
      const groupDef = index.groups.get(groupRef);
      if (groupDef) pushFrom(groupDef);
    }

    const cc = container['xsd:complexContent'] ?? container['complexContent'];
    if (cc) {
      pushFrom(cc['xsd:extension'] ?? cc['extension'] ?? cc['xsd:restriction'] ?? cc['restriction']);
    }
    const sc = container['xsd:simpleContent'] ?? container['simpleContent'];
    if (sc) {
      pushFrom(sc['xsd:extension'] ?? sc['extension'] ?? sc['xsd:restriction'] ?? sc['restriction']);
    }
  };

  pushFrom(complexDef);
  return out;
}

/** Match XSLT: descendant element[@name='ID'] — includes group refs and element refs. */
function findIdElement(complexDef: any, index: XsdTypeIndex): any | undefined {
  if (!complexDef || typeof complexDef !== 'object') return undefined;

  for (const { node, kind } of collectComplexChildren(complexDef, index)) {
    if (kind !== 'element') continue;
    const elName = (node['@_name'] as string | undefined) ?? stripNs(node['@_ref'] as string | undefined);
    if (elName === 'ID') return node;
  }

  return undefined;
}

function resolveReferenceInfo(
  complexDef: any | undefined,
  index: XsdTypeIndex,
  mergedSchema: any,
  elementName: string,
  rawType: string,
): { isReference: boolean; idTypes: string[]; pattern: 'nested_id' | 'simple_content' } {
  const idElement = complexDef ? findIdElement(complexDef, index) : undefined;
  const looksLikeRef = isReferenceElementName(elementName) || !!idElement
    || !!(complexDef && (complexDef['xsd:simpleContent'] ?? complexDef['simpleContent']));

  if (!looksLikeRef) {
    return { isReference: false, idTypes: [], pattern: 'nested_id' };
  }

  const { idTypes, pattern } = resolveReferenceIdEnumerations(elementName, mergedSchema, {
    rawTypeName: rawType || undefined,
    complexDef,
    idElement,
    index,
  });

  return { isReference: true, idTypes, pattern };
}

function isXsdBuiltin(typeName: string): boolean {
  const t = typeName.toLowerCase();
  return t.startsWith('xsd:') || t.startsWith('xs:')
    || ['string', 'boolean', 'decimal', 'integer', 'date', 'datetime', 'time'].includes(t);
}

function resolveDataType(node: any, rawType: string, isReference: boolean): string {
  const inlineSt = node['xsd:simpleType'] ?? node['simpleType'];
  if (inlineSt) {
    const restriction = inlineSt['xsd:restriction'] ?? inlineSt['restriction'];
    const base = stripNs(restriction?.['@_base'] as string | undefined);
    if (base) return base;
  }
  if (isXsdBuiltin(rawType) || /^xsd:|^xs:/i.test(node['@_type'] ?? '')) {
    return stripNs(node['@_type'] as string | undefined) || rawType;
  }
  if (isReference) return 'Reference';
  return rawType || 'string';
}

function isRequired(node: any, kind: 'element' | 'attribute'): boolean {
  if (kind === 'attribute') {
    return (node['@_use'] as string | undefined) === 'required';
  }
  const mo = node['@_minOccurs'];
  return mo !== '0' && mo !== 0;
}

function pushFieldRow(
  rows: FlattenedFieldRow[],
  row: Omit<FlattenedFieldRow, 'typeEnumeration'> & { idTypes?: string[] },
): void {
  const enums = row.idTypes?.length ? row.idTypes : undefined;
  rows.push({
    ...row,
    idTypes: enums,
    typeEnumeration: enums,
  });
}

function appendXmlSegment(xmlPath: string, name: string, kind: 'element' | 'attribute'): string {
  const suffix = kind === 'attribute' ? `/@${name}` : `/${name}`;
  if (!xmlPath) return `/${name}`;
  if (xmlPath.endsWith(suffix) || xmlPath.endsWith(`/${name}`)) return xmlPath;
  return `${xmlPath}${suffix}`;
}

function ensureReferenceRowHasEnums(row: FlattenedFieldRow, mergedSchema: any): void {
  if (row.dataType !== 'Reference' && !isReferenceElementName(row.name)) return;
  if (row.idTypes?.length) return;
  const { idTypes, pattern } = resolveReferenceIdEnumerations(row.name, mergedSchema);
  row.idTypes = idTypes;
  row.typeEnumeration = idTypes;
  row.referencePattern = row.referencePattern ?? pattern;
  row.dataType = 'Reference';
}

const MAX_WALK_DEPTH = 24;

function walkNode(
  node: any,
  kind: 'element' | 'attribute',
  ctx: {
    xmlPath:           string;
    requestRoot:       string;
    index:             XsdTypeIndex;
    mergedSchema:      any;
    depth:             number;
    ancestorsRequired: boolean;
    optionalAncestors: string[];
  },
  rows: FlattenedFieldRow[],
): void {
  if (ctx.depth > MAX_WALK_DEPTH) return;
  const name = node['@_name'] as string | undefined;
  if (!name || SKIP_NAMES.has(name)) {
    if (kind === 'element') recurseIntoType(node, ctx, rows);
    return;
  }

  if (ctx.depth === 0 && name === ctx.requestRoot) {
    recurseIntoType(node, ctx, rows);
    return;
  }

  const locallyRequired = kind === 'element' ? isRequired(node, kind) : ctx.ancestorsRequired;
  const effectiveRequired = ctx.ancestorsRequired && locallyRequired;
  const childAncestorsRequired = kind === 'element'
    ? ctx.ancestorsRequired && locallyRequired
    : ctx.ancestorsRequired;

  const mo = kind === 'element' ? node['@_minOccurs'] : undefined;
  const locallyOptional = kind === 'element' && (mo === '0' || mo === 0);

  const rawType = stripNs(node['@_type'] as string | undefined);
  const complexDef = rawType ? ctx.index.complexTypes.get(rawType) : undefined;
  const refInfo = resolveReferenceInfo(complexDef, ctx.index, ctx.mergedSchema, name, rawType);
  const isReference = refInfo.isReference;

  const inlineSimple = node['xsd:simpleType'] ?? node['simpleType'];
  const hasSimpleContent = complexDef && (complexDef['xsd:simpleContent'] ?? complexDef['simpleContent']);
  const isSimpleType = isXsdBuiltin(rawType)
    || !!inlineSimple
    || !!hasSimpleContent
    || (kind === 'attribute');

  let segmentMapperPath = '';
  if (kind === 'element') {
    const xmlPath = appendXmlSegment(ctx.xmlPath, name, kind);
    segmentMapperPath = xmlPathToMapperPath(xmlPath, ctx.requestRoot).replace(/\/@/g, '.@');
  }

  const nextOptionalAncestors = locallyOptional && segmentMapperPath
    ? [...ctx.optionalAncestors, segmentMapperPath]
    : ctx.optionalAncestors;

  const rowOptionalAncestors = [...ctx.optionalAncestors];

  if (isSimpleType || isReference) {
    const xmlPath = appendXmlSegment(ctx.xmlPath, name, kind);
    const mapperPath = xmlPathToMapperPath(xmlPath, ctx.requestRoot).replace(/\/@/g, '.@');

    pushFieldRow(rows, {
      xmlPath,
      mapperPath,
      name,
      kind,
      dataType:         resolveDataType(node, rawType, isReference),
      idTypes:          isReference ? refInfo.idTypes : undefined,
      referencePattern: isReference ? refInfo.pattern : undefined,
      required:         effectiveRequired,
      minOccurs:        kind === 'element' ? String(mo ?? '1') : undefined,
      maxOccurs:        kind === 'element' ? String(node['@_maxOccurs'] ?? '1') : undefined,
      optionalAncestorPaths: rowOptionalAncestors,
    });
  } else if (kind === 'element' && rawType) {
    const xmlPath = appendXmlSegment(ctx.xmlPath, name, kind);
    const mapperPath = xmlPathToMapperPath(xmlPath, ctx.requestRoot).replace(/\/@/g, '.@');
    pushFieldRow(rows, {
      xmlPath,
      mapperPath,
      name,
      kind,
      dataType:  'object',
      required:  effectiveRequired,
      minOccurs: String(mo ?? '1'),
      maxOccurs: String(node['@_maxOccurs'] ?? '1'),
      optionalAncestorPaths: rowOptionalAncestors,
    });
  }

  if (kind === 'element') {
    recurseIntoType(node, {
      ...ctx,
      ancestorsRequired: childAncestorsRequired,
      optionalAncestors: nextOptionalAncestors,
    }, rows);
  }
}

function recurseIntoType(
  node: any,
  ctx: {
    xmlPath: string;
    requestRoot: string;
    index: XsdTypeIndex;
    mergedSchema: any;
    depth: number;
    ancestorsRequired: boolean;
    optionalAncestors: string[];
  },
  rows: FlattenedFieldRow[],
): void {
  if (ctx.depth > MAX_WALK_DEPTH) return;
  const name = node['@_name'] as string | undefined;
  const rawType = stripNs(node['@_type'] as string | undefined);
  if (!rawType) return;

  const complexDef = ctx.index.complexTypes.get(rawType);
  if (!complexDef) return;

  const nextPath = name ? appendXmlSegment(ctx.xmlPath, name, 'element') : ctx.xmlPath;
  if (nextPath === ctx.xmlPath && name) return;
  for (const child of collectComplexChildren(complexDef, ctx.index)) {
    const parentRequired = child.fromChoice ? false : ctx.ancestorsRequired;
    walkNode(child.node, child.kind, {
      ...ctx,
      xmlPath: nextPath,
      depth: ctx.depth + 1,
      ancestorsRequired: parentRequired,
    }, rows);
  }
}

export function flattenOperationFromSchema(
  mergedSchema: any,
  operationKey: string,
): FlattenedOperationIndex | null {
  const index = buildXsdTypeIndex(mergedSchema);
  const resolved = resolveSearchElementName(operationKey, index.elements);
  if (!resolved) return null;

  const rootEl = index.elements.get(resolved.searchName);
  if (!rootEl) return null;

  const rows: FlattenedFieldRow[] = [];
  walkNode(rootEl, 'element', {
    xmlPath:           '',
    requestRoot:       resolved.searchName,
    index,
    mergedSchema,
    depth:             0,
    ancestorsRequired: true,
    optionalAncestors: [],
  }, rows);

  for (const row of rows) {
    ensureReferenceRowHasEnums(row, mergedSchema);
  }

  return {
    operationName:      resolved.operationKey,
    requestRootElement: resolved.searchName,
    fields:             rows,
  };
}
