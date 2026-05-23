/**
 * Per-node-type validation rules (structural / design-time).
 */
import type { FloNode } from '../types/nodeTypes.js';
import type { FloValidationIssue, FloValidationResourceContext, FloNodeValidationSnapshot } from '../types/floValidation.js';
export declare function validateNode(node: FloNode, resources?: FloValidationResourceContext, checkResources?: boolean): {
    issues: FloValidationIssue[];
    metrics?: Record<string, unknown>;
};
export declare function snapshotForNode(node: FloNode, issues: FloValidationIssue[], metrics?: Record<string, unknown>): FloNodeValidationSnapshot;
