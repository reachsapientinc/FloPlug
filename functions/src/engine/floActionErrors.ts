/**
 * Typed errors for FloAction execution — never include raw credentials.
 */

export interface FloActionErrorContext {
  actionId:     string;
  connectionId: string;
  connectorId:  string;
}

export class FloActionValidationError extends Error {
  readonly unmappedFields: string[];
  readonly context: FloActionErrorContext;

  constructor(message: string, unmappedFields: string[], context: FloActionErrorContext) {
    super(message);
    this.name = 'FloActionValidationError';
    this.unmappedFields = unmappedFields;
    this.context = context;
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
