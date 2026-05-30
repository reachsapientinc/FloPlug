/**
 * Design-time validation for connector-token URLs on plug / FloAction nodes.
 */
import type { ConnectorUrlToken } from '../utils/connectorUrlTokens.js';
import { type ConnectionUrlFields, type KitUrlContext } from '../utils/connectorUrlTokens.js';
import type { FloValidationIssue } from '../types/floValidation.js';
import type { FloNode } from '../types/nodeTypes.js';
import { type VariableBinding } from './bindings.js';
export interface ConnectorUrlNodeValidationInput {
    nodeId: string;
    nodeType: string;
    nodeLabel: string;
    connectionId: string;
    connection?: ConnectionUrlFields;
    urlTokens?: ConnectorUrlToken[];
    kit?: KitUrlContext;
    plugValues?: Record<string, string>;
    floActionValues?: Record<string, string>;
    plugNodeValues?: Record<string, string>;
    floActionNodeValues?: Record<string, string>;
    /** Legacy plug urlPattern with {{var}} bindings */
    legacyUrlPattern?: string;
    legacyUrlVariables?: Record<string, VariableBinding>;
}
/** Validate resolved URL for a plug or FloAction node (connector token model and legacy urlPattern). */
export declare function validateConnectorUrlNode(input: ConnectorUrlNodeValidationInput): FloValidationIssue[];
export declare function validatePlugNodeConnectorUrl(node: FloNode, connection?: ConnectionUrlFields): FloValidationIssue[];
export declare function validateFloActionNodeConnectorUrl(node: FloNode, connection?: ConnectionUrlFields): FloValidationIssue[];
