/**
 * Compile XSD → flatten index JSON at schema upload (product admin only).
 */

import { getStorage } from 'firebase-admin/storage';
import type { SchemaFlattenIndex, SchemaOperationRef } from '@floplug/shared';
import { CURRENT_SCHEMA_BUCKET } from '../constants.js';
import {
  loadAndMergeXsdSchema,
  resolvePrimaryXsdStoragePath,
} from './xsdSchemaMerge.js';
import { flattenOperationFromSchema } from './flattenXsdToIndex.js';
import { listXsdRootElementNames } from './actionSchemaParser.js';
import { expectedFlattenStoragePath } from './schemaFlattenStorage.js';

const storageBucket = getStorage().bucket(CURRENT_SCHEMA_BUCKET);

/** Avoid compiling thousands of Workday global elements (causes timeout / 500). */
const MAX_FLATTEN_OPERATION_KEYS = 120;

function isLikelyRequestOperation(name: string): boolean {
  if (name.endsWith('_Request')) return true;
  return /^(Put|Get|Submit|Change|Cancel|Add|Edit|Delete|Create|Update)_/i.test(name);
}

function operationKeysFromList(
  operations: SchemaOperationRef[],
  mergedSchema: any,
): string[] {
  const keys = new Set<string>();

  for (const op of operations) {
    if (isLikelyRequestOperation(op.name)) {
      keys.add(op.name);
      if (op.requestRootElement) keys.add(op.requestRootElement);
    }
  }

  for (const root of listXsdRootElementNames(mergedSchema)) {
    if (!isLikelyRequestOperation(root)) continue;
    keys.add(root);
    if (root.endsWith('_Request')) keys.add(root.slice(0, -8));
  }

  return [...keys].slice(0, MAX_FLATTEN_OPERATION_KEYS);
}

export interface CompileSchemaFlattenResult {
  flattenStoragePath: string;
  operationCount:     number;
  index:              SchemaFlattenIndex;
}

export async function compileAndStoreSchemaFlatten(params: {
  storagePath:  string;
  schemaType:   string;
  version:      string;
  fileName:     string;
  operations:   SchemaOperationRef[];
}): Promise<CompileSchemaFlattenResult | null> {
  const { storagePath, schemaType, version, fileName, operations } = params;

  if (schemaType !== 'wsdl' && schemaType !== 'xsd') {
    return null;
  }

  const xsdPath = schemaType === 'xsd'
    ? storagePath
    : await resolvePrimaryXsdStoragePath(storagePath, schemaType);

  const mergedSchema = await loadAndMergeXsdSchema(xsdPath);
  const opKeys = operationKeysFromList(operations, mergedSchema);
  console.log(`[compileSchemaFlatten] flattening ${opKeys.length} operation keys for ${fileName}`);

  const operationsIndex: SchemaFlattenIndex['operations'] = {};

  for (const key of opKeys) {
    const flattened = flattenOperationFromSchema(mergedSchema, key);
    if (!flattened || flattened.fields.length === 0) continue;

    operationsIndex[flattened.operationName] = flattened;
    operationsIndex[flattened.requestRootElement] = flattened;

    const snake = flattened.operationName.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    if (snake !== flattened.operationName) {
      operationsIndex[snake] = flattened;
    }
  }

  const index: SchemaFlattenIndex = {
    version,
    sourceFile: fileName,
    schemaType,
    compiledAt: new Date().toISOString(),
    operations:   operationsIndex,
  };

  const flattenPath = expectedFlattenStoragePath(storagePath);
  await storageBucket.file(flattenPath).save(JSON.stringify(index, null, 2), {
    contentType: 'application/json',
    metadata: { cacheControl: 'public, max-age=3600' },
  });

  console.log(
    `[compileSchemaFlatten] ${flattenPath}: ${Object.keys(operationsIndex).length} operation keys, ` +
    `${opKeys.length} candidates`,
  );

  return {
    flattenStoragePath: flattenPath,
    operationCount:     Object.values(operationsIndex).filter(
      (v, i, arr) => arr.findIndex(x => x.operationName === v.operationName) === i,
    ).length,
    index,
  };
}
