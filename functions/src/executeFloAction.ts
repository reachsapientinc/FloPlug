/**
 * Cloud Function — executeFloAction (httpsCallable)
 * Server-side auth + HTTP for FloAction nodes.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { executeFloActionCore, type ExecuteFloActionInput } from './engine/executeFloActionCore.js';
import {
  FloActionAuthError,
  FloActionNetworkError,
  FloActionSchemaError,
  FloActionValidationError,
} from './engine/floActionErrors.js';
import { HUB_ROLES, PERMISSIONS } from '@floplug/shared';

function assertExecutor(request: { auth?: { token?: Record<string, unknown> } }): void {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const token = request.auth.token ?? {};
  const isHubAdmin = token.isHubAdmin === true || token.role === HUB_ROLES.ADMIN;
  const permissions = (token.permissions as string[]) ?? [];
  const canExecute  = isHubAdmin
    || permissions.includes(PERMISSIONS.RUN_FLOS)
    || permissions.includes(PERMISSIONS.INVOKE_FLOS)
    || permissions.includes(PERMISSIONS.DESIGN_FLOS);

  if (!canExecute) {
    throw new HttpsError('permission-denied', 'hub_admin or flo_executor role required.');
  }
}

function toHttpsError(err: unknown): HttpsError {
  if (err instanceof FloActionValidationError) {
    return new HttpsError('invalid-argument', err.message, {
      unmappedFields: err.unmappedFields,
      context:        err.context,
    });
  }
  if (err instanceof FloActionAuthError) {
    return new HttpsError('unauthenticated', err.message, { context: err.context });
  }
  if (err instanceof FloActionNetworkError) {
    return new HttpsError('unavailable', err.message, {
      statusCode: err.statusCode,
      context:    err.context,
    });
  }
  if (err instanceof FloActionSchemaError) {
    return new HttpsError('internal', err.message, { context: err.context });
  }
  const msg = err instanceof Error ? err.message : String(err);
  return new HttpsError('internal', msg);
}

export const executeFloAction = onCall(async (request) => {
  assertExecutor(request);

  const data = request.data as ExecuteFloActionInput & {
    cStream?:      Record<string, unknown>;
    localStore?:   Record<string, unknown>;
    globalStore?:  Record<string, unknown>;
    mappingRules?: ExecuteFloActionInput['mappingRules'];
    debug?:        boolean;
    dryRun?:       boolean;
  };

  const {
    hubId, tenantId, actionId, connectorId, connectionId,
    cStream = {}, localStore = {}, globalStore = {}, mappingRules,
    floKitId, userId, debug, dryRun,
  } = data;

  if (!hubId || !tenantId || !actionId || !connectorId || !connectionId) {
    throw new HttpsError(
      'invalid-argument',
      'hubId, tenantId, actionId, connectorId, and connectionId are required.',
    );
  }

  try {
    return await executeFloActionCore({
      hubId,
      tenantId,
      userId: userId ?? request.auth?.uid,
      actionId,
      floKitId,
      connectorId,
      connectionId,
      cStream,
      localStore,
      globalStore,
      mappingRules,
      debug,
      dryRun,
    });
  } catch (err) {
    if (dryRun && debug && err instanceof FloActionValidationError) {
      return {
        payload:       { _dryRun: true, _validationError: err.message },
        unmappedFields: err.unmappedFields,
        executionMs:   0,
        _actionStatus: 'error' as const,
        debug: {
          resolved:            {},
          requestBody:         '',
          requestBodyInner:    '',
          url:                 '',
          method:              '',
          contentType:         '',
          unmappedFields:      err.unmappedFields,
          unmappedRequired:    err.unmappedFields,
          mappedFieldCount:    0,
          schemaFieldCount:    0,
          headersSafe:         {},
          validationWouldFail: true,
        },
      };
    }
    throw toHttpsError(err);
  }
});
