// functions/src/handlers/uploadSchema.ts
import { onCall } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { uploadFile } from "../services/storageService.js";
import type { SchemaUploadRequest } from "@floplug/shared";
import { listOperationsFromContent, operationNames } from "../utils/schemaOperations.js";

export const uploadSchema = onCall<SchemaUploadRequest>(async (request) => {
  const { connectorId, version, fileName, fileBase64, schemaType, label } = request.data;

  const rawContent = Buffer.from(fileBase64, "base64").toString("utf-8");
  const operations = listOperationsFromContent(rawContent, schemaType);
  const opNames = operationNames(operations);

  const { storagePath } = await uploadFile({
    purpose: "schemas",
    path: `${connectorId}/${version.replace(/\s/g, "_")}/${fileName}`,
    fileBase64,
    contentType: schemaType === "openapi" ? "application/json" : "application/xml",
  });

  const db = getFirestore();
  const schemaRef = db
    .collection("FloPlugConnectors")
    .doc(connectorId)
    .collection("Schemas")
    .doc();

  await schemaRef.set({
    id:         schemaRef.id,
    connectorId,
    label,
    version,
    schemaType,
    storagePath,
    isActive:   true,
    uploadedAt: FieldValue.serverTimestamp(),
    operations:     opNames,
    operationsMeta: operations,
    operationsParsedAt: FieldValue.serverTimestamp(),
  });

  return {
    schemaId: schemaRef.id,
    storagePath,
    operations: opNames,
    operationCount: operations.length,
  };
});