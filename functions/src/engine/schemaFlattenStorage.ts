/**
 * Derive / resolve flatten.json path next to uploaded schema in Cloud Storage.
 */

import { getStorage } from 'firebase-admin/storage';
import { CURRENT_SCHEMA_BUCKET } from '../constants.js';

const storageBucket = getStorage().bucket(CURRENT_SCHEMA_BUCKET);

/** revenue_management.xsd → revenue_management.flatten.json (same folder). */
export function expectedFlattenStoragePath(storagePath: string): string {
  const base = storagePath.split('/').pop() ?? 'schema';
  const stem = base.replace(/\.(wsdl|xsd|xml)$/i, '');
  return storagePath.replace(/[^/]+$/, `${stem}.flatten.json`);
}

/** Use compile result, or link existing flatten.json in bucket if present. */
export async function resolveFlattenStoragePath(
  storagePath: string,
  compiledPath?: string,
): Promise<string | undefined> {
  if (compiledPath) return compiledPath;

  const expected = expectedFlattenStoragePath(storagePath);
  try {
    const [exists] = await storageBucket.file(expected).exists();
    return exists ? expected : undefined;
  } catch {
    return undefined;
  }
}
