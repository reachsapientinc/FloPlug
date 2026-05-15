/**
 * FloPlug — Multi-Environment Build Setup
 * ========================================
 *
 * Four Firebase projects, one codebase, four builds.
 * The correct Firebase project config is baked in at build time via .env files.
 *
 * FILE STRUCTURE:
 *   .env.dev         VITE_FIREBASE_PROJECT_ID=floplug-dev   + dev credentials
 *   .env.stage       VITE_FIREBASE_PROJECT_ID=floplug-stage + stage credentials
 *   .env.sb          VITE_FIREBASE_PROJECT_ID=floplug-sb    + sb credentials
 *   .env.prod        VITE_FIREBASE_PROJECT_ID=floplug-prod  + prod credentials
 *
 * Each .env.* file also sets:
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_STORAGE_BUCKET
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
 *
 * BUILD COMMANDS (add to package.json scripts):
 *   "build:dev":   "vite build --mode dev"
 *   "build:stage": "vite build --mode stage"
 *   "build:sb":    "vite build --mode sb"
 *   "build:prod":  "vite build --mode prod"
 *
 * DEPLOY COMMANDS (one per environment):
 *   npm run build:dev   && firebase deploy --only hosting:dev   --project floplug-dev
 *   npm run build:stage && firebase deploy --only hosting:stage --project floplug-stage
 *   npm run build:sb    && firebase deploy --only hosting:sb    --project floplug-sb
 *   npm run build:prod  && firebase deploy --only hosting:prod  --project floplug-prod
 *
 * LOCAL DEVELOPMENT:
 *   vite --mode dev     →  uses .env.dev, connects to floplug-dev Firestore
 *   vite --mode prod    →  uses .env.prod, connects to floplug-prod Firestore
 *
 * NOTE: You do NOT need different vite.config.ts files — Vite's --mode flag
 * automatically loads the right .env.{mode} file. The tenantResolver.ts
 * runtime routing logic is identical in all four builds; only the Firebase
 * credentials differ.
 */

// vite.config.ts — no changes needed from your existing config.
// Just ensure you have the following in firebaseConfig.ts:
//
//   const firebaseConfig = {
//     apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
//     authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
//     projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
//     storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
//     messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
//     appId:             import.meta.env.VITE_FIREBASE_APP_ID,
//   };
//
// And the following firebase.json hosting targets:

export const FIREBASE_JSON_HOSTING = `
{
  "hosting": [
    {
      "target": "dev",
      "public": "dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    },
    {
      "target": "stage",
      "public": "dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    },
    {
      "target": "sb",
      "public": "dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    },
    {
      "target": "prod",
      "public": "dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    }
  ]
}
`;

export const FIREBASERC = `
{
  "projects": {
    "dev":   "floplug-dev",
    "stage": "floplug-stage",
    "sb":    "floplug-sb",
    "prod":  "floplug-prod"
  },
  "targets": {
    "floplug-dev": {
      "hosting": { "dev": ["floplug-dev"] }
    },
    "floplug-stage": {
      "hosting": { "stage": ["floplug-stage"] }
    },
    "floplug-sb": {
      "hosting": { "sb": ["floplug-sb"] }
    },
    "floplug-prod": {
      "hosting": { "prod": ["floplug-prod"] }
    }
  }
}
`;

// ── Firestore Collection Group Index requirements ─────────────────────────────
//
// Create these in Firebase Console → each project → Firestore → Indexes → Collection group:
//
// Collection: Tenants
// Fields:     slug ASC, tenantType ASC
// Scope:      Collection group
//
// (Required for tenantResolver.ts → fetchTenantDoc)
//
// ── FloPlugAdminUsers top-level collection ───────────────────────────────────
//
// Create in each Firebase project (or just prod if you mirror admins):
//
// FloPlugAdminUsers/{uid}
//   email:       string
//   displayName: string
//   role:        'product_admin' | 'developer'
//   allowedEnvs: string[]   e.g. ['dev', 'stage', 'sb', 'prod']
//   isActive:    boolean
//   createdAt:   Timestamp
