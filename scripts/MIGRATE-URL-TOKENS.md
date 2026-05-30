# Connector URL token migration

Migrates legacy connector URL tokens (`hostname`, `tenantKey`, `path`, …) to generic
`urlToken1`, `urlToken2`, … **in place** — auth protocol config, schemas, and FloKit
subcollections are preserved.

## What it updates

| Location | Changes |
|----------|---------|
| `FloPlugConnectors/{connectorId}` | `urlTokens` → `urlTokenN`, `urlPatternPreview` |
| `…/FloKits/{kitId}` | `urlTokenValues` from `serviceModule` / `serviceVersion` |
| `FloPlugHubs/…/FloConnections/{id}` | `urlTokenValues` from `hostname` / `tenantKey` / `baseUrl` |
| `FloPlugHubs/…/Plugs/{id}` | Remap `plugUrlValuesByConnection`, refresh snapshots |
| `FloPlugHubs/…/FloActionNodes/{id}` | Remap `floActionUrlValuesByConnection`, refresh snapshots |
| `FloPlugHubs/…/Workspaces/…/Flos/{id}` | Remap canvas `urlVariables` on plug/FloAction nodes (draft + published + versions) |

**Not touched:** `supportedAuthTypes`, `authOverride`, schemas, credentials, FloKitActions, entitlements.

## Prerequisites

1. Build shared package and sync into functions:

```bash
cd packages/shared && npm run build
rsync -a dist/ ../../functions/shared/dist/
```

2. Authenticate to Firebase (pick one):

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
# or
firebase login
export GCLOUD_PROJECT=your-project-id
```

## Usage

Preview (no writes):

```bash
cd functions
npm run migrate:url-tokens -- --connector-id=workday --dry-run
```

Apply:

```bash
npm run migrate:url-tokens -- --connector-id=workday --apply
```

All connectors that have `urlTokens`:

```bash
npm run migrate:url-tokens -- --all --apply
```

Limit to one hub/tenant:

```bash
npm run migrate:url-tokens -- --connector-id=workday --hub-id=myHub --tenant-id=prod --apply
```

## Recommended workflow

1. Run `--dry-run` and review the token remap line + counts.
2. Back up Firestore (export) for the connector doc and one tenant’s plugs/connections.
3. Run `--apply` for a single non-prod tenant first (`--hub-id` / `--tenant-id`).
4. Smoke-test: connection URL preview, plug URL preview, one Flo run.
5. Run for remaining tenants / `--all`.

## Notes

- Legacy fields (`hostname`, `serviceModule`, …) are **kept** for backward compatibility; `urlTokenValues` is added alongside them.
- If connector tokens are already `urlTokenN`, the script still migrates dependent **values** using ordinal fallback (1st connection token ← `hostname`, 2nd ← `tenantKey`, etc.).
- Re-run is safe: already-migrated token keys are idempotent.
