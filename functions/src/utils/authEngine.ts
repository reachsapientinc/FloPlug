/**
 * functions/src/utils/authEngine.ts
 *
 * Runtime auth resolver — called by every connector node before making
 * an outbound API request.
 *
 * Flow:
 *   1. Load the AuthProtocol from Firestore (cached in-memory per invocation)
 *   2. Load the tenant's ConnectorCredential (fields filled during configuration)
 *   3. Execute the grant type logic → get an access token
 *   4. Return { headers } to attach to the outbound request
 *
 * Token caching:
 *   Tokens are cached in a module-level Map keyed by
 *   `${hubId}:${tenantId}:${connectorId}` so multiple nodes in the same
 *   flow invocation reuse the token without making extra auth calls.
 *   Cloud Functions are stateless — cache is per-invocation only.
 *   For cross-invocation caching, persist tokens to Firestore (see TODO below).
 *
 * Credential decryption:
 *   Fields with requiresMasking=true are stored encrypted.
 *   Pass a decrypt function from your KMS/encryption layer.
 *   A no-op passthrough is used here — replace with real decryption.
 */

import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthField {
  name:            string;
  label:           string;
  fieldType:       'text' | 'password' | 'url' | 'textarea' | 'select';
  required:        boolean;
  requiresMasking: boolean;
  options?:        string[];
}

export interface RuntimeConfig {
  placementType:            'bearer' | 'basic' | 'header' | 'query';
  headerName?:              string;
  headerFormat?:            string;
  tokenEndpointField?:      string;
  staticTokenEndpoint?:     string;
  clientIdField?:           string;
  clientSecretField?:       string;
  usernameField?:           string;
  passwordField?:           string;
  scopeField?:              string;
  authEndpointField?:       string;
  redirectUriField?:        string;
  issuerField?:             string;
  audienceField?:           string;
  privateKeyField?:         string;
  headerNameField?:         string;
  placementField?:          string;
  refreshStrategy:          'none' | 'auto' | 'on_expiry';
  assertionLifetime?:       number;
  requiresInteractiveSetup?: boolean;
  tokenResponseMapping?: {
    accessToken?:  string;
    refreshToken?: string;
    expiresIn?:    string;
    tokenType?:    string;
  };
}

export interface AuthProtocol {
  name:          string;
  label:         string;
  grantType:     string;
  isActive:      boolean;
  runtimeConfig: RuntimeConfig;
  fields:        AuthField[];
}

// Decrypted credential values keyed by field name
export type CredentialValues = Record<string, string>;

export interface AuthResult {
  headers: Record<string, string>;
  // The resolved token — useful for logging/debugging
  tokenPreview?: string;
}

// ── Token cache (in-memory, per Cloud Function invocation) ────────────────────

interface CachedToken {
  accessToken: string;
  expiresAt:   number;   // ms since epoch
}

const tokenCache = new Map<string, CachedToken>();

function cacheKey(hubId: string, tenantId: string, connectorId: string): string {
  return `${hubId}:${tenantId}:${connectorId}`;
}

function getCachedToken(key: string): string | null {
  const cached = tokenCache.get(key);
  if (!cached) return null;
  // Expire 60s early to avoid using a token right as it expires
  if (Date.now() > cached.expiresAt - 60_000) {
    tokenCache.delete(key);
    return null;
  }
  return cached.accessToken;
}

function setCachedToken(key: string, token: string, expiresIn: number): void {
  tokenCache.set(key, {
    accessToken: token,
    expiresAt:   Date.now() + expiresIn * 1000,
  });
}

// ── Credential loader ─────────────────────────────────────────────────────────

async function loadCredentials(
  hubId:       string,
  tenantId:    string,
  connectorId: string,
): Promise<CredentialValues> {
  const snap = await db
    .doc(`FloPlugHubs/${hubId}/Tenants/${tenantId}/ConnectorCredentials/${connectorId}`)
    .get();

  if (!snap.exists) {
    throw new Error(
      `No credentials configured for connector "${connectorId}" in tenant "${tenantId}"`,
    );
  }

  return snap.data() as CredentialValues;
}

// ── Protocol loader (cached per process) ──────────────────────────────────────

let protocolCache: AuthProtocol[] | null = null;

