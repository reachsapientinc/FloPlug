import { getFunctions, httpsCallable } from 'firebase/functions';
import type { SchemaOperationRef } from '@floplug/shared';

export async function fetchSchemaOperations(
  connectorId: string,
  schemaId: string,
  refresh = false,
): Promise<{ operations: SchemaOperationRef[]; fromCache: boolean }> {
  const fn = httpsCallable<
    { connectorId: string; schemaId: string; refresh?: boolean },
    { operations: SchemaOperationRef[]; fromCache: boolean }
  >(getFunctions(), 'listSchemaOperations');
  const { data } = await fn({ connectorId, schemaId, refresh });
  return data;
}
