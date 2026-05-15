export type StoragePurpose = "schemas" | "brandAssets" | "exports" | string;
export interface BucketConfig {
    bucketName: string;
    folder: string;
    retentionDays: number;
    allowedTypes: string[];
    maxFileSizeMB: number;
}
export interface StorageSettings {
    buckets: Record<StoragePurpose, BucketConfig>;
}
export interface StorageUploadRequest {
    purpose: StoragePurpose;
    path: string;
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
    storagePath: string;
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
export declare const buildSchemaPath: (connectorId: string, version: string, fileName: string) => string;
