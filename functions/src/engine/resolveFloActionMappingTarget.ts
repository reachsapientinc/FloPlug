/**
 * Kit-aware mapping target — prefers FloKit data model XSD, falls back to action services schema.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { getStorage }   from 'firebase-admin/storage';
import type { ActionDoc, FloKitDoc, ParsedField } from '@floplug/shared';
import {
  COLLECTIONS, SUB_COLLECTIONS,
  resolveKitDataModelSchemaId,
} from '@floplug/shared';
import { CURRENT_SCHEMA_BUCKET } from '../constants.js';
import {
  listXsdRootElementNames,
  parseSchemaFields,
} from './actionSchemaParser.js';
import { XMLParser } from 'fast-xml-parser';
import { loadActionDocWithSchema } from './resolveActionSchema.js';

const db = getFirestore();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const storageBucket = getStorage().bucket(CURRENT_SCHEMA_BUCKET);

export type MappingTargetSchemaSource = 'dataModel' | 'services' | 'manual';

export interface MappingTargetFieldNode {
  path:      string;
  label:     string;
  required:  boolean;
  repeating: boolean;
  xsdType:   string;
  children?: MappingTargetFieldNode[];
}

export interface ResolveFloActionMappingTargetResult {
  fields:            ParsedField[];
  tree:              MappingTargetFieldNode[];
  actionId:          string;
  actionLabel:       string;
  floKitId:          string;
  connectorId:       string;
  schemaSource:      MappingTargetSchemaSource;
  dataModelSchemaId: string | null;
  operationName:     string;
  requiredCount:     number;
  fromCache:         boolean;
}

function countRequired(fields: ParsedField[]): number {
  return fields.filter(f => f.required).length;
}

/** Build a shallow tree from flat dot-paths for the mapper UI. */
export function buildFieldTree(fields: ParsedField[]): MappingTargetFieldNode[] {
  const root: MappingTargetFieldNode[] = [];
  const index = new Map<string, MappingTargetFieldNode>();

  for (const f of fields) {
    const parts = f.path.split('.');
    let parentList = root;
    let prefix = '';

    for (let i = 0; i < parts.length; i++) {
      const part   = parts[i];
      prefix       = prefix ? `${prefix}.${part}` : part;
      const isLeaf = i === parts.length - 1;

      if (isLeaf) {
        const node: MappingTargetFieldNode = {
          path:      f.path,
          label:     f.label || part,
          required:  f.required,
          repeating: f.repeating,
          xsdType:   f.xsdType,
        };
        parentList.push(node);
        index.set(f.path, node);
        break;
      }

      let branch = index.get(prefix);
      if (!branch) {
        branch = {
          path:      prefix,
          label:     part.replace(/_/g, ' '),
          required:  false,
          repeating: false,
          xsdType:   'object',
          children:  [],
        };
        parentList.push(branch);
        index.set(prefix, branch);
      }
      if (!branch.children) branch.children = [];
      parentList = branch.children;
    }
  }

  return root;
}

async function loadKit(connectorId: string, floKitId: string): Promise<FloKitDoc | null> {
  const snap = await db
    .doc(`${COLLECTIONS.CONNECTORS}/${connectorId}/${SUB_COLLECTIONS.FLOKITS}/${floKitId}`)
    .get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as FloKitDoc;
}

async function loadKitAction(connectorId: string, floKitId: string, actionId: string): Promise<ActionDoc | null> {
  const kitPath = `${COLLECTIONS.CONNECTORS}/${connectorId}/${SUB_COLLECTIONS.FLOKITS}/${floKitId}/${SUB_COLLECTIONS.FLOKITACTIONS}/${actionId}`;
  const kitSnap = await db.doc(kitPath).get();
  if (kitSnap.exists) {
    return { id: kitSnap.id, ...kitSnap.data() } as ActionDoc;
  }
  const globalSnap = await db
    .doc(`${COLLECTIONS.CONNECTORS}/${connectorId}/${SUB_COLLECTIONS.ACTIONS}/${actionId}`)
    .get();
  if (globalSnap.exists) {
    return { id: globalSnap.id, ...globalSnap.data() } as ActionDoc;
  }
  return null;
}

const xmlParser = new XMLParser({
  ignoreAttributes:    false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['xsd:element', 'element', 'xsd:complexType', 'complexType'].includes(name),
});

async function parseFieldsFromSchemaDoc(
  connectorId: string,
  schemaId:    string,
  schemaType:  string,
  actionId:    string,
  operationName: string,
): Promise<ParsedField[]> {
  const schemaSnap = await db
    .doc(`${COLLECTIONS.CONNECTORS}/${connectorId}/${SUB_COLLECTIONS.SCHEMAS}/${schemaId}`)
    .get();
  if (!schemaSnap.exists) {
    throw new Error(`Schema document not found: ${schemaId}`);
  }
  const schemaDoc = schemaSnap.data()!;
  const [fileContents] = await storageBucket.file(schemaDoc.storagePath as string).download();
  const rawSchema      = fileContents.toString('utf-8');
  const effectiveType  = (schemaDoc.schemaType as string) ?? schemaType;

  if (effectiveType === 'xsd') {
    const parsed = xmlParser.parse(rawSchema);
    const xsdSchema = parsed['xsd:schema'] ?? parsed['schema'] ?? {};
    const roots = listXsdRootElementNames(xsdSchema);
    console.log(
      `[resolveFloActionMappingTarget] XSD ${schemaId}: ${roots.length} root elements, ` +
      `actionId=${actionId} operationName=${operationName}`,
    );
    return parseSchemaFields(rawSchema, 'xsd', operationName, actionId);
  }

  return parseSchemaFields(rawSchema, effectiveType, operationName, actionId);
}

