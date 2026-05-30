/**
 * Kit-aware mapping target — prefers FloKit data model XSD, falls back to action services schema.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { getStorage }   from 'firebase-admin/storage';
import type { ActionDoc, FloKitDoc, ParsedField } from '@floplug/shared';
import {
  COLLECTIONS, SUB_COLLECTIONS,
  resolveKitDataModelSchemaId,
  buildWorkdayIdCompositePath,
  isFieldEffectivelyRequired,
} from '@floplug/shared';
import { CURRENT_SCHEMA_BUCKET } from '../constants.js';
import { loadActionDocWithSchema } from './resolveActionSchema.js';
import { parsedFieldsFromSchemaFlatten } from './loadSchemaFlattenIndex.js';
import { XMLParser } from 'fast-xml-parser';

const db = getFirestore();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Bump when mapping field semantics change — forces mapper cache refresh. */
const MAPPING_TARGET_CACHE_VERSION = 2;
const storageBucket = getStorage().bucket(CURRENT_SCHEMA_BUCKET);

export type MappingTargetSchemaSource = 'dataModel' | 'services' | 'manual';

export interface MappingTargetFieldNode {
  path:      string;
  label:     string;
  required:  boolean;
  repeating: boolean;
  xsdType:   string;
  children?: MappingTargetFieldNode[];
  /** Workday ID branch — value at `path`, type options in children */
  fieldKind?:   'normal' | 'idBranch' | 'idTypeOption' | 'idTypeMissing';
  idValuePath?: string;
  idTypeValue?: string;
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
  return fields.filter(f => {
    if (/\.@type\.[^.]+$/.test(f.path)) return false;
    if (f.xsdType === 'object') return false;
    return isFieldEffectivelyRequired(f, fields, {}, []);
  }).length;
}

/** One mappable leaf per (ID + wd:type) — not a shared ID row for all types. */
export function expandIdTypeOptionFields(fields: ParsedField[]): ParsedField[] {
  const extra: ParsedField[] = [];
  for (const f of fields) {
    if (!f.path.endsWith('.@type') || !f.enumValues?.length) continue;
    const idPath = f.path.replace(/\.@type$/i, '');
    for (const ev of f.enumValues) {
      const compositePath = buildWorkdayIdCompositePath(idPath, ev);
      extra.push({
        path:     compositePath,
        label:    ev.replace(/_/g, ' '),
        xsdType:  'enumeration',
        required: false,
        repeating: false,
        helpText: `wd:type="${ev}" — map value for this type only`,
      });
    }
  }
  return extra.length > 0 ? [...fields, ...extra] : fields;
}

function attachIdTypeBranches(
  nodes: MappingTargetFieldNode[],
  idTypeEnums: Map<string, string[]>,
  idPathsMissingEnums: Set<string>,
): MappingTargetFieldNode[] {
  return nodes.map(n => {
    const enums = idTypeEnums.get(n.path)
      ?? idTypeEnums.get(`${n.path}.ID`);
    const nested = n.children ? attachIdTypeBranches(n.children, idTypeEnums, idPathsMissingEnums) : undefined;
    const missing = idPathsMissingEnums.has(n.path)
      || idPathsMissingEnums.has(`${n.path}.ID`);

    if (!enums?.length && !missing) {
      return { ...n, children: nested };
    }

    const idPath = n.path.endsWith('.ID') ? n.path : `${n.path}.ID`;
    const enumNodes: MappingTargetFieldNode[] = enums?.length
      ? enums.map(ev => {
        const compositePath = buildWorkdayIdCompositePath(idPath, ev);
        return {
          path:        compositePath,
          label:       ev.replace(/_/g, ' '),
          required:    false,
          repeating:   false,
          xsdType:     'enumeration',
          fieldKind:   'idTypeOption' as const,
          idValuePath: compositePath,
          idTypeValue: ev,
        };
      })
      : [{
        path:        `${n.path}.__type_unresolved__`,
        label:       'Set wd:type in panel below (click here)',
        required:    false,
        repeating:   false,
        xsdType:     'hint',
        fieldKind:   'idTypeMissing' as const,
        idValuePath: n.path,
      }];

    return {
      ...n,
      fieldKind: 'idBranch',
      children:  enumNodes,
    };
  });
}

