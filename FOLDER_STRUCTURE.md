# FloPlug — Project Folder Structure

## Frontend  (`frontend/src/`)

```
frontend/src/
├── App.tsx                          ← Top-level router (admin / tenant / marketing)
├── App.css                          ← Global design system tokens
├── firebaseConfig.ts                ← Firebase SDK initialisation (reads VITE_ env vars)
│
├── utils/
│   └── tenantResolver.ts            ← URL → mode detection + Firestore tenant lookup
│
├── hooks/
│   └── useTenantAuth.ts             ← useAdminAuth + useTenantAuth (localStorage sentinel)
│
└── components/
    ├── AdminDashboard.tsx           ← Product admin portal shell + login gate
    ├── TenantPortal.tsx             ← Customer-facing portal shell + login gate
    ├── MarketingSite.tsx            ← floplug.xyz landing page
    ├── TenantLogin.tsx              ← Branded login form used by TenantPortal
    ├── Designer.tsx                 ← ReactFlow canvas (lazy-loaded after auth)
    ├── NodePaletteAndInspector.tsx  ← Left palette + right inspector panels
    │
    ├── nodes/
    │   ├── BaseNode.tsx             ← Shared dark node shell + NodeField/Input/Button
    │   ├── WorkdayNode.tsx          ← Workday HRIS connector node
    │   └── ConnectorNodes.tsx       ← Salesforce, SAP, Oracle, Mapper, Filter nodes
    │
    └── modules/                     ← AdminDashboard sub-modules (one per sidebar item)
        ├── HubManagement.tsx
        ├── TierManagement.tsx
        ├── AuthManagement.tsx
        ├── ConnectorManagement.tsx
        └── UserManagement.tsx       ← Product users + hub users invite/manage UI
```

## Functions  (`functions/src/`)

```
functions/src/
├── index.ts                         ← Entry point; exports all Cloud Functions
├── validateAdminUser.ts             ← validateAdminUser function (re-exported from index)
│
├── services/
│   ├── provisioning.ts              ← provisionHubAndTenants implementation
│   └── provisionUsers.ts            ← inviteAdminUser, inviteHubUser, updateRoles
│
├── types/
│   ├── types.ts                     ← All shared TS interfaces / type aliases
│   ├── audit.ts                     ← FloPlugAudit interface
│   └── importTypes.ts               ← Barrel re-export of types (NOT provisioning)
│
├── utils/
│   ├── audit.ts                     ← createAudit() helper function
│   └── uniqueGuard.ts               ← guardUniqueId() Firestore lock helper
│
└── helpers/
    └── settingsHelper.ts            ← getGlobalSetting() helper
```

## Key import path rules

| From file                           | To file                     | Import path                        |
|-------------------------------------|-----------------------------|------------------------------------|
| `index.ts`                          | `validateAdminUser.ts`      | `'./validateAdminUser.js'`         |
| `index.ts`                          | `services/provisioning.ts`  | `'./services/provisioning.js'`     |
| `index.ts`                          | `services/provisionUsers.ts`| `'./services/provisionUsers.js'`   |
| `index.ts`                          | `types/importTypes.ts`      | `'./types/importTypes.js'`         |
| `services/provisioning.ts`          | `types/importTypes.ts`      | `'../types/importTypes.js'`        |
| `services/provisioning.ts`          | `utils/audit.ts`            | `'../utils/audit.js'`              |
| `services/provisionUsers.ts`        | `types/importTypes.ts`      | `'../types/importTypes.js'`        |
| `types/importTypes.ts`              | `types/audit.ts`            | `'./audit.js'`                     |
| `types/importTypes.ts`              | `types/types.ts`            | `'./types.js'`                     |

## Firestore collections (top-level)

| Collection         | Purpose                                      |
|--------------------|----------------------------------------------|
| `FloPlugUsers`     | ALL FloPlug product users (admins, devs)     |
| `FloPlugTiers`     | Subscription tier definitions                |
| `FloPlugRegistry`  | Global slug lock registry                    |
| `FloPlugHubs`      | Hub documents with nested Tenants/Users/etc  |
| `FloPlugAuthOptions` | Auth strategy options                      |
| `FloPlugConnectors`  | Registered connector definitions            |
