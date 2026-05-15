export interface SchemaUploadPayload {
  name: string;
  version: string;
  bucket: string;
}

export interface SchemaMetadata {
  id: string;
  path: string;
  uploadedAt: string;
}