export async function resolveFloActionMappingTarget(
  connectorId: string,
  floKitId:    string,
  actionId:    string,
): Promise<ResolveFloActionMappingTargetResult> {
  const cacheRef = db.doc(
    `${COLLECTIONS.CONNECTORS}/${connectorId}/${SUB_COLLECTIONS.FLOKITS}/${floKitId}/${SUB_COLLECTIONS.FLOKITACTIONS}/${actionId}/Cache/mappingTarget`,
  );

  try {
    const cached = await cacheRef.get();
    if (cached.exists) {
      const data  = cached.data()!;
      const ageMs = Date.now() - (data.cachedAt?.toMillis?.() ?? 0);
      if (ageMs < CACHE_TTL_MS && Array.isArray(data.fields) && data.fields.length > 0) {
        const fields = data.fields as ParsedField[];
        return {
          fields,
          tree:              buildFieldTree(fields),
          actionId,
          actionLabel:       (data.actionLabel as string) ?? actionId,
          floKitId,
          connectorId,
          schemaSource:      (data.schemaSource as MappingTargetSchemaSource) ?? 'dataModel',
          dataModelSchemaId: (data.dataModelSchemaId as string) ?? null,
          operationName:     (data.operationName as string) ?? actionId,
          requiredCount:     countRequired(fields),
          fromCache:         true,
        };
      }
    }
  } catch {
    // continue
  }

  const kit = await loadKit(connectorId, floKitId);
  const kitAction = await loadKitAction(connectorId, floKitId, actionId);
  const connectorAction = await loadActionDocWithSchema({ connectorId, actionId, floKitId }).catch(() => null);

  const operationName =
    kitAction?.operationName
    ?? connectorAction?.operationName
    ?? actionId;
  const actionLabel =
    kitAction?.label
    ?? connectorAction?.label
    ?? actionId;

  let fields: ParsedField[] = [];
  let schemaSource: MappingTargetSchemaSource = 'services';
  let dataModelSchemaId: string | null = null;

  const dataModelId = kit ? resolveKitDataModelSchemaId(kit) : '';

  if (dataModelId) {
    try {
      fields = await parseFieldsFromSchemaDoc(
        connectorId, dataModelId, 'xsd', actionId, operationName,
      );
      schemaSource      = 'dataModel';
      dataModelSchemaId = dataModelId;
    } catch (err) {
      console.warn(`[resolveFloActionMappingTarget] data model parse failed: ${err}`);
    }
  }

  if (fields.length === 0 && connectorAction?.schemaRef) {
    try {
      const svcType = connectorAction.schemaSource === 'wsdl' ? 'wsdl' : 'xsd';
      fields = await parseFieldsFromSchemaDoc(
        connectorId,
        connectorAction.schemaRef,
        svcType,
        actionId,
        operationName,
      );
      if (fields.length > 0) {
        schemaSource = 'services';
        console.log(`[resolveFloActionMappingTarget] fallback to services schema ${connectorAction.schemaRef}`);
      }
    } catch (err) {
      console.warn(`[resolveFloActionMappingTarget] services schema fallback failed: ${err}`);
    }
  }

  if (fields.length === 0 && kitAction?.inputSchema?.length) {
    fields            = kitAction.inputSchema;
    schemaSource      = 'manual';
    dataModelSchemaId = dataModelId || null;
  }

  if (fields.length === 0 && connectorAction?.inputSchema?.length) {
    fields       = connectorAction.inputSchema;
    schemaSource = connectorAction.schemaSource === 'manual' ? 'manual' : 'services';
  }

  if (fields.length === 0 && connectorAction) {
    fields       = connectorAction.inputSchema ?? [];
    schemaSource = 'services';
  }

  if (fields.length === 0) {
    throw new Error(
      `No mapping fields found for action "${actionId}" in kit "${floKitId}". ` +
      'Ensure the kit has a data model schema or the action has a services schema.',
    );
  }

  const result: ResolveFloActionMappingTargetResult = {
    fields,
    tree: buildFieldTree(fields),
    actionId,
    actionLabel,
    floKitId,
    connectorId,
    schemaSource,
    dataModelSchemaId,
    operationName,
    requiredCount: countRequired(fields),
    fromCache:     false,
  };

  try {
    await cacheRef.set({
      fields,
      actionLabel,
      schemaSource,
      dataModelSchemaId,
      operationName,
      cachedAt: new Date(),
    });
  } catch {
    // non-fatal
  }

  return result;
}