async function loadProtocols(): Promise<AuthProtocol[]> {
  if (protocolCache) return protocolCache;

  const snap = await db.doc('FloPlugGlobalSettings/AuthenticationTypes').get();
  if (!snap.exists) throw new Error('AuthenticationTypes document not found in Firestore');

  const data = snap.data()!;
  protocolCache = (data.authProtocols as AuthProtocol[]) ?? [];
  return protocolCache;
}

export function getProtocol(protocols: AuthProtocol[], name: string): AuthProtocol {
  const p = protocols.find(p => p.name === name);
  if (!p) throw new Error(`Unknown auth protocol: "${name}"`);
  if (!p.isActive) throw new Error(`Auth protocol "${name}" is disabled`);
  return p;
}

// ── Credential decryption ─────────────────────────────────────────────────────
// TODO: Replace with real KMS/AES decryption.
// Fields with requiresMasking=true are stored encrypted.
// This passthrough works for development but must be replaced before production.

async function decryptCredentials(
  values:   CredentialValues,
  protocol: AuthProtocol,
): Promise<CredentialValues> {
  const decrypted: CredentialValues = { ...values };
  for (const field of protocol.fields) {
    if (field.requiresMasking && decrypted[field.name]) {
      // Replace this with: decrypted[field.name] = await kmsDecrypt(decrypted[field.name]);
      decrypted[field.name] = decrypted[field.name]; // passthrough
    }
  }
  return decrypted;
}

// ── Grant type executors ──────────────────────────────────────────────────────

