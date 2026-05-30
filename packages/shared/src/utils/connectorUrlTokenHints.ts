/**
 * Generic URL token keys (urlToken1, urlToken2, …) and vendor-aware hint text.
 * Labels are admin-defined; hints adapt to connector target (Workday, Salesforce, SAP, …).
 */

import type { ConnectorUrlToken, ConnectorUrlTokenSource } from './connectorUrlTokens.js';

export type UrlTokenVendorProfile = 'workday' | 'salesforce' | 'sap' | 'oracle' | 'generic';

export interface UrlTokenHint {
  labelSuggestion:       string;
  descriptionSuggestion: string;
  placeholderSuggestion: string;
  previewSample?:        string;
}

/** Infer vendor profile from connector label/id (not from hard-coded token keys). */
export function resolveUrlTokenVendorProfile(
  connector?: { label?: string; id?: string; category?: string } | null,
): UrlTokenVendorProfile {
  const hay = `${connector?.label ?? ''} ${connector?.id ?? ''}`.toLowerCase();
  if (hay.includes('workday')) return 'workday';
  if (hay.includes('salesforce') || hay.includes('sfdc')) return 'salesforce';
  if (hay.includes('sap')) return 'sap';
  if (hay.includes('oracle')) return 'oracle';
  return 'generic';
}

const GENERIC_PATH_HINT: UrlTokenHint = {
  labelSuggestion:       'Path segment',
  descriptionSuggestion: 'Additional URL path segment for this connector.',
  placeholderSuggestion: 'e.g. ccx or api/v2',
  previewSample:         'segment',
};

const HINTS: Partial<Record<UrlTokenVendorProfile, Partial<Record<ConnectorUrlTokenSource, UrlTokenHint[]>>>> = {
  workday: {
    connection: [
      {
        labelSuggestion:       'API host',
        descriptionSuggestion: 'Workday web services hostname without https://',
        placeholderSuggestion: 'wd2-impl-services1.workday.com',
        previewSample:         'wd2-impl-services1.workday.com',
      },
      {
        labelSuggestion:       'Tenant',
        descriptionSuggestion: 'Workday tenant identifier used in the service path',
        placeholderSuggestion: 'sees10',
        previewSample:         'sees10',
      },
    ],
    kit: [
      {
        labelSuggestion:       'Service module',
        descriptionSuggestion: 'Workday web service module name (often derived from WSDL label)',
        placeholderSuggestion: 'Resource_Management',
        previewSample:         'Resource_Management',
      },
      {
        labelSuggestion:       'Web service version',
        descriptionSuggestion: 'Workday API version for this kit',
        placeholderSuggestion: 'v46.1',
        previewSample:         'v46.1',
      },
    ],
  },
  salesforce: {
    connection: [
      {
        labelSuggestion:       'Instance URL',
        descriptionSuggestion: 'Salesforce My Domain or instance host (without https://)',
        placeholderSuggestion: 'mycompany.my.salesforce.com',
        previewSample:         'mycompany.my.salesforce.com',
      },
      {
        labelSuggestion:       'API version path',
        descriptionSuggestion: 'Optional API version segment if not static',
        placeholderSuggestion: 'services/data/v59.0',
        previewSample:         'services/data/v59.0',
      },
    ],
    kit: [
      {
        labelSuggestion:       'SObject or resource',
        descriptionSuggestion: 'Primary Salesforce object or API resource for this kit',
        placeholderSuggestion: 'Account',
        previewSample:         'Account',
      },
    ],
  },
  sap: {
    connection: [
      {
        labelSuggestion:       'Application server host',
        descriptionSuggestion: 'SAP gateway or application server hostname',
        placeholderSuggestion: 'sap-gw.example.com',
        previewSample:         'sap-gw.example.com',
      },
      {
        labelSuggestion:       'Client / system ID',
        descriptionSuggestion: 'SAP client number or system identifier in the URL path',
        placeholderSuggestion: '100',
        previewSample:         '100',
      },
    ],
    kit: [
      {
        labelSuggestion:       'Service path',
        descriptionSuggestion: 'SAP OData or RFC service path segment',
        placeholderSuggestion: 'sap/opu/odata/sap/API_BUSINESS_PARTNER',
        previewSample:         'API_BUSINESS_PARTNER',
      },
    ],
  },
  oracle: {
    connection: [
      {
        labelSuggestion:       'Cloud host',
        descriptionSuggestion: 'Oracle Fusion / Cloud hostname',
        placeholderSuggestion: 'fa-eu-test-saasfaprod1.fa.ocs.oraclecloud.com',
        previewSample:         'fa-eu-test-saasfaprod1.fa.ocs.oraclecloud.com',
      },
      {
        labelSuggestion:       'Identity realm',
        descriptionSuggestion: 'Oracle IDCS realm or tenant segment if applicable',
        placeholderSuggestion: 'idcs-xxxxxxxx',
        previewSample:         'idcs-xxxxxxxx',
      },
    ],
    kit: [
      {
        labelSuggestion:       'REST resource',
        descriptionSuggestion: 'Oracle REST API resource path segment',
        placeholderSuggestion: 'fscmRestApi/resources/11.13.18.05',
        previewSample:         'fscmRestApi',
      },
    ],
  },
  generic: {
    connection: [
      {
        labelSuggestion:       'API host',
        descriptionSuggestion: 'API hostname or host+path without the URL scheme',
        placeholderSuggestion: 'api.example.com',
        previewSample:         'api.example.com',
      },
      {
        labelSuggestion:       'Tenant or environment',
        descriptionSuggestion: 'Tenant, company, or environment identifier in the path',
        placeholderSuggestion: 'prod-tenant-01',
        previewSample:         'tenant-01',
      },
      {
        labelSuggestion:       'Base URL',
        descriptionSuggestion: 'Full API base URL without scheme (generic HTTP connectors)',
        placeholderSuggestion: 'api.example.com/v2',
        previewSample:         'api.example.com/v2',
      },
    ],
    kit: [
      {
        labelSuggestion:       'Service name',
        descriptionSuggestion: 'Kit-specific service or module segment',
        placeholderSuggestion: 'my_service',
        previewSample:         'my_service',
      },
      {
        labelSuggestion:       'API version',
        descriptionSuggestion: 'Version segment for this kit',
        placeholderSuggestion: 'v1',
        previewSample:         'v1',
      },
    ],
    plug:         [GENERIC_PATH_HINT],
    plugNode:     [GENERIC_PATH_HINT],
    floAction:    [GENERIC_PATH_HINT],
    floActionNode:[GENERIC_PATH_HINT],
  },
};

