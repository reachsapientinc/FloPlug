/**
 * Build SOAP XML or REST JSON request body from resolved field mappings.
 */

import type { ActionDoc, ParsedField } from '@floplug/shared';
import { parseWorkdayIdCompositePath } from '@floplug/shared';
import { getValue, setValue } from '../utils/pathUtils.js';

const WORKDAY_NS     = 'urn:com.workday/bsvc';
const WORKDAY_PREFIX = 'wd';

/** Mapped source value is empty — Workday rejects reference/ID elements with no body. */
export function isBlankMappedValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return sanitizeXmlTextContent(value) === '';
  if (typeof value === 'number' && Number.isNaN(value)) return true;
  return false;
}

function isWorkdayReferenceElementName(name: string): boolean {
  return /_Reference$/i.test(name) || (/Reference$/i.test(name) && name.length > 'Reference'.length);
}

/** Collapse newlines/tabs in element text — sample data often has wrapped strings. */
function sanitizeXmlTextContent(raw: string): string {
  return raw
    .replace(/\r\n/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatXsdValue(value: unknown, xsdType?: string): string {
  const type = (xsdType ?? '').toLowerCase();
  if (type.includes('date') && !type.includes('datetime')) {
    const d = value instanceof Date ? value : new Date(String(value));
    return d.toISOString().slice(0, 10);
  }
  if (type.includes('datetime')) {
    const d = value instanceof Date ? value : new Date(String(value));
    return d.toISOString();
  }
  if (type.includes('boolean')) {
    return value === true || value === 'true' || value === 1 ? 'true' : 'false';
  }
  if (type.includes('decimal') || type.includes('integer')) {
    return String(Number(value));
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return sanitizeXmlTextContent(String(value ?? ''));
}

function fillTemplate(
  template: string,
  resolved: Record<string, unknown>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, token: string) => {
    const trimmed = token.trim();
    const path = trimmed.startsWith('cStream.')
      ? trimmed.slice('cStream.'.length)
      : trimmed;
    const val = getValue(resolved, path) ?? getValue({ cStream: resolved }, trimmed);
    if (val === undefined || val === null) return '';
    return typeof val === 'object' ? JSON.stringify(val) : String(val);
  });
}

function isXmlContentType(contentType?: string): boolean {
  const ct = (contentType ?? '').toLowerCase();
  return ct.includes('xml') || ct.includes('soap');
}

function isWorkdaySoapAction(actionDoc: ActionDoc): boolean {
  const useXml = isXmlContentType(actionDoc.contentType) || actionDoc.schemaSource === 'wsdl';
  if (!useXml) return false;
  const soapAction = (actionDoc.soapAction ?? '').toLowerCase();
  if (soapAction.includes('com.workday')) return true;
  const cid = (actionDoc.connectorId ?? '').toLowerCase();
  return cid.includes('workday');
}

function normalizeWorkdayVersion(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const t = raw.trim();
  return /^v/i.test(t) ? t : `v${t}`;
}

function isPutOperation(actionDoc: ActionDoc): boolean {
  const op = (actionDoc.operationName ?? actionDoc.id ?? '').toLowerCase();
  return op.startsWith('put_') || /^put[A-Z]/.test(actionDoc.operationName ?? '');
}

/** Default root attrs when not overridden by mapper (version, Add_Only on Put_*). */
function workdayRootAttributeDefaults(actionDoc: ActionDoc): Record<string, string> {
  const attrs: Record<string, string> = {};
  const version = normalizeWorkdayVersion(
    actionDoc.requestBinding?.servicesSchemaVersion,
  );
  if (version) attrs.version = version;
  if (isPutOperation(actionDoc)) {
    attrs.Add_Only = 'true';
  }
  return attrs;
}

/** Read `Put_*_Request.@Add_Only` (and other root `@attr`) from resolved mappings. */
export function extractMappedWorkdayRootAttributes(
  resolved: Record<string, unknown>,
  rootTag: string,
  fields: ParsedField[],
): Record<string, string> {
  const fieldMap = Object.fromEntries(fields.map(f => [f.path, f]));
  const attrs: Record<string, string> = {};
  const rootAttrPrefix = `${rootTag}.@`;

  for (const [path, value] of Object.entries(resolved)) {
    if (isBlankMappedValue(value)) continue;
    if (!path.startsWith(rootAttrPrefix)) continue;
    const attrName = path.slice(rootAttrPrefix.length);
    if (!attrName || attrName.includes('.')) continue;
    const field = fieldMap[path];
    attrs[attrName] = formatXsdValue(value, field?.xsdType);
  }
  return attrs;
}

function mergeWorkdayRootAttributes(
  actionDoc: ActionDoc,
  resolved: Record<string, unknown>,
  rootTag: string,
  fields: ParsedField[],
): Record<string, string> {
  const defaults = workdayRootAttributeDefaults(actionDoc);
  const mapped   = extractMappedWorkdayRootAttributes(resolved, rootTag, fields);
  return { ...defaults, ...mapped };
}

function stripRootFromPath(path: string, rootTag: string): string {
  if (path === rootTag) return '';
  const prefix = `${rootTag}.`;
  if (path.startsWith(prefix)) return path.slice(prefix.length);
  return path;
}

/**
 * Mapper may store wd:type as `...ID.@type.Revenue_Category_ID` (leaf click) or `...ID.@type`.
 * Normalize so XML builder always receives `...ID.@type` = token.
 */
export function normalizeWorkdayResolvedPaths(
  resolved: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...resolved };

  for (const [path, value] of Object.entries(resolved)) {
    const leaf = path.match(/^(.+)\.@type\.([A-Za-z0-9_]+)$/);
    if (leaf) {
      const typePath = `${leaf[1]}.@type`;
      if (out[typePath] === undefined || out[typePath] === null || out[typePath] === '') {
        out[typePath] = value ?? leaf[2];
      }
      continue;
    }
  }

  return out;
}