async function fetchOAuthToken(
  endpoint: string,
  body:     Record<string, string>,
  mapping:  RuntimeConfig['tokenResponseMapping'],
): Promise<{ accessToken: string; expiresIn: number; refreshToken?: string }> {
  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams(body).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed (${res.status}): ${text}`);
  }

  const json = await res.json() as Record<string, unknown>;
  const at   = mapping?.accessToken  ?? 'access_token';
  const ei   = mapping?.expiresIn    ?? 'expires_in';
  const rt   = mapping?.refreshToken ?? 'refresh_token';

  return {
    accessToken:  json[at]  as string,
    expiresIn:    Number(json[ei] ?? 3600),
    refreshToken: json[rt]  as string | undefined,
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function resolveAuthHeaders(
  hubId:        string,
  tenantId:     string,
  connectorId:  string,
  protocolName: string,
): Promise<AuthResult> {

  const cKey = cacheKey(hubId, tenantId, connectorId);

  // ── Check cache first ───────────────────────────────────────────────────────
  const cached = getCachedToken(cKey);
  if (cached) {
    return {
      headers:      { Authorization: `Bearer ${cached}` },
      tokenPreview: `${cached.slice(0, 8)}…`,
    };
  }

  // ── Load protocol + credentials ─────────────────────────────────────────────
  const protocols = await loadProtocols();
  const protocol  = getProtocol(protocols, protocolName);
  const rawCreds  = await loadCredentials(hubId, tenantId, connectorId);
  const creds     = await decryptCredentials(rawCreds, protocol);
  const rc        = protocol.runtimeConfig;

  // Helper to read a field value from creds via config field pointer
  const field = (fieldPointer?: string, fallback = ''): string =>
    fieldPointer ? (creds[fieldPointer] ?? fallback) : fallback;

  // ── Execute grant type ──────────────────────────────────────────────────────

  switch (protocol.grantType) {

    // ── Basic Auth ────────────────────────────────────────────────────────────
    case 'basic': {
      const username = field(rc.usernameField ?? 'username');
      const password = field(rc.passwordField ?? 'password');
      const encoded  = Buffer.from(`${username}:${password}`).toString('base64');
      return {
        headers:      { Authorization: `Basic ${encoded}` },
        tokenPreview: 'Basic ***',
      };
    }

    // ── API Key ───────────────────────────────────────────────────────────────
    case 'api_key': {
      const apiKey     = field(rc.headerNameField ? undefined : 'apiKey', creds.apiKey);
      const headerName = field(rc.headerNameField) || rc.headerName || 'X-API-Key';
      const placement  = field(rc.placementField) || rc.placementType || 'header';

      if (placement === 'query') {
        // Caller must append ?{headerName}={apiKey} to the URL
        // Return as a special key so connector node can handle it
        return {
          headers:      { 'X-FloPlug-ApiKey-Param': `${headerName}=${apiKey}` },
          tokenPreview: `${apiKey.slice(0, 4)}…`,
        };
      }

      return {
        headers:      { [headerName]: apiKey },
        tokenPreview: `${apiKey.slice(0, 4)}…`,
      };
    }

    // ── OAuth2 Client Credentials ─────────────────────────────────────────────
    case 'client_credentials': {
      const endpoint = field(rc.tokenEndpointField) || rc.staticTokenEndpoint!;
      if (!endpoint) throw new Error('No token endpoint configured for client_credentials');

      const { accessToken, expiresIn } = await fetchOAuthToken(endpoint, {
        grant_type:    'client_credentials',
        client_id:     field(rc.clientIdField),
        client_secret: field(rc.clientSecretField),
        ...(field(rc.scopeField) ? { scope: field(rc.scopeField) } : {}),
      }, rc.tokenResponseMapping);

      setCachedToken(cKey, accessToken, expiresIn);

      return {
        headers:      { Authorization: `Bearer ${accessToken}` },
        tokenPreview: `${accessToken.slice(0, 8)}…`,
      };
    }

    // ── OAuth2 Password Grant ─────────────────────────────────────────────────
    case 'password': {
      const endpoint = field(rc.tokenEndpointField);
      if (!endpoint) throw new Error('No token endpoint configured for password grant');

      const { accessToken, expiresIn } = await fetchOAuthToken(endpoint, {
        grant_type:    'password',
        client_id:     field(rc.clientIdField),
        client_secret: field(rc.clientSecretField),
        username:      field(rc.usernameField),
        password:      field(rc.passwordField),
        ...(field(rc.scopeField) ? { scope: field(rc.scopeField) } : {}),
      }, rc.tokenResponseMapping);

      setCachedToken(cKey, accessToken, expiresIn);

      return {
        headers:      { Authorization: `Bearer ${accessToken}` },
        tokenPreview: `${accessToken.slice(0, 8)}…`,
      };
    }

    // ── OAuth2 Auth Code ──────────────────────────────────────────────────────
    // By the time runtime is called, the auth code flow is complete and
    // the access_token + refresh_token are already stored in credentials.
    // Runtime just reads the stored token and refreshes if expired.
    case 'authorization_code': {
      const accessToken  = creds.accessToken;
      const refreshToken = creds.refreshToken;
      const endpoint     = field(rc.tokenEndpointField);

      if (!accessToken && !refreshToken) {
        throw new Error(
          'OAuth2 Auth Code flow requires interactive setup. ' +
          'Tenant must complete the authorization flow first.',
        );
      }

      if (!accessToken && refreshToken && endpoint) {
        // Refresh the token
        const { accessToken: newToken, expiresIn } = await fetchOAuthToken(endpoint, {
          grant_type:    'refresh_token',
          refresh_token: refreshToken,
          client_id:     field(rc.clientIdField),
          client_secret: field(rc.clientSecretField),
        }, rc.tokenResponseMapping);

        setCachedToken(cKey, newToken, expiresIn);
        // TODO: persist new accessToken back to Firestore credential doc

        return {
          headers:      { Authorization: `Bearer ${newToken}` },
          tokenPreview: `${newToken.slice(0, 8)}…`,
        };
      }

      return {
        headers:      { Authorization: `Bearer ${accessToken}` },
        tokenPreview: `${accessToken.slice(0, 8)}…`,
      };
    }

    // ── SAML Assertion ────────────────────────────────────────────────────────
    case 'saml2_bearer': {
      // SAML assertion generation requires signing — this needs a proper
      // SAML library (e.g. node-saml). Placeholder structure shown here.
      // TODO: implement with node-saml or xml-crypto
      const endpoint   = field(rc.tokenEndpointField);
      const issuer     = field(rc.issuerField);
      const audience   = field(rc.audienceField);
      // privateKey is required for signing but not yet consumed — keep for future impl
      void field(rc.privateKeyField);   // suppress unused-var; remove when node-saml is wired

      if (!endpoint || !issuer || !audience) {
        throw new Error('SAML assertion requires tokenEndpoint, issuer, and audience');
      }

      throw new Error(
        'SAML 2.0 Bearer Assertion not yet implemented. ' +
        'Install node-saml and implement assertion signing in authEngine.ts',
      );
    }

    default:
      throw new Error(`Unsupported grant type: "${protocol.grantType}"`);
  }
}
