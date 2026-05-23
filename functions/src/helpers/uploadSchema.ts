// functions/src/helpers/uploadSchema.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { uploadFile } from '../services/storageService.js';
import type { SchemaUploadRequest } from '@floplug/shared';
import { buildSchemaStoragePath } from '@floplug/shared';
import { listOperationsFromContent, operationNames } from '../utils/schemaOperations.js';
import { compileAndStoreSchemaFlatten } from '../engine/compileSchemaFlatten.js';
import { resolveFlattenStoragePath } from '../engine/schemaFlattenStorage.js';
import {
  resolveSchemaIdForUpload,
  writeRegistryAndSchemaBatch,
} from '../services/schemaRegistry.js';

/** Firestore rejects undefined nested values. */
function sanitizeForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const uploadSchema = onCall<SchemaUploadRequest>(
  { timeoutSeconds: 300, memory: '1GiB' },
  async (request) => {
    try {
      const { connectorId, version, fileName, fileBase64, schemaType, label } = request.data;

      if (!connectorId?.trim() || !version?.trim() || !fileName?.trim() || !fileBase64) {
        throw new HttpsError('invalid-argument', 'connectorId, version, fileName, and file are required.');
      }
      if (!label?.trim()) {
        throw new HttpsError('invalid-argument', 'label is required.');
      }

      const rawContent = Buffer.from(fileBase64, 'base64').toString('utf-8');
      const operations = listOperationsFromContent(rawContent, schemaType);
      const opNames = operationNames(operations);

      const versionTrim = version.trim();
      const storagePath = buildSchemaStoragePath(connectorId, versionTrim, fileName);

      const { storagePath: uploadedPath } = await uploadFile({
        purpose: 'schemas',
        path: storagePath,
        fileBase64,
        contentType: schemaType === 'openapi' ? 'application/json' : 'application/xml',
      });

      let flattenStoragePath: string | undefined;
      let flattenWarning: string | undefined;
      let flattenOperationCount = 0;

      if (schemaType === 'wsdl' || schemaType === 'xsd') {
        try {
          const compiled = await compileAndStoreSchemaFlatten({
            storagePath: uploadedPath,
            schemaType,
            version: versionTrim,
            fileName,
            operations,
          });
          if (compiled) {
            flattenStoragePath = compiled.flattenStoragePath;
            flattenOperationCount = compiled.operationCount;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          flattenWarning = msg;
          console.error(`[uploadSchema] flatten compile failed: ${msg}`);
        }
        if (!flattenStoragePath) {
          const linked = await resolveFlattenStoragePath(uploadedPath);
          if (linked) {
            flattenStoragePath = linked;
            console.log(`[uploadSchema] linked existing flatten index: ${linked}`);
          }
        }
      }

      const { schemaId, isNew, registryKey } = await resolveSchemaIdForUpload(
        connectorId,
        versionTrim,
        fileName,
        uploadedPath,
      );
      const db = getFirestore();
      const batch = db.batch();

      writeRegistryAndSchemaBatch(batch, {
        schemaId,
        registryKey,
        connectorId,
        version: versionTrim,
        fileName,
        schemaType,
        label: label.trim(),
        storagePath: uploadedPath,
        operations: opNames,
        operationsMeta: sanitizeForFirestore(operations),
        flattenStoragePath,
        uploadedBy: request.auth?.uid,
      });

      await batch.commit();

      console.log(
        `[uploadSchema] ${isNew ? 'created' : 'updated'} schema ${schemaId} registry ${registryKey}`,
      );

      return {
        schemaId,
        registryKey,
        storagePath: uploadedPath,
        operations: opNames,
        operationCount: operations.length,
        flattenStoragePath: flattenStoragePath ?? null,
        flattenOperationCount,
        flattenWarning: flattenWarning ?? null,
        updated: !isNew,
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[uploadSchema] failed:', err);
      throw new HttpsError('internal', msg || 'uploadSchema failed');
    }
  },
);