/**
 * Apply a mapped dot-path into a nested object, merging ID value + @type correctly.
 */
function applyResolvedPath(
  root: Record<string, unknown>,
  fullPath: string,
  value: unknown,
): void {
  if (!fullPath) return;
  const parts = fullPath.split('.');

  const attrIdx = parts.findIndex(p => p.startsWith('@'));
  if (attrIdx >= 0) {
    const elemKey     = parts[attrIdx - 1];
    const parentParts = parts.slice(0, attrIdx - 1);
    const attrName    = parts[attrIdx].slice(1);
    if (!elemKey) return;
    // Leaf paths like ID.@type.Revenue_Category_ID are normalized before build.
    if (parts.length > attrIdx + 1 && parts[attrIdx] === '@type') return;

    let parent: Record<string, unknown> = root;
    for (const p of parentParts) {
      if (!parent[p] || typeof parent[p] !== 'object' || Array.isArray(parent[p])) {
        parent[p] = {};
      }
      parent = parent[p] as Record<string, unknown>;
    }

    let elem = parent[elemKey];
    if (typeof elem !== 'object' || elem === null || Array.isArray(elem)) {
      const prev = elem;
      elem = (typeof prev === 'string' || typeof prev === 'number')
        ? { $: String(prev) }
        : {};
      parent[elemKey] = elem;
    }
    (elem as Record<string, unknown>)[`@${attrName}`] = value;
    return;
  }

  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length; i++) {
    const part   = parts[i];
    const isLast = i === parts.length - 1;

    if (isLast) {
      if (Array.isArray(value)) {
        cur[part] = value;
        return;
      }
      const existing = cur[part];
      if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
        (existing as Record<string, unknown>)['$'] = value;
      } else {
        cur[part] = value;
      }
      return;
    }

    if (!cur[part] || typeof cur[part] !== 'object' || Array.isArray(cur[part])) {
      cur[part] = {};
    }
    cur = cur[part] as Record<string, unknown>;
  }
}

interface IdCompositeEntry {
  typeToken: string;
  value:     unknown;
  xsdType?:  string;
}

