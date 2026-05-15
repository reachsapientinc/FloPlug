// packages/shared/src/types/storage.ts

export type StoragePurpose = "schemas" | "brandAssets" | "exports" | string;

export interface BucketConfig {
  bucketName: string;
  folder: string;
  retentionDays: number;       // -1 = forever
  allowedTypes: string[];
  maxFileSizeMB: number;
}

export interface StorageSettings {
  buckets: Record<StoragePurpose, BucketConfig>;
}

export interface StorageUploadRequest {
  purpose: StoragePurpose;
  path: string;               // relative path within folder e.g. connectorId/v1/file.wsdl
  fileBase64: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface SchemaUploadRequest extends StorageUploadRequest {
  connectorId: string;
  version: string;
  fileName: string;
  label: string;
  schemaType: "wsdl" | "xsd" | "openapi";
}

export interface StorageUploadResponse {
  storagePath: string;        // full path in bucket
  downloadUrl?: string;
}

export interface StorageDeleteRequest {
  purpose: StoragePurpose;
  path: string;
}

export interface StorageGetRequest {
  purpose: StoragePurpose;
  path: string;
}

export const buildSchemaPath = (
  connectorId: string,
  version: string,
  fileName: string
): string => {
  const safeVersion = version.replace(/\s/g, "_");
  return `schemas/${connectorId}/${safeVersion}/${fileName}`;
};