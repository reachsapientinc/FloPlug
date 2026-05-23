/**
 * Callable — resolve fields for a kit-scoped (or legacy connector) action.
 * Delegates to engine/loadActionDocWithSchema (FloKits/{kitId}/FloKitActions).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { loadActionDocWithSchema } from '../engine/resolveActionSchema.js';

export const resolveActionSchema = onCall(async (request) => {
  const { connectorId, actionId, floKitId } = request.data as {
    connectorId: string;
    actionId:    string;
    floKitId?:   string;
  };

  if (!connectorId || !actionId) {
    throw new HttpsError('invalid-argument', 'connectorId and actionId are required');
  }

  try {
    const action = await loadActionDocWithSchema({ connectorId, actionId, floKitId });
    const fields = action.inputSchema ?? [];
    if (fields.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        `No fields resolved for action "${actionId}". Check schemaRef, flatten index, or manual inputSchema.`,
      );
    }
    return { fields, fromCache: false };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not found')) {
      throw new HttpsError('not-found', msg);
    }
    if (msg.includes('no schemaRef')) {
      throw new HttpsError('failed-precondition', msg);
    }
    throw new HttpsError('internal', msg);
  }
});
