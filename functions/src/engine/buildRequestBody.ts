/**
 * Build SOAP XML or REST JSON request body from resolved field mappings.
 */

import type { ActionDoc, ParsedField } from '@floplug/shared';
import { parseWorkdayIdCompositePath } from '@floplug/shared';
import { getValue, setValue } from '../utils/pathUtils.js';

const WORKDAY_NS     = 'urn:com.workday/bsvc';
const WORKDAY_PREFIX = 'wd';

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

/** Infer Workday root attributes (version, Add_Only on Put_*). */
function workdayRootAttributes(actionDoc: ActionDoc): Record<string, string> {
  const attrs: Record<string, string> = {};
  const version = normalizeWorkdayVersion(
    actionDoc.requestBinding?.servicesSchemaVersion,
  );
  if (version) attrs.version = version;

  const op = (actionDoc.operationName ?? actionDoc.id ?? '').toLowerCase();
  if (op.startsWith('put_') || /^put[A-Z]/.test(actionDoc.operationName ?? '')) {
    attrs.Add_Only = 'true';
  }
  return attrs;
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
    if (value === undefined || value === null) continue;

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

function idCompositeToXmlValue(entries: IdCompositeEntry[]): unknown {
  const objects = entries.map(e => ({
    '@type': e.typeToken,
    '$':     formatXsdValue(e.value, e.xsdType),
  }));
  return objects.length === 1 ? objects[0] : objects;
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
    if (value === undefined || value === null) continue;
    const rel = stripRootFromPath(path, rootTag);
    if (!rel) continue;
    if (composites.has(rel)) continue;

    const field     = fieldMap[path];
    const formatted = formatXsdValue(value, field?.xsdType);
    if (rel.endsWith('.ID.@type') || (rel.includes('.@') && !rel.endsWith('.ID'))) {
      attrPaths.push([rel, formatted]);
    } else if (rel.endsWith('.ID')) {
      const typePath = `${path}.@type`;
      const typeVal  = plain[typePath];
      if (typeVal !== undefined && typeVal !== null && !composites.has(rel)) {
        valuePaths.push([rel, formatted]);
      } else if (!composites.has(rel)) {
        valuePaths.push([rel, formatted]);
      }
    } else {
      valuePaths.push([rel, formatted]);
    }
  }

  for (const [rel, val] of attrPaths) applyResolvedPath(nested, rel, val);
  for (const [rel, val] of valuePaths) applyResolvedPath(nested, rel, val);

  for (const [idRel, entries] of composites) {
    applyResolvedPath(nested, idRel, idCompositeToXmlValue(entries));
  }

  return unwrapDuplicateRoot(nested, rootTag);
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
  if (text) return `${indent}<${tag}${attrStr}>${escapeXml(text)}</${tag}>`;
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
  const rootAttrs  = workdayRootAttributes(actionDoc);
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
