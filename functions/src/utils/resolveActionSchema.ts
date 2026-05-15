/**
 * functions/src/utils/resolveActionSchema.ts
 *
 * Callable Cloud Function — parses a WSDL/XSD/OpenAPI schema stored in
 * Cloud Storage and returns a flat list of fields for a specific operation.
 *
 * Results are cached in Firestore for 24 hours to avoid re-parsing on
 * every designer open.
 *
 * Path: functions/src/utils/resolveActionSchema.ts
 * (Exported and registered in functions/src/index.ts)
 *
 * Client call:
 *   const fn = httpsCallable(functions, 'resolveActionSchema');
 *   const { data } = await fn({ connectorId: 'workday', actionId: 'Put_Worker' });
 *   // data.fields: ParsedField[]
 *   // data.fromCache: boolean
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
//import * as admin from 'firebase-admin';
import { getFirestore }       from 'firebase-admin/firestore';
//import { getStorage }         from 'firebase-admin/storage';
import { XMLParser }          from 'fast-xml-parser';
import {CURRENT_SCHEMA_BUCKET} from '../constants.js';
import {ParsedField} from '@floplug/shared';
import { getStorage } from "firebase-admin/storage";


const db      = getFirestore();

//const bucketName = 'flowplug-dev'; // This should match your VITE_SCHEMA_BUCKET name
console.log(`[resolveActionSchema] CURRENT_SCHEMA_BUCKET : ${CURRENT_SCHEMA_BUCKET}`);
const storageBucket   = getStorage().bucket(CURRENT_SCHEMA_BUCKET);

// ─────────────────────────────────────────────────────────────────────────────
// ParsedField — the shape returned to the designer
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: This is the server-side definition. The frontend mirrors it in
// src/types/AuthConnectorTypes.ts as an identical interface.

// export interface ParsedField {
//   path:        string;     // dot-path: "Worker_Data.Personal_Data.Name_Data.First_Name"
//   label:       string;     // human-readable: "First Name"
//   xsdType:     string;     // "xsd:string" | "xsd:date" | "xsd:decimal" | ...
//   required:    boolean;
//   repeating:   boolean;
//   enumValues?: string[];
//   helpText?:   string;
// }

// ─────────────────────────────────────────────────────────────────────────────
// XML parser (shared, module-level)
// ─────────────────────────────────────────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes:    false,
  attributeNamePrefix: '@_',
  isArray: (name) => [
    'xsd:element',
    'xsd:complexType',
    'xsd:sequence',
    'xsd:enumeration',
    'wsdl:message',
    'wsdl:operation',
    'element',
    'complexType',
    'sequence',
  ].includes(name),
});

// ─────────────────────────────────────────────────────────────────────────────
// WSDL parser
// ─────────────────────────────────────────────────────────────────────────────

function parseWsdlOperation(
  wsdlContent:   string,
  operationName: string,
): ParsedField[] {
  const parsed      = xmlParser.parse(wsdlContent);
  const definitions = parsed['wsdl:definitions'] ?? parsed['definitions'] ?? {};
  const types       = definitions['wsdl:types']?.['xsd:schema']
                   ?? definitions['types']?.['schema']
                   ?? {};

  // Find the input message for this operation
  const portType   = definitions['wsdl:portType'] ?? definitions['portType'] ?? {};
  const operations: any[] = [].concat(portType['wsdl:operation'] ?? portType['operation'] ?? []);
  const op         = operations.find((o: any) => o['@_name'] === operationName);

  if (!op) {
    throw new HttpsError(
      'not-found',
      `Operation "${operationName}" not found in WSDL. ` +
      `Available: ${operations.map((o: any) => o['@_name']).join(', ')}`,
    );
  }

  const inputMsgRef  = op['wsdl:input']?.['@_message'] ?? op['input']?.['@_message'] ?? '';
  const inputMsgName = inputMsgRef.split(':').pop() ?? '';

  const messages: any[] = [].concat(
    definitions['wsdl:message'] ?? definitions['message'] ?? []
  );
  const inputMsg   = messages.find((m: any) => m['@_name'] === inputMsgName);
  const partEl     = inputMsg?.['wsdl:part']?.['@_element']
                  ?? inputMsg?.['part']?.['@_element'] ?? '';
  const rootElement = partEl.split(':').pop() ?? '';

  return walkXsdElement(types, rootElement, '', [], 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// XSD parser
// ─────────────────────────────────────────────────────────────────────────────

function parseXsdElement(
  xsdContent:  string,
  elementName: string,
): ParsedField[] {
  const parsed = xmlParser.parse(xsdContent);
  const schema = parsed['xsd:schema'] ?? parsed['schema'] ?? {};
  return walkXsdElement(schema, elementName, '', [], 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAPI parser (REST connectors)
// ─────────────────────────────────────────────────────────────────────────────

function parseOpenApiOperation(
  specContent:   string,
  operationName: string,
): ParsedField[] {
  const spec    = JSON.parse(specContent);
  const results: ParsedField[] = [];

  // Find operation by operationId
  for (const [, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const [, operation] of Object.entries(pathItem as any)) {
      if ((operation as any).operationId !== operationName) continue;
      const bodySchema = (operation as any).requestBody?.content?.['application/json']?.schema;
      if (bodySchema) {
        walkJsonSchema(bodySchema, '', results, spec.components?.schemas ?? {});
      }
      return results;
    }
  }

  throw new HttpsError('not-found', `Operation "${operationName}" not found in OpenAPI spec`);
}

function walkJsonSchema(
  schema:     any,
  pathPrefix: string,
  results:    ParsedField[],
  $defs:      Record<string, any>,
  depth = 0,
): void {
  if (depth > 12) return;

  // Resolve $ref
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
        path,
        label:      toLabel(key),
        xsdType,
        required:   isRequired,
        repeating,
        enumValues: propSchema.enum,
        helpText:   propSchema.description,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// XSD tree walker
// ─────────────────────────────────────────────────────────────────────────────

function walkXsdElement(
  schema:      any,
  elementName: string,
  pathPrefix:  string,
  results:     ParsedField[],
  depth:       number,
): ParsedField[] {
  if (depth > 12) return results;

  const elements: any[] = [].concat(
    schema['xsd:element'] ?? schema['element'] ?? []
  );
  const el = elements.find((e: any) => e['@_name'] === elementName);
  if (!el) return results;

  const required  = el['@_minOccurs'] !== '0' && el['@_minOccurs'] !== 0;
  const repeating = el['@_maxOccurs'] === 'unbounded'
                 || Number(el['@_maxOccurs'] ?? 1) > 1;
  const xsdType   = el['@_type'] ?? 'xsd:string';
  const docNode   = el['xsd:annotation']?.['xsd:documentation']
                 ?? el['annotation']?.['documentation'];
  const path      = pathPrefix ? `${pathPrefix}.${elementName}` : elementName;

  const complexContent = el['xsd:complexType']
                      ?? el['complexType']
                      ?? el['xsd:sequence']
                      ?? el['sequence'];

  if (!complexContent) {
    // Simple leaf field — check for enumeration on type
    const complexTypes: any[] = [].concat(
      schema['xsd:complexType'] ?? schema['complexType'] ?? []
    );
    const typeName = xsdType.split(':').pop() ?? '';
    const typeDef  = complexTypes.find((t: any) => t['@_name'] === typeName);
    const enums: string[] = typeDef?.['xsd:restriction']?.['xsd:enumeration']
      ?.map((e: any) => e['@_value'])
      ?? typeDef?.['restriction']?.['enumeration']
      ?.map((e: any) => e['@_value'])
      ?? [];

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

  // Complex type — recurse into children
  const sequence = complexContent['xsd:sequence']
                ?? complexContent['sequence']
                ?? complexContent;
  const children: any[] = [].concat(
    sequence['xsd:element'] ?? sequence['element'] ?? []
  );

  for (const child of children) {
    const childName: string = child['@_name'] ?? '';
    if (childName) {
      walkXsdElement(schema, childName, path, results, depth + 1);
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** "First_Name" → "First Name",  "firstName" → "First Name" */
function toLabel(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloud Function export
// ─────────────────────────────────────────────────────────────────────────────

export const resolveActionSchema = onCall(async (request) => {
  const { connectorId, actionId } = request.data as {
    connectorId: string;
    actionId:    string;
  };

  if (!connectorId || !actionId) {
    throw new HttpsError('invalid-argument', 'connectorId and actionId are required');
  }

  // ── Check Firestore cache (24h TTL) ────────────────────────────────────────
  const cacheRef = db.doc(
    `FloPlugConnectors/${connectorId}/Actions/${actionId}/Cache/parsedSchema`
  );
  try {
    const cached = await cacheRef.get();
    if (cached.exists) {
      const data  = cached.data()!;
      const ageMs = Date.now() - data.cachedAt.toMillis();
      if (ageMs < 24 * 60 * 60 * 1000) {
        return { fields: data.fields as ParsedField[], fromCache: true };
      }
    }
  } catch {
    // Cache miss is fine — continue to parse
  }

  // ── Load action document ───────────────────────────────────────────────────
  const actionSnap = await db
    .doc(`FloPlugConnectors/${connectorId}/Actions/${actionId}`)
    .get();
  if (!actionSnap.exists) {
    throw new HttpsError('not-found', `Action not found: ${connectorId}/${actionId}`);
  }
  const action = actionSnap.data()!;

  // If action has a manual inputSchema, return it directly
  if (action.schemaSource === 'manual' && Array.isArray(action.inputSchema)) {
    return { fields: action.inputSchema as ParsedField[], fromCache: false };
  }

  if (!action.schemaRef) {
    throw new HttpsError(
      'failed-precondition',
      `Action "${actionId}" has no schemaRef. Set schemaSource to "manual" or upload a schema.`,
    );
  }

  // ── Load schema document ───────────────────────────────────────────────────
  const schemaSnap = await db
    .doc(`FloPlugConnectors/${connectorId}/Schemas/${action.schemaRef}`)
    .get();
  if (!schemaSnap.exists) {
    throw new HttpsError('not-found', `Schema not found: ${action.schemaRef}`);
  }
  const schema = schemaSnap.data()!;

  // ── Fetch raw schema file from Cloud Storage ───────────────────────────────
  //const bucket           = storage.bucket('floplug-schemas');
  const [fileContents]   = await storageBucket.file(schema.storagePath as string).download();
  const rawSchema        = fileContents.toString('utf-8');

  // ── Parse based on schema type ─────────────────────────────────────────────
  let fields: ParsedField[];
  const schemaType: string = schema.schemaType ?? 'wsdl';

  switch (schemaType) {
    case 'wsdl':
      fields = parseWsdlOperation(rawSchema, action.operationName as string);
      break;
    case 'xsd':
      fields = parseXsdElement(rawSchema, action.operationName as string);
      break;
    case 'openapi':
      fields = parseOpenApiOperation(rawSchema, action.operationName as string);
      break;
    default:
      throw new HttpsError('unimplemented', `Unsupported schema type: ${schemaType}`);
  }

  // ── Cache in Firestore ─────────────────────────────────────────────────────
  try {
    await cacheRef.set({ fields, cachedAt: new Date() });
  } catch {
    // Cache write failure is non-fatal
  }

  return { fields, fromCache: false };
});
