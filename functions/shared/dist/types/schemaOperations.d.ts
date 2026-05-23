import type { SchemaType } from './AuthConnectorTypes.js';
/** One invocable operation discovered from a schema file (WSDL / XSD / OpenAPI). */
export interface SchemaOperationRef {
    name: string;
    label: string;
    method?: string;
    endpoint?: string;
    /** WSDL input message name, e.g. Put_Sales_Item_RequestInputMsg */
    inputMessageName?: string;
    /** WSDL input part element local name, e.g. Put_Sales_Item_Request */
    requestRootElement?: string;
    /** Optional inferred request type local name, e.g. Put_Sales_Item_RequestType */
    requestTypeName?: string;
}
export type { SchemaType };