/** Build a shallow tree from flat dot-paths for the mapper UI. */
export function buildFieldTree(fields: ParsedField[]): MappingTargetFieldNode[] {
  const skipAtType = new Set<string>();
  const idTypeEnums = new Map<string, string[]>();
  const idPathsMissingEnums = new Set<string>();

  for (const f of fields) {
    if (!f.path.endsWith('.@type')) continue;
    const idPath = f.path.replace(/\.@type$/, '');
    skipAtType.add(f.path);
    if ((f.enumValues?.length ?? 0) > 0) {
      idTypeEnums.set(idPath, f.enumValues!);
    } else {
      idPathsMissingEnums.add(idPath);
    }
  }

  const idPathsWithComposites = new Set<string>();
  for (const f of fields) {
    if (f.path.endsWith('.@type') && f.enumValues?.length) {
      idPathsWithComposites.add(f.path.replace(/\.@type$/i, ''));
    }
  }

  const treeFields = fields.filter(f => {
    if (skipAtType.has(f.path)) return false;
    if (f.path.endsWith('.ID') && idPathsWithComposites.has(f.path)) return false;
    if (/\.@type\.[^.]+$/.test(f.path)) return false;
    return true;
  });
  const root: MappingTargetFieldNode[] = [];
  const index = new Map<string, MappingTargetFieldNode>();

  for (const f of treeFields) {
    if (/\.@type\.[^.]+$/.test(f.path)) continue;

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

  return attachIdTypeBranches(root, idTypeEnums, idPathsMissingEnums);
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
  isArray: (name) => [
    'xsd:element', 'element',
    'xsd:complexType', 'complexType',
    'xsd:group', 'group',
    'xsd:import', 'import',
    'xsd:include', 'include',
  ].includes(name),
});

function resolveWsdlInputRootElement(wsdlRaw: string, operationName: string): string | null {
  const parsed = xmlParser.parse(wsdlRaw);
  const definitions = parsed['wsdl:definitions'] ?? parsed['definitions'] ?? {};
  const portTypes = [].concat(definitions['wsdl:portType'] ?? definitions['portType'] ?? []);
  const messages = [].concat(definitions['wsdl:message'] ?? definitions['message'] ?? []);

  for (const pt of portTypes) {
    const operations = [].concat((pt as any)['wsdl:operation'] ?? (pt as any)['operation'] ?? []);
    const op = operations.find((o: any) => (o?.['@_name'] as string | undefined) === operationName);
    if (!op) continue;

    const inputRefUnknown: unknown =
      (op as any)['wsdl:input']?.['@_message']
      ?? (op as any)['input']?.['@_message'];
    const inputMsgName = typeof inputRefUnknown === 'string'
      ? inputRefUnknown.split(':').pop()
      : '';
    if (!inputMsgName) return null;

    const inputMsg = messages.find((m: any) => m?.['@_name'] === inputMsgName);
    if (!inputMsg) return null;

    const partElUnknown: unknown =
      (inputMsg as any)?.['wsdl:part']?.['@_element']
      ?? (inputMsg as any)?.['part']?.['@_element'];
    if (!partElUnknown || typeof partElUnknown !== 'string') return null;

    return partElUnknown.split(':').pop() ?? null;
  }

  return null;
}

async function resolveWsdlInputRootFromSchemaRef(
  connectorId: string,
  wsdlSchemaRef: string,
  operationName: string,
): Promise<string | null> {
  const schemaSnap = await db
    .doc(`${COLLECTIONS.CONNECTORS}/${connectorId}/${SUB_COLLECTIONS.SCHEMAS}/${wsdlSchemaRef}`)
    .get();
  if (!schemaSnap.exists) return null;
  const schemaDoc = schemaSnap.data()!;
  const schemaType = (schemaDoc.schemaType as string) ?? 'wsdl';
  if (schemaType !== 'wsdl') return null;

  const wsdlPath = schemaDoc.storagePath as string;
  if (!wsdlPath) return null;

  try {
    const [buf] = await storageBucket.file(wsdlPath).download();
    const raw = buf.toString('utf-8');
    return resolveWsdlInputRootElement(raw, operationName);
  } catch (err) {
    console.warn(`[resolveFloActionMappingTarget] failed reading WSDL ${wsdlPath}: ${err}`);
    return null;
  }
}

