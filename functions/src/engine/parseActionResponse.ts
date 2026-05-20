/**
 * Normalise SOAP XML or REST JSON responses into a flat payload object.
 */

import { XMLParser } from 'fast-xml-parser';
import type { ActionDoc } from '@floplug/shared';
import { getValue, setValue } from '../utils/pathUtils.js';
import { FloActionSchemaError } from './floActionErrors.js';
import type { FloActionErrorContext } from './floActionErrors.js';

const xmlParser = new XMLParser({
  ignoreAttributes:    false,
  attributeNamePrefix: '@_',
  removeNSPrefix:      true,
  isArray: (name) => ['item', 'Worker', 'Response'].includes(name),
});

const NS_PREFIX_RE = /^(wd|sf|sap|ora|soapenv|soap|bsvc):/i;

function stripNsPrefixes(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(stripNsPrefixes);
  if (obj === null || typeof obj !== 'object') return obj;

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const cleanKey = key.replace(NS_PREFIX_RE, '');
    out[cleanKey] = stripNsPrefixes(val);
  }
  return out;
}

function unwrapSoapBody(parsed: Record<string, unknown>): Record<string, unknown> {
  const envelope = parsed.Envelope ?? parsed.envelope ?? parsed;
  const body     = (envelope as Record<string, unknown>).Body
                ?? (envelope as Record<string, unknown>).body
                ?? envelope;

  if (typeof body !== 'object' || body === null) {
    return { value: body };
  }

  const bodyObj = body as Record<string, unknown>;
  const keys    = Object.keys(bodyObj).filter(k => !k.startsWith('@_'));
  if (keys.length === 1) return bodyObj[keys[0]] as Record<string, unknown>;
  return bodyObj;
}

function applyResponseMapping(
  payload: Record<string, unknown>,
  actionDoc: ActionDoc,
): Record<string, unknown> {
  if (!actionDoc.responseMapping?.length) return payload;

  const out: Record<string, unknown> = {};
  for (const { responsePath, cStreamKey } of actionDoc.responseMapping) {
    const val = getValue(payload, responsePath);
    if (val !== undefined) setValue(out, cStreamKey, val);
  }
  return out;
}

export function parseActionResponse(
  rawResponse: string,
  actionDoc: ActionDoc,
  contentType: string,
  errorContext: FloActionErrorContext,
): Record<string, unknown> {
  let payload: Record<string, unknown>;

  const ct = (contentType ?? '').toLowerCase();

  try {
    if (ct.includes('xml')) {
      const parsed = xmlParser.parse(rawResponse) as Record<string, unknown>;
      const stripped = stripNsPrefixes(parsed) as Record<string, unknown>;
      payload = unwrapSoapBody(stripped) as Record<string, unknown>;
    } else {
      const parsed = JSON.parse(rawResponse);
      payload = (typeof parsed === 'object' && parsed !== null)
        ? parsed as Record<string, unknown>
        : { value: parsed };
    }
  } catch (err) {
    throw new FloActionSchemaError(
      `Failed to parse response for action "${actionDoc.id}"`,
      errorContext,
    );
  }

  const mapped = applyResponseMapping(payload, actionDoc);

  return {
    ...mapped,
    _actionStatus:  'success',
    _actionId:      actionDoc.id,
    _connectorId:   actionDoc.connectorId,
    _executedAt:    new Date().toISOString(),
  };
}
