/**
 * Callable — kit-aware mapping target fields for FloAction designer mapper.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { resolveFloActionMappingTarget } from './engine/resolveFloActionMappingTarget.js';
import { HUB_ROLES, PERMISSIONS } from '@floplug/shared';

function assertDesigner(request: { auth?: { token?: Record<string, unknown> } }): void {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const token = request.auth.token ?? {};
  const canUse = token.isHubAdmin === true
    || token.role === HUB_ROLES.ADMIN
    || (token.permissions as string[] | undefined)?.includes(PERMISSIONS.DESIGN_FLOS)
    || (token.permissions as string[] | undefined)?.includes(PERMISSIONS.RUN_FLOS);

  if (!canUse) {
    throw new HttpsError('permission-denied', 'Designer access required.');
  }
}

export const resolveFloActionMappingTargetCallable = onCall(async (request) => {
  assertDesigner(request);

  const { connectorId, floKitId, actionId, forceRefresh } = request.data as {
    connectorId?:   string;
    floKitId?:      string;
    actionId?:      string;
    forceRefresh?:  boolean;
  };

  if (!connectorId || !floKitId || !actionId) {
    throw new HttpsError('invalid-argument', 'connectorId, floKitId, and actionId are required.');
  }

  try {
    return await resolveFloActionMappingTarget(connectorId, floKitId, actionId, {
      forceRefresh: forceRefresh === true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new HttpsError('failed-precondition', msg);
  }
});
