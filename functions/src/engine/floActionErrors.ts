/**
 * Typed errors for FloAction execution — never include raw credentials.
 */

export interface FloActionDebugInfo {
  resolved:            Record<string, unknown>;
  requestBody:         string;
  requestBodyInner:    string;
  url:                 string;
  method:              string;
  contentType:         string;
  unmappedFields:      string[];
  unmappedRequired:    string[];
  mappedFieldCount:    number;
  schemaFieldCount:    number;
  headersSafe:         Record<string, string>;
  validationWouldFail: boolean;
}

export interface FloActionErrorContext {
  actionId:     string;
  connectionId: string;
  connectorId:  string;
  floKitId?:    string;
}

export class FloActionValidationError extends Error {
  readonly unmappedFields: string[];
  readonly context: FloActionErrorContext;
  readonly debug?:       FloActionDebugInfo;
  readonly inputHint?:   string;

  constructor(
    message: string,
    unmappedFields: string[],
    context: FloActionErrorContext,
    options?: { debug?: FloActionDebugInfo; inputHint?: string },
  ) {
    super(message);
    this.name = 'FloActionValidationError';
    this.unmappedFields = unmappedFields;
    this.context = context;
    this.debug = options?.debug;
    this.inputHint = options?.inputHint;
  }
}

export class FloActionAuthError extends Error {
  readonly context: FloActionErrorContext;

  constructor(message: string, context: FloActionErrorContext) {
    super(message);
    this.name = 'FloActionAuthError';
    this.context = context;
  }
}

export class FloActionNetworkError extends Error {
  readonly statusCode?: number;
  readonly context: FloActionErrorContext;

  constructor(message: string, context: FloActionErrorContext, statusCode?: number) {
    super(message);
    this.name = 'FloActionNetworkError';
    this.statusCode = statusCode;
    this.context = context;
  }
}

export class FloActionSchemaError extends Error {
  readonly context: FloActionErrorContext;

  constructor(message: string, context: FloActionErrorContext) {
    super(message);
    this.name = 'FloActionSchemaError';
    this.context = context;
  }
}
