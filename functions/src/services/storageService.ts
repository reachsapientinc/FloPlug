// functions/src/services/storageService.ts
import { getStorage } from "firebase-admin/storage";
//import { getFirestore } from "firebase-admin/firestore";
import { getGlobalSetting } from "../helpers/settingsHelper.js";
import type {
  BucketConfig,
  StorageSettings,
  StorageUploadRequest,
  StorageUploadResponse,
  StorageDeleteRequest,
  StorageGetRequest,
} from "@floplug/shared";

const getBucketConfig = async (purpose: string): Promise<BucketConfig> => {
  const settings = await getGlobalSetting<StorageSettings>("StorageSettings");
  const config = settings?.buckets?.[purpose];
  if (!config) throw new Error(`No storage config found for purpose: ${purpose}`);
  return config;
};

const buildFullPath = (config: BucketConfig, relativePath: string): string =>
  `${config.folder}/${relativePath}`;

export const uploadFile = async (
  req: StorageUploadRequest
): Promise<StorageUploadResponse> => {
  const config = await getBucketConfig(req.purpose);

  const ext = req.path.split(".").pop()?.toLowerCase() ?? "";
  if (config.allowedTypes.length && !config.allowedTypes.includes(ext)) {
    throw new Error(`File type .${ext} not allowed for ${req.purpose}`);
  }

  const fullPath = buildFullPath(config, req.path);

  // ✅ modular import instead of admin.storage()
  const bucket = getStorage().bucket(config.bucketName);
  const fileBuffer = Buffer.from(req.fileBase64, "base64");

  await bucket.file(fullPath).save(fileBuffer, {
    metadata: {
      contentType: req.contentType ?? "application/octet-stream",
      metadata: req.metadata ?? {},
    },
  });

  return { storagePath: fullPath };
};

export const getFileUrl = async (req: StorageGetRequest): Promise<string> => {
  const config = await getBucketConfig(req.purpose);
  const fullPath = buildFullPath(config, req.path);
  const bucket = getStorage().bucket(config.bucketName);

  const [url] = await bucket.file(fullPath).getSignedUrl({
    action: "read",
    expires: Date.now() + 60 * 60 * 1000,
  });
  return url;
};

export const deleteFile = async (req: StorageDeleteRequest): Promise<void> => {
  const config = await getBucketConfig(req.purpose);
  const fullPath = buildFullPath(config, req.path);
  const bucket = getStorage().bucket(config.bucketName);
  await bucket.file(fullPath).delete();
};

export const listFiles = async (
  purpose: string,
  subPath?: string
): Promise<string[]> => {
  const config = await getBucketConfig(purpose);
  const prefix = subPath ? `${config.folder}/${subPath}` : `${config.folder}/`;
  const bucket = getStorage().bucket(config.bucketName);
  const [files] = await bucket.getFiles({ prefix });
  return files.map(f => f.name);
};