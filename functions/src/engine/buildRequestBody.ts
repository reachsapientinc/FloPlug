/**
 * Build SOAP XML or REST JSON request body from resolved field mappings.
 */

import type { ActionDoc, ParsedField } from '@floplug/shared';
import { getValue, setValue } from '../utils/pathUtils.js';

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
  return String(value ?? '');
}

function fillTemplate(
  template: string,
  resolved: Record<string, unknown>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, token: string) => {
    const trimmed = token.trim();
    // {{cStream.field}} or {{field.path}}
    const path = trimmed.startsWith('cStream.')
      ? trimmed.slice('cStream.'.length)
      : trimmed;
    const val = getValue(resolved, path) ?? getValue({ cStream: resolved }, trimmed);
    if (val === undefined || val === null) return '';
    return typeof val === 'object' ? JSON.stringify(val) : String(val);
  });
}

function buildXmlFromResolved(
  operationName: string,
  resolved: Record<string, unknown>,
  fields: ParsedField[],
): string {
  const fieldMap = Object.fromEntries(fields.map(f => [f.path, f]));
  const nested: Record<string, unknown> = {};

  for (const [path, value] of Object.entries(resolved)) {
    if (value === undefined || value === null) continue;
    const field = fieldMap[path];
    const formatted = formatXsdValue(value, field?.xsdType);
    setValue(nested, path, formatted);
  }

  const inner = objectToXml(nested);
  return `<${operationName}>${inner}</${operationName}>`;
}

function objectToXml(obj: Record<string, unknown>, indent = ''): string {
  let xml = '';
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      for (const item of val) {
        xml += `${indent}<${key}>${typeof item === 'object' ? objectToXml(item as Record<string, unknown>, indent + '  ') : escapeXml(String(item))}</${key}>\n`;
      }
    } else if (typeof val === 'object') {
      xml += `${indent}<${key}>\n${objectToXml(val as Record<string, unknown>, indent + '  ')}${indent}</${key}>\n`;
    } else {
      xml += `${indent}<${key}>${escapeXml(String(val))}</${key}>\n`;
    }
  }
  return xml;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isXmlContentType(contentType?: string): boolean {
  const ct = (contentType ?? '').toLowerCase();
  return ct.includes('xml') || ct.includes('soap');
}

export function buildRequestBody(
  actionDoc: ActionDoc,
  resolved: Record<string, unknown>,
): string {
  if (actionDoc.bodyTemplate) {
    return fillTemplate(actionDoc.bodyTemplate, resolved);
  }

  const contentType = actionDoc.contentType ?? 'application/json';
  const fields      = actionDoc.inputSchema ?? [];

  if (isXmlContentType(contentType)) {
    const op = actionDoc.operationName ?? actionDoc.id;
    return buildXmlFromResolved(op, resolved, fields);
  }

  const nested: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(resolved)) {
    if (value !== undefined) setValue(nested, path, value);
  }
  return JSON.stringify(nested, null, 2);
}
