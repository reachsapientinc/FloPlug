// functions/src/scripts/addAuthStyle.cjs
const admin = require("firebase-admin");
const fs    = require("fs");
const path  = require("path");

const serviceAccount = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "./floplug-dev-serviceAccountKey.json"),
    "utf-8"
  )
);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

// Maps existing protocol names → authStyle
const AUTH_STYLE_MAP = {
  basic:                      'httpBasic',
  api_key:                    'apiKeyHeader',
  oauth2_client_credentials:  'oauth2ClientCreds',
  oauth2_password:            'oauth2ClientCreds',
  oauth2_auth_code:           'oauth2ClientCreds',
  saml_assertion:             'bearerToken',
};

// New WSSE protocol to add
const WSSE_PROTOCOL = {
  name:        'wsse_basic',
  label:       'WSSE Username Token (Workday SOAP)',
  grantType:   'wsse',
  isActive:    true,
  sortOrder:   7,
  authStyle:   'wsseHeader',
  description: 'Workday SOAP APIs require credentials inside the SOAP envelope as a WSSE UsernameToken header. Use this for all Workday SOAP endpoints.',
  runtimeConfig: {
    placementType:   'soapHeader',
    refreshStrategy: 'none',
  },
  fields: [
    { name: 'username', label: 'Username', fieldType: 'text',     required: true,  requiresMasking: false, placeholder: 'your-workday-username', helpText: 'Workday integration system user' },
    { name: 'password', label: 'Password', fieldType: 'password', required: true,  requiresMasking: true,  placeholder: '••••••••',              helpText: 'Will be stored encrypted' },
  ],
};

const seed = async () => {
  const db     = admin.firestore();
  const docRef = db.doc('FloPlugGlobalSettings/AuthenticationTypes');
  const snap   = await docRef.get();

  if (!snap.exists) {
    console.error('❌ AuthenticationTypes doc not found — run seedAuthProtocols.cjs first');
    process.exit(1);
  }

  const existing = snap.data().authProtocols ?? [];

  // 1. Patch authStyle onto existing protocols
  const patched = existing.map(p => ({
    ...p,
    authStyle: AUTH_STYLE_MAP[p.name] ?? 'httpBasic',
  }));

  // 2. Add WSSE if not already there
  const hasWsse = patched.some(p => p.name === 'wsse_basic');
  const updated = hasWsse ? patched : [...patched, WSSE_PROTOCOL];

  await docRef.set({ authProtocols: updated }, { merge: true });

  console.log(`✓ Patched ${patched.length} existing protocols with authStyle`);
  if (!hasWsse) console.log(`✓ Added wsse_basic protocol`);
  console.log('✅ Done');
  process.exit(0);
};

seed().catch(console.error);