/** Group …Reference.ID#Type (and legacy …ID.@type.Type) into multiple wd:ID elements. */
function partitionWorkdayIdComposites(
  resolved: Record<string, unknown>,
  rootTag: string,
  fieldMap: Record<string, ParsedField>,
): {
  plain:      Record<string, unknown>;
  composites: Map<string, IdCompositeEntry[]>;
} {
  const plainOut: Record<string, unknown> = {};
  const composites = new Map<string, IdCompositeEntry[]>();

  for (const [path, value] of Object.entries(resolved)) {
    if (isBlankMappedValue(value)) continue;

    const parsed = parseWorkdayIdCompositePath(path);
    if (parsed) {
      const rel = stripRootFromPath(parsed.idPath, rootTag);
      const list = composites.get(rel) ?? [];
      list.push({
        typeToken: parsed.typeToken,
        value,
        xsdType: fieldMap[path]?.xsdType,
      });
      composites.set(rel, list);
      continue;
    }

    const rel = stripRootFromPath(path, rootTag);
    const leafType = rel.match(/^(.+)\.@type\.([A-Za-z0-9_]+)$/);
    if (leafType) {
      const idRel = leafType[1];
      const list  = composites.get(idRel) ?? [];
      list.push({
        typeToken: leafType[2],
        value,
        xsdType: fieldMap[path]?.xsdType,
      });
      composites.set(idRel, list);
      continue;
    }

    plainOut[path] = value;
  }

  return { plain: plainOut, composites };
}

function idCompositeToXmlValue(entries: IdCompositeEntry[]): unknown | undefined {
  const valid = entries.filter(e => !isBlankMappedValue(e.value));
  if (valid.length === 0) return undefined;
  const objects = valid.map(e => ({
    '@type': e.typeToken,
    '$':     formatXsdValue(e.value, e.xsdType),
  }));
  return objects.length === 1 ? objects[0] : objects;
}

/** True when wd:ID (or array of IDs) has non-empty text content. */
function hasWorkdayIdTextContent(idVal: unknown): boolean {
  if (isBlankMappedValue(idVal)) return false;
  if (Array.isArray(idVal)) return idVal.some(hasWorkdayIdTextContent);
  if (typeof idVal !== 'object' || idVal === null) {
    return !isBlankMappedValue(idVal);
  }
  const rec = idVal as Record<string, unknown>;
  const text = rec.$ ?? rec._value;
  return text !== undefined && !isBlankMappedValue(text);
}

/**
 * Remove empty Workday *Reference wrappers and type-only wd:ID nodes before XML emission.
 */
export function pruneEmptyWorkdayReferences(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined || val === null) continue;

    if (key === 'ID') {
      if (!hasWorkdayIdTextContent(val)) continue;
      if (Array.isArray(val)) {
        const kept = val.filter(item => hasWorkdayIdTextContent(item));
        if (kept.length === 0) continue;
        out[key] = kept.length === 1 ? kept[0] : kept;
      } else if (typeof val === 'object') {
        out[key] = pruneEmptyWorkdayReferences(val as Record<string, unknown>);
      } else {
        out[key] = val;
      }
      continue;
    }

    if (isWorkdayReferenceElementName(key) && typeof val === 'object' && !Array.isArray(val)) {
      const pruned = pruneEmptyWorkdayReferences(val as Record<string, unknown>);
      if (pruned.ID !== undefined && !hasWorkdayIdTextContent(pruned.ID)) {
        delete pruned.ID;
      }
      const refText = pruned.$ ?? pruned._value;
      const hasRefText = refText !== undefined && !isBlankMappedValue(refText);
      const hasId      = pruned.ID !== undefined && hasWorkdayIdTextContent(pruned.ID);
      const onlyAttrs  = Object.keys(pruned).length > 0
        && Object.keys(pruned).every(k => k.startsWith('@'));
      if (!hasRefText && !hasId) continue;
      if (onlyAttrs) continue;
      if (Object.keys(pruned).length === 0) continue;
      out[key] = pruned;
      continue;
    }

    if (Array.isArray(val)) {
      const kept: unknown[] = [];
      for (const item of val) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const p = pruneEmptyWorkdayReferences(item as Record<string, unknown>);
          if (Object.keys(p).length > 0) kept.push(p);
        } else if (!isBlankMappedValue(item)) {
          kept.push(item);
        }
      }
      if (kept.length > 0) out[key] = kept;
      continue;
    }

    if (typeof val === 'object') {
      const pruned = pruneEmptyWorkdayReferences(val as Record<string, unknown>);
      if (Object.keys(pruned).length > 0) out[key] = pruned;
      continue;
    }

    if (!isBlankMappedValue(val)) out[key] = val;
  }

  return out;
}

