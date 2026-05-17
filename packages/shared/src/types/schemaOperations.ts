import type { SchemaType } from './AuthConnectorTypes.js';

/** One invocable operation discovered from a schema file (WSDL / XSD / OpenAPI). */
export interface SchemaOperationRef {
  name:      string;
  label:     string;
  method?:   string;
  endpoint?: string;
}

export type { SchemaType };
