/**
 * Conditional required fields — optional XSD branches (minOccurs=0) only enforce
 * children when that branch is mapped. Required leaves under an inactive optional
 * ancestor (e.g. Primary_Image_Data) are not enforced.
 */
import type { ParsedField } from '../types/AuthConnectorTypes.js';
export interface MappingRuleTarget {
    targetField?: string;
}
/** True when any mapped value or rule exists at or below prefix. */
export declare function isMappingBranchActivated(prefix: string, resolved: Record<string, unknown>, mappingRules?: MappingRuleTarget[]): boolean;
/** Paths of optional containers (minOccurs=0 / optional object) from flatten + optionalAncestorPaths on leaves. */
export declare function buildOptionalContainerPaths(inputSchema: ParsedField[]): Set<string>;
/**
 * Infer optional container when flatten index has no object row (legacy cache) but
 * nested fields exist and no required direct child at this prefix.
 */
export declare function isImplicitOptionalContainer(prefix: string, inputSchema: ParsedField[]): boolean;
/**
 * Required only when marked required AND every optional ancestor branch is activated.
 * Local minOccurs=1 on Filename does not matter if Primary_Image_Data (0..1) is omitted.
 */
export declare function isFieldEffectivelyRequired(field: ParsedField, inputSchema: ParsedField[], resolved: Record<string, unknown>, mappingRules?: MappingRuleTarget[]): boolean;
export declare function listUnmappedRequiredFields(inputSchema: ParsedField[], resolved: Record<string, unknown>, mappingRules?: MappingRuleTarget[]): string[];
