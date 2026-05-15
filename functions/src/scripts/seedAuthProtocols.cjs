/**
 * scripts/seedAuthProtocols.ts
 *
 * One-time seed script — writes the canonical AuthProtocol definitions
 * to Firestore at FloPlugGlobalSettings/AuthenticationTypes.
 *
 * Run with:
 *   npx ts-node scripts/seedAuthProtocols.ts
 *   OR
 *   npx tsx scripts/seedAuthProtocols.ts
 *
 * Prerequisites:
 *   - GOOGLE_APPLICATION_CREDENTIALS env var pointing to your service account JSON
 *     OR run from inside a GCP environment (Cloud Shell, Cloud Run, etc.)
 *   - npm install firebase-admin tsx (or ts-node)
 *
 * Safe to re-run — uses { merge: false } to overwrite cleanly.
 * To do a dry-run without writing, set DRY_RUN=true:
 *   DRY_RUN=true npx tsx scripts/seedAuthProtocols.ts
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp }       from 'firebase-admin/firestore';

// ── Init ──────────────────────────────────────────────────────────────────────

if (!getApps().length) {
  // If GOOGLE_APPLICATION_CREDENTIALS is set, cert() picks it up automatically.
  // Otherwise pass the path explicitly:
  //   cert(require('./service-account.json'))
  initializeApp({ credential: applicationDefault() });
}

const db     = getFirestore();
const DRY_RUN = process.env.DRY_RUN === 'true';

// ── Auth Protocol Definitions ─────────────────────────────────────────────────

const AUTH_PROTOCOLS = [

  // ── 1. Basic Auth ───────────────────────────────────────────────────────────
  {
    name:      'basic',
    label:     'Basic Auth (Username & Password)',
    grantType: 'basic',
    isActive:  true,
    sortOrder: 1,
    description: 'Credentials sent as Base64-encoded Authorization header on every request. Simple but less secure — use only over HTTPS.',

    runtimeConfig: {
      placementType:   'header',
      headerName:      'Authorization',
      headerFormat:    'Basic {base64(username:password)}',
      refreshStrategy: 'none',
      // No token endpoint — creds attached directly to every request
    },

    fields: [
      { name: 'username',  label: 'Username', fieldType: 'text',     required: true,  requiresMasking: false, placeholder: 'your-username',  helpText: 'The service account username' },
      { name: 'password',  label: 'Password', fieldType: 'password', required: true,  requiresMasking: true,  placeholder: '••••••••',        helpText: 'Will be stored encrypted' },
    ],
  },

  // ── 2. API Key ──────────────────────────────────────────────────────────────
  {
    name:      'api_key',
    label:     'API Key',
    grantType: 'api_key',
    isActive:  true,
    sortOrder: 2,
    description: 'A static key sent as a request header or query parameter. Common for simpler SaaS APIs.',

    runtimeConfig: {
      placementType:        'header',           // 'header' | 'query'
      headerName:           'X-API-Key',        // default — admin can override
      headerNameField:      'headerName',       // which credential field overrides this
      placementField:       'placement',        // which credential field sets header/query
      refreshStrategy:      'none',
    },

    fields: [
      { name: 'apiKey',     label: 'API Key',     fieldType: 'password', required: true,  requiresMasking: true,  placeholder: '••••••••',       helpText: 'Will be stored encrypted' },
      { name: 'headerName', label: 'Header Name', fieldType: 'text',     required: false, requiresMasking: false, placeholder: 'X-API-Key',      helpText: 'Leave blank to use X-API-Key' },
      { name: 'placement',  label: 'Placement',   fieldType: 'select',   required: true,  requiresMasking: false, placeholder: '',               helpText: 'How the key is sent', options: ['header', 'query'] },
    ],
  },

  // ── 3. OAuth2 Client Credentials ────────────────────────────────────────────
  {
    name:      'oauth2_client_credentials',
    label:     'OAuth 2.0 — Client Credentials',
    grantType: 'client_credentials',
    isActive:  true,
    sortOrder: 3,
    description: 'Machine-to-machine OAuth2. Client exchanges its ID + Secret for a bearer token. Most common for B2B ERP/CRM integrations (Salesforce, SAP, Oracle).',

    runtimeConfig: {
      placementType:        'bearer',
      headerName:           'Authorization',
      headerFormat:         'Bearer {access_token}',
      tokenEndpointField:   'tokenEndpoint',    // field name that holds the token URL
      clientIdField:        'clientId',
      clientSecretField:    'clientSecret',
      scopeField:           'scope',
      refreshStrategy:      'on_expiry',        // auto-refresh when expires_in reached
      tokenResponseMapping: {
        accessToken:  'access_token',
        expiresIn:    'expires_in',
        tokenType:    'token_type',
      },
    },

    fields: [
      { name: 'tokenEndpoint', label: 'Token Endpoint URL', fieldType: 'url',      required: true,  requiresMasking: false, placeholder: 'https://auth.example.com/oauth/token', helpText: 'The URL to POST to for a token' },
      { name: 'clientId',      label: 'Client ID',          fieldType: 'text',     required: true,  requiresMasking: false, placeholder: 'your-client-id',  helpText: '' },
      { name: 'clientSecret',  label: 'Client Secret',      fieldType: 'password', required: true,  requiresMasking: true,  placeholder: '••••••••',        helpText: 'Will be stored encrypted' },
      { name: 'scope',         label: 'Scope(s)',            fieldType: 'text',     required: false, requiresMasking: false, placeholder: 'read write',      helpText: 'Space-separated OAuth scopes. Leave blank if not required.' },
    ],
  },

  // ── 4. OAuth2 Password Grant ─────────────────────────────────────────────────
  {
    name:      'oauth2_password',
    label:     'OAuth 2.0 — Password Grant',
    grantType: 'password',
    isActive:  true,
    sortOrder: 4,
    description: 'User credentials sent directly to the token endpoint. Used by Workday and some older ERP systems. Deprecated in OAuth 2.1 but still widely supported.',

    runtimeConfig: {
      placementType:        'bearer',
      headerName:           'Authorization',
      headerFormat:         'Bearer {access_token}',
      tokenEndpointField:   'tokenEndpoint',
      clientIdField:        'clientId',
      clientSecretField:    'clientSecret',
      usernameField:        'username',
      passwordField:        'password',
      scopeField:           'scope',
      refreshStrategy:      'on_expiry',
      tokenResponseMapping: {
        accessToken:   'access_token',
        refreshToken:  'refresh_token',
        expiresIn:     'expires_in',
      },
    },

    fields: [
      { name: 'tokenEndpoint', label: 'Token Endpoint URL', fieldType: 'url',      required: true,  requiresMasking: false, placeholder: 'https://wd5.myworkday.com/ccx/oauth2/{tenant}/token', helpText: '' },
      { name: 'clientId',      label: 'Client ID',          fieldType: 'text',     required: true,  requiresMasking: false, placeholder: 'your-client-id',  helpText: '' },
      { name: 'clientSecret',  label: 'Client Secret',      fieldType: 'password', required: true,  requiresMasking: true,  placeholder: '••••••••',        helpText: 'Will be stored encrypted' },
      { name: 'username',      label: 'Username',            fieldType: 'text',     required: true,  requiresMasking: false, placeholder: 'service-account@company.com', helpText: '' },
      { name: 'password',      label: 'Password',            fieldType: 'password', required: true,  requiresMasking: true,  placeholder: '••••••••',        helpText: 'Will be stored encrypted' },
      { name: 'scope',         label: 'Scope(s)',            fieldType: 'text',     required: false, requiresMasking: false, placeholder: '',               helpText: 'Leave blank if not required' },
    ],
  },

  // ── 5. OAuth2 Authorization Code ─────────────────────────────────────────────
  {
    name:      'oauth2_auth_code',
    label:     'OAuth 2.0 — Authorization Code',
    grantType: 'authorization_code',
    isActive:  true,
    sortOrder: 5,
    description: 'User-delegated access via browser redirect. Tenant admin authorizes access interactively. Used by some CRMs and Microsoft/Google APIs.',

    runtimeConfig: {
      placementType:          'bearer',
      headerName:             'Authorization',
      headerFormat:           'Bearer {access_token}',
      authEndpointField:      'authEndpoint',
      tokenEndpointField:     'tokenEndpoint',
      clientIdField:          'clientId',
      clientSecretField:      'clientSecret',
      scopeField:             'scope',
      redirectUriField:       'redirectUri',
      refreshStrategy:        'auto',           // use refresh_token proactively
      requiresInteractiveSetup: true,           // signals UI to show OAuth consent flow
      tokenResponseMapping: {
        accessToken:  'access_token',
        refreshToken: 'refresh_token',
        expiresIn:    'expires_in',
      },
    },

    fields: [
      { name: 'authEndpoint',  label: 'Authorization Endpoint', fieldType: 'url',      required: true,  requiresMasking: false, placeholder: 'https://login.microsoftonline.com/{tenant}/oauth2/authorize', helpText: '' },
      { name: 'tokenEndpoint', label: 'Token Endpoint',         fieldType: 'url',      required: true,  requiresMasking: false, placeholder: 'https://login.microsoftonline.com/{tenant}/oauth2/token',     helpText: '' },
      { name: 'clientId',      label: 'Client ID / App ID',     fieldType: 'text',     required: true,  requiresMasking: false, placeholder: '',  helpText: '' },
      { name: 'clientSecret',  label: 'Client Secret',          fieldType: 'password', required: true,  requiresMasking: true,  placeholder: '••••••••', helpText: 'Will be stored encrypted' },
      { name: 'scope',         label: 'Scope(s)',                fieldType: 'text',     required: false, requiresMasking: false, placeholder: 'openid profile email', helpText: 'Space-separated' },
      { name: 'redirectUri',   label: 'Redirect URI',            fieldType: 'url',      required: true,  requiresMasking: false, placeholder: 'https://yourapp.com/oauth/callback', helpText: 'Must match what is registered in the identity provider' },
    ],
  },

  // ── 6. SAML Assertion ────────────────────────────────────────────────────────
  {
    name:      'saml_assertion',
    label:     'SAML 2.0 Bearer Assertion',
    grantType: 'saml2_bearer',
    isActive:  true,
    sortOrder: 6,
    description: 'Enterprise SSO. A signed SAML assertion is exchanged for a bearer token. Used by Workday production environments and some Oracle/SAP deployments.',

    runtimeConfig: {
      placementType:       'bearer',
      headerName:          'Authorization',
      headerFormat:        'Bearer {access_token}',
      tokenEndpointField:  'tokenEndpoint',
      issuerField:         'issuer',
      audienceField:       'audience',
      privateKeyField:     'privateKey',
      assertionLifetime:   300,               // seconds the assertion is valid
      refreshStrategy:     'on_expiry',
      tokenResponseMapping: {
        accessToken: 'access_token',
        expiresIn:   'expires_in',
      },
    },

    fields: [
      { name: 'tokenEndpoint', label: 'Token Endpoint URL', fieldType: 'url',      required: true,  requiresMasking: false, placeholder: 'https://wd5.myworkday.com/ccx/oauth2/{tenant}/token', helpText: '' },
      { name: 'issuer',        label: 'Issuer (Entity ID)', fieldType: 'text',     required: true,  requiresMasking: false, placeholder: 'your-app-entity-id', helpText: 'Must match what is registered in the identity provider' },
      { name: 'audience',      label: 'Audience',           fieldType: 'url',      required: true,  requiresMasking: false, placeholder: 'https://wd5.myworkday.com/ccx/oauth2/{tenant}', helpText: '' },
      { name: 'privateKey',    label: 'Private Key (PEM)',  fieldType: 'textarea', required: true,  requiresMasking: true,  placeholder: '-----BEGIN RSA PRIVATE KEY-----\n...', helpText: 'PEM-encoded private key. Will be stored encrypted.' },
      { name: 'certificate',   label: 'Certificate (PEM)', fieldType: 'textarea', required: false, requiresMasking: false, placeholder: '-----BEGIN CERTIFICATE-----\n...', helpText: 'Your public certificate registered with the identity provider' },
    ],
  },

];

// ── Seed function ─────────────────────────────────────────────────────────────

async function seed() {
  console.log(`\n🌱 FloPlug Auth Protocol Seed`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE WRITE'}`);
  console.log(`   Target: FloPlugGlobalSettings/AuthenticationTypes\n`);

  const docRef = db.doc('FloPlugGlobalSettings/AuthenticationTypes');

  const payload = {
    authProtocols: AUTH_PROTOCOLS,
    // Keep the old authTypes array intact if it exists — merge handles this
    schemaVersion: 2,
    updatedAt:     Timestamp.now(),
    updatedBy:     'seed-script',
  };

  if (DRY_RUN) {
    console.log('📋 Payload that would be written:\n');
    console.log(JSON.stringify(payload, null, 2));
    console.log('\n✅ Dry run complete — nothing written.');
    return;
  }

  try {
    // { merge: true } preserves any existing authTypes array and other fields
    await docRef.set(payload, { merge: true });

    console.log(`✅ Seeded ${AUTH_PROTOCOLS.length} auth protocols:\n`);
    for (const p of AUTH_PROTOCOLS) {
      console.log(`   ${p.sortOrder}. ${p.label} (${p.name}) — ${p.fields.length} fields`);
    }
    console.log('\n🎉 Done. AuthManagement can now read from authProtocols array.');
  } catch (e: any) {
    console.error('❌ Seed failed:', e.message);
    process.exit(1);
  }
}

seed();