export async function resolveFloActionMappingTarget(
  connectorId: string,
  floKitId:    string,
  actionId:    string,
  options?: { forceRefresh?: boolean },
): Promise<ResolveFloActionMappingTargetResult> {
  const forceRefresh = options?.forceRefresh === true;
  const cacheRef = db.doc(
    `${COLLECTIONS.CONNECTORS}/${connectorId}/${SUB_COLLECTIONS.FLOKITS}/${floKitId}/${SUB_COLLECTIONS.FLOKITACTIONS}/${actionId}/Cache/mappingTarget`,
  );

  try {
    if (!forceRefresh) {
      const cached = await cacheRef.get();
      if (cached.exists) {
        const data  = cached.data()!;
        const ageMs = Date.now() - (data.cachedAt?.toMillis?.() ?? 0);
        if (ageMs < CACHE_TTL_MS && Array.isArray(data.fields) && data.fields.length > 0
          && (data.cacheVersion as number | undefined) === MAPPING_TARGET_CACHE_VERSION) {
          const fields = expandIdTypeOptionFields(data.fields as ParsedField[]);
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

  let requestRootHint: string | null =
    (kitAction as any)?.requestBinding?.requestRootElement
    ?? (connectorAction as any)?.requestBinding?.requestRootElement
    ?? null;

  if (requestRootHint) {
    console.log(
      `[resolveFloActionMappingTarget] using persisted request root: ${requestRootHint}`,
    );
  }

  if (!requestRootHint && connectorAction?.schemaRef && operationName) {
    requestRootHint = await resolveWsdlInputRootFromSchemaRef(
      connectorId,
      connectorAction.schemaRef,
      operationName,
    );
    if (requestRootHint) {
      console.log(
        `[resolveFloActionMappingTarget] WSDL input root for ${operationName}: ${requestRootHint}`,
      );
    }
  }
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
      const { fields: flattenFields } = await parsedFieldsFromSchemaFlatten(
        connectorId,
        dataModelId,
        operationName,
        requestRootHint,
        actionId,
      );
      fields            = flattenFields;
      schemaSource      = 'dataModel';
      dataModelSchemaId = dataModelId;
      console.log(
        `[resolveFloActionMappingTarget] loaded flatten index from data model ${dataModelId}: ` +
        `${fields.length} fields`,
      );
    } catch (err) {
      console.warn(`[resolveFloActionMappingTarget] data model flatten load failed: ${err}`);
    }
  }

  if (fields.length === 0 && connectorAction?.schemaRef) {
    try {
      const { fields: flattenFields } = await parsedFieldsFromSchemaFlatten(
        connectorId,
        connectorAction.schemaRef,
        operationName,
        requestRootHint,
        actionId,
      );
      fields       = flattenFields;
      schemaSource = 'services';
      console.log(
        `[resolveFloActionMappingTarget] loaded flatten from services schema ${connectorAction.schemaRef}`,
      );
    } catch (err) {
      console.warn(`[resolveFloActionMappingTarget] services flatten load failed: ${err}`);
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
      'Ensure the kit pins a data model schema with a compiled flatten index (re-upload in Schema Manager), ' +
      'or the action has manual inputSchema.',
    );
  }

  const fieldsForMapper = expandIdTypeOptionFields(fields);
  const result: ResolveFloActionMappingTargetResult = {
    fields: fieldsForMapper,
    tree: buildFieldTree(fieldsForMapper),
    actionId,
    actionLabel,
    floKitId,
    connectorId,
    schemaSource,
    dataModelSchemaId,
    operationName,
    requiredCount: countRequired(fieldsForMapper),
    fromCache:     false,
  };

  try {
    await cacheRef.set({
      fields,
      actionLabel,
      schemaSource,
      dataModelSchemaId,
      operationName,
      cacheVersion: MAPPING_TARGET_CACHE_VERSION,
      cachedAt: new Date(),
    });
  } catch {
    // non-fatal
  }

  return result;
}
