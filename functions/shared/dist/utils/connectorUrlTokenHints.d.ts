/**
 * Generic URL token keys (urlToken1, urlToken2, …) and vendor-aware hint text.
 * Labels are admin-defined; hints adapt to connector target (Workday, Salesforce, SAP, …).
 */
import type { ConnectorUrlToken, ConnectorUrlTokenSource } from './connectorUrlTokens.js';
export type UrlTokenVendorProfile = 'workday' | 'salesforce' | 'sap' | 'oracle' | 'generic';
export interface UrlTokenHint {
    labelSuggestion: string;
    descriptionSuggestion: string;
    placeholderSuggestion: string;
    previewSample?: string;
}
/** Infer vendor profile from connector label/id (not from hard-coded token keys). */
export declare function resolveUrlTokenVendorProfile(connector?: {
    label?: string;
    id?: string;
    category?: string;
} | null): UrlTokenVendorProfile;
/** Hint for a token row — ordinal is 0-based among rows of the same source in the table. */
export declare function getUrlTokenHint(profile: UrlTokenVendorProfile, source: ConnectorUrlTokenSource, ordinal: number): UrlTokenHint;
/** Assign sequential urlToken1, urlToken2, … to all non-static rows (field mirrors key). */
export declare function reassignUrlTokenKeys(tokens: ConnectorUrlToken[]): ConnectorUrlToken[];
export declare function nextUrlTokenKey(tokens: ConnectorUrlToken[]): string;
/** Count how many non-static tokens of this source appear before index (for hint ordinal). */
export declare function sourceOrdinalBefore(tokens: ConnectorUrlToken[], index: number, source: ConnectorUrlTokenSource): number;
export declare function createEmptyUrlToken(source: ConnectorUrlTokenSource, tokens: ConnectorUrlToken[], profile: UrlTokenVendorProfile, insertIndex?: number): ConnectorUrlToken;
/** Preview sample for a token when assembling URLs with sample mode. */
export declare function previewSampleForToken(profile: UrlTokenVendorProfile, token: ConnectorUrlToken, tokens: ConnectorUrlToken[]): string | undefined;
/** Hint for an existing token row (label/description placeholders in admin UI). */
export declare function getUrlTokenHintForToken(profile: UrlTokenVendorProfile, token: ConnectorUrlToken, tokens: ConnectorUrlToken[]): UrlTokenHint;
