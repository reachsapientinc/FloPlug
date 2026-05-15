// functions/src/helpers/storageHandlers.ts
import { onCall } from "firebase-functions/v2/https";
import type {
  StorageUploadRequest,
  StorageGetRequest,
  StorageDeleteRequest,
} from "@floplug/shared";
import { uploadFile, getFileUrl, deleteFile, listFiles } from "../services/storageService.js";

export const storageUpload = onCall<StorageUploadRequest>(async (request) => {
  return await uploadFile(request.data);
});

export const storageGetUrl = onCall<StorageGetRequest>(async (request) => {
  return { url: await getFileUrl(request.data) };
});

export const storageDelete = onCall<StorageDeleteRequest>(async (request) => {
  await deleteFile(request.data);
  return { success: true };
});

export const storageList = onCall<{ purpose: string; subPath?: string }>(async (request) => {
  return { files: await listFiles(request.data.purpose, request.data.subPath) };
});