function resolvedHasNonBlankIdValue(
  idRel: string,
  rootTag: string,
  plain: Record<string, unknown>,
  composites: Map<string, IdCompositeEntry[]>,
): boolean {
  const fullPrefix = rootTag ? `${rootTag}.` : '';
  for (const [path, value] of Object.entries(plain)) {
    const rel = stripRootFromPath(path, rootTag);
    if (rel === idRel || rel === `${idRel}.@type`) {
      if (!isBlankMappedValue(value)) return true;
    }
    if (path === `${fullPrefix}${idRel}` && !isBlankMappedValue(value)) return true;
  }
  const entries = composites.get(idRel);
  if (entries?.some(e => !isBlankMappedValue(e.value))) return true;
  return false;
}

function buildNestedFromResolved(
  resolved: Record<string, unknown>,
  rootTag: string,
  fields: ParsedField[],
): Record<string, unknown> {
  const fieldMap = Object.fromEntries(fields.map(f => [f.path, f]));
  const nested: Record<string, unknown> = {};

  const { plain, composites } = partitionWorkdayIdComposites(resolved, rootTag, fieldMap);

  const attrPaths: Array<[string, unknown]> = [];
  const valuePaths: Array<[string, unknown]> = [];

  for (const [path, value] of Object.entries(plain)) {
    if (isBlankMappedValue(value)) continue;
    if (path.startsWith(`${rootTag}.@`)) continue;
    const rel = stripRootFromPath(path, rootTag);
    if (!rel) continue;
    if (rel.startsWith('@')) continue;
    if (composites.has(rel)) continue;

    const field     = fieldMap[path];
    const formatted = formatXsdValue(value, field?.xsdType);
    if (isBlankMappedValue(formatted)) continue;

    if (rel.endsWith('.ID.@type') || (rel.includes('.@') && !rel.endsWith('.ID'))) {
      const idRel = rel.replace(/\.@type$/, '');
      if (!resolvedHasNonBlankIdValue(idRel, rootTag, plain, composites)) continue;
      attrPaths.push([rel, formatted]);
    } else if (rel.endsWith('.ID')) {
      if (!composites.has(rel)) {
        valuePaths.push([rel, formatted]);
      }
    } else if (isWorkdayReferenceElementName(rel.split('.').pop() ?? '')) {
      if (!isBlankMappedValue(value)) {
        valuePaths.push([rel, formatted]);
      }
    } else {
      valuePaths.push([rel, formatted]);
    }
  }

  for (const [rel, val] of attrPaths) applyResolvedPath(nested, rel, val);
  for (const [rel, val] of valuePaths) applyResolvedPath(nested, rel, val);

  for (const [idRel, entries] of composites) {
    const xmlVal = idCompositeToXmlValue(entries);
    if (xmlVal === undefined) continue;
    applyResolvedPath(nested, idRel, xmlVal);
  }

  const pruned = pruneEmptyWorkdayReferences(nested);
  return unwrapDuplicateRoot(pruned, rootTag);
}

function unwrapDuplicateRoot(
  nested: Record<string, unknown>,
  rootTag: string,
): Record<string, unknown> {
  if (Object.keys(nested).length === 1 && nested[rootTag] != null) {
    const inner = nested[rootTag];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      return inner as Record<string, unknown>;
    }
  }
  return nested;
}

function formatAttrs(attrs: Record<string, string>, prefix?: string): string {
  const p = prefix ? `${prefix}:` : '';
  return Object.entries(attrs)
    .map(([k, v]) => ` ${p}${k}="${escapeXml(v)}"`)
    .join('');
}

