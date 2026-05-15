// functions/src/handlers/uploadSchema.ts
import { onCall } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { uploadFile } from "../services/storageService.js";
import type { SchemaUploadRequest } from "@floplug/shared";

export const uploadSchema = onCall<SchemaUploadRequest>(async (request) => {
  const { connectorId, version, fileName, fileBase64, schemaType, label } = request.data;

  const { storagePath } = await uploadFile({
    purpose: "schemas",
    path: `${connectorId}/${version.replace(/\s/g, "_")}/${fileName}`,
    fileBase64,
    contentType: "application/xml",
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
  });

  return { schemaId: schemaRef.id, storagePath };
});