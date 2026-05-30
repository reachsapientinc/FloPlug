/**
 * Map FloAction errors to Execution Hub payloads (enriched message + httpTrace).
 */

import type { NodeHttpTrace } from '@floplug/shared';
import {
  FloActionAuthError,
  FloActionNetworkError,
  FloActionSchemaError,
  FloActionValidationError,
  type FloActionErrorContext,
} from './floActionErrors.js';

function contextLabel(ctx: FloActionErrorContext): string {
  const kit = ctx.floKitId ? ` · kit ${ctx.floKitId}` : '';
  return `[connector ${ctx.connectorId} · connection ${ctx.connectionId} · action ${ctx.actionId}${kit}]`;
}

function validationToTrace(err: FloActionValidationError): NodeHttpTrace | undefined {
  if (!err.debug) return undefined;
  const dbg = err.debug;
  return {
    method:         dbg.method,
    url:            dbg.url || '(validation failed before HTTP)',
    requestHeaders: dbg.headersSafe,
    requestBody:    dbg.requestBody,
    status:         0,
    statusText:     'Validation failed',
    responseBody:   err.inputHint ?? err.message,
  };
}

export function floActionErrorToHubDiagnostics(err: unknown): {
  error: string;
  httpTrace?: NodeHttpTrace;
} {
  if (err instanceof FloActionValidationError) {
    return {
      error: `${err.message} ${contextLabel(err.context)}`,
      httpTrace: validationToTrace(err),
    };
  }

  if (err instanceof FloActionNetworkError) {
    const net = err as FloActionNetworkError & { httpTrace?: NodeHttpTrace };
    const urlHint = net.httpTrace?.url
      ? ` · ${net.httpTrace.method ?? 'HTTP'} ${net.httpTrace.url}`
      : '';
    const statusHint = net.httpTrace?.status
      ? ` (HTTP ${net.httpTrace.status})`
      : err.statusCode
        ? ` (HTTP ${err.statusCode})`
        : '';
    return {
      error: `${err.message}${statusHint} ${contextLabel(err.context)}${urlHint}`,
      httpTrace: net.httpTrace,
    };
  }

  if (err instanceof FloActionAuthError) {
    return { error: `${err.message} ${contextLabel(err.context)}` };
  }

  if (err instanceof FloActionSchemaError) {
    return { error: `${err.message} ${contextLabel(err.context)}` };
  }

  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message: unknown }).message);
    const trace = (err as { httpTrace?: NodeHttpTrace }).httpTrace;
    return trace ? { error: msg, httpTrace: trace } : { error: msg };
  }

  return { error: String(err) };
}