function escapeXml(s: string): string {
  return sanitizeXmlTextContent(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function qName(localName: string, prefix?: string): string {
  return prefix ? `${prefix}:${localName}` : localName;
}

function elementXml(key: string, val: unknown, indent: string, attrPrefix?: string): string {
  const tag = qName(key, attrPrefix);
  if (typeof val !== 'object' || val === null || Array.isArray(val)) {
    if (isBlankMappedValue(val)) return '';
    if (key === 'ID' || isWorkdayReferenceElementName(key)) return '';
    return `${indent}<${tag}>${escapeXml(String(val))}</${tag}>`;
  }
  const rec = val as Record<string, unknown>;
  const attrs: Record<string, string> = {};
  let text = '';
  const children: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (k.startsWith('@')) attrs[k.slice(1)] = String(v ?? '');
    else if (k === '$' || k === '_value') text = String(v ?? '');
    else children[k] = v;
  }
  const attrStr  = formatAttrs(attrs, attrPrefix);
  const childXml = objectToXml(children, indent, attrPrefix);
  if (childXml) return `${indent}<${tag}${attrStr}>${childXml}</${tag}>`;
  if (text && !isBlankMappedValue(text)) {
    return `${indent}<${tag}${attrStr}>${escapeXml(text)}</${tag}>`;
  }
  if (key === 'ID' || isWorkdayReferenceElementName(key)) return '';
  if (attrStr) return `${indent}<${tag}${attrStr}/>`;
  return `${indent}<${tag}/>`;
}

function objectToXml(
  obj: Record<string, unknown>,
  indent = '',
  attrPrefix?: string,
): string {
  let xml = '';
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      for (const item of val) xml += elementXml(key, item, indent, attrPrefix);
      continue;
    }
    xml += elementXml(key, val, indent, attrPrefix);
  }
  return xml;
}

function buildGenericXmlFromResolved(
  rootTag: string,
  resolved: Record<string, unknown>,
  fields: ParsedField[],
): string {
  const nested = buildNestedFromResolved(resolved, rootTag, fields);
  const inner  = objectToXml(nested);
  return `<${rootTag}>${inner}</${rootTag}>`;
}

function buildWorkdayXmlFromResolved(
  rootTag: string,
  resolved: Record<string, unknown>,
  fields: ParsedField[],
  actionDoc: ActionDoc,
): string {
  const nested     = buildNestedFromResolved(resolved, rootTag, fields);
  const rootAttrs  = mergeWorkdayRootAttributes(actionDoc, resolved, rootTag, fields);
  const rootAttrStr = formatAttrs(rootAttrs, WORKDAY_PREFIX);
  const inner      = objectToXml(nested, '', WORKDAY_PREFIX);
  const openTag    = qName(rootTag, WORKDAY_PREFIX);
  return (
    `<${openTag} xmlns:${WORKDAY_PREFIX}="${WORKDAY_NS}"${rootAttrStr}>`
    + inner
    + `</${openTag}>`
  );
}

export function buildRequestBody(
  actionDoc: ActionDoc,
  resolved: Record<string, unknown>,
): string {
  const normalized = isWorkdaySoapAction(actionDoc)
    ? normalizeWorkdayResolvedPaths(resolved)
    : resolved;

  if (actionDoc.bodyTemplate) {
    return fillTemplate(actionDoc.bodyTemplate, normalized);
  }

  const contentType = actionDoc.contentType ?? 'application/json';
  const fields      = actionDoc.inputSchema ?? [];
  const useXml      = isXmlContentType(contentType) || actionDoc.schemaSource === 'wsdl';

  if (useXml) {
    const rootTag =
      actionDoc.requestBinding?.requestRootElement
      ?? actionDoc.operationName
      ?? actionDoc.id;
    if (isWorkdaySoapAction(actionDoc)) {
      return buildWorkdayXmlFromResolved(rootTag, normalized, fields, actionDoc);
    }
    return buildGenericXmlFromResolved(rootTag, normalized, fields);
  }

  const nested: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(normalized)) {
    if (value !== undefined) setValue(nested, path, value);
  }
  return JSON.stringify(nested, null, 2);
}
