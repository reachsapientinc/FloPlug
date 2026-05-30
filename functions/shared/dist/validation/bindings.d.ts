/**
 * Shared binding / placeholder validation helpers.
 */
import type { FloValidationIssue } from '../types/floValidation.js';
export type BindingSource = 'static' | 'cStream' | 'local' | 'global' | 'literal' | 'expression';
export interface VariableBinding {
    source?: BindingSource | string;
    value?: string;
    literalValue?: string;
}
export declare function isNonEmptyString(v: unknown): v is string;
export declare function bindingValue(binding: VariableBinding | undefined): string;
/** True when a binding has a non-empty static value or variable path. */
export declare function isBindingConfigured(binding: VariableBinding | undefined): boolean;
export declare function validateBinding(nodeId: string, nodeType: string, nodeLabel: string, field: string, label: string, binding: VariableBinding | undefined, required: boolean): FloValidationIssue[];
export declare function validateEmailStatic(nodeId: string, nodeType: string, nodeLabel: string, field: string, label: string, raw: string): FloValidationIssue[];
/** Extract {{var}} placeholders from template / URL pattern. */
export declare function extractMustachePlaceholders(text: string): string[];
/** Extract {{word}} URL variables (plug urlPattern style). */
export declare function extractUrlVariables(urlPattern: string): string[];
export declare function nodeLabel(data: Record<string, unknown>, fallback: string): string;
/** Canvas card title — custom display name overrides palette label. */
export declare function nodeDisplayTitle(data: Record<string, unknown>, defaultTitle: string): string;