/** Hint for a token row — ordinal is 0-based among rows of the same source in the table. */
export function getUrlTokenHint(
  profile: UrlTokenVendorProfile,
  source: ConnectorUrlTokenSource,
  ordinal: number,
): UrlTokenHint {
  if (source === 'static') {
    return {
      labelSuggestion:       'Static segment',
      descriptionSuggestion: 'Literal path segment (e.g. https:, ccx, service)',
      placeholderSuggestion: 'e.g. https: or ccx/service',
    };
  }
  const profileHints = HINTS[profile] ?? HINTS.generic!;
  const list = profileHints[source] ?? HINTS.generic?.[source] ?? [GENERIC_PATH_HINT];
  return list[ordinal] ?? list[list.length - 1] ?? GENERIC_PATH_HINT;
}

/** Assign sequential urlToken1, urlToken2, … to all non-static rows (field mirrors key). */
export function reassignUrlTokenKeys(tokens: ConnectorUrlToken[]): ConnectorUrlToken[] {
  let n = 0;
  return tokens.map(t => {
    if (t.source === 'static') return t;
    n += 1;
    const key = `urlToken${n}`;
    const normalized = t.sources?.length ? t.sources : [t.source];
    return { ...t, key, field: key, sources: normalized, source: normalized[0] ?? t.source };
  });
}

export function nextUrlTokenKey(tokens: ConnectorUrlToken[]): string {
  let max = 0;
  for (const t of tokens) {
    const m = /^urlToken(\d+)$/i.exec(t.key?.trim() ?? '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `urlToken${max + 1}`;
}

/** Count how many non-static tokens of this source appear before index (for hint ordinal). */
export function sourceOrdinalBefore(tokens: ConnectorUrlToken[], index: number, source: ConnectorUrlTokenSource): number {
  let n = 0;
  for (let i = 0; i < index; i++) {
    const t = tokens[i];
    if (!t) continue;
    const list = t.sources?.length ? t.sources : [t.source];
    if (list.includes(source)) n += 1;
  }
  return n;
}

export function createEmptyUrlToken(
  source: ConnectorUrlTokenSource,
  tokens: ConnectorUrlToken[],
  profile: UrlTokenVendorProfile,
  insertIndex = tokens.length,
): ConnectorUrlToken {
  if (source === 'static') {
    return { key: '', source: 'static', staticValue: '' };
  }
  const ordinal = sourceOrdinalBefore(tokens, insertIndex, source);
  const hint = getUrlTokenHint(profile, source, ordinal);
  const key = nextUrlTokenKey(tokens);
  return {
    key,
    field: key,
    source,
    sources: [source],
    label: hint.labelSuggestion,
    description: hint.descriptionSuggestion,
  };
}

/** Preview sample for a token when assembling URLs with sample mode. */
export function previewSampleForToken(
  profile: UrlTokenVendorProfile,
  token: ConnectorUrlToken,
  tokens: ConnectorUrlToken[],
): string | undefined {
  if (token.source === 'static') return undefined;
  const idx = tokens.indexOf(token);
  const primary = token.sources?.[0] ?? token.source;
  const ordinal = sourceOrdinalBefore(tokens, idx >= 0 ? idx : tokens.length, primary);
  return getUrlTokenHint(profile, primary, ordinal).previewSample;
}

/** Hint for an existing token row (label/description placeholders in admin UI). */
export function getUrlTokenHintForToken(
  profile: UrlTokenVendorProfile,
  token: ConnectorUrlToken,
  tokens: ConnectorUrlToken[],
): UrlTokenHint {
  const idx = tokens.indexOf(token);
  const primary = token.sources?.[0] ?? token.source;
  const ordinal = sourceOrdinalBefore(tokens, idx >= 0 ? idx : tokens.length, primary);
  return getUrlTokenHint(profile, primary, ordinal);
}
