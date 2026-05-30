import type { DocPage } from '../types';

/** Product-level meta: documentation tiers (visible to all hub users). */
export const PRODUCT_META_PAGES: DocPage[] = [
  {
    id: 'doc-architecture',
    slug: 'documentation-tiers',
    title: 'Types of documentation in FloPlug',
    category: 'product',
    audience: 'all',
    summary: 'Product help, hub configuration, product configuration (staff), and platform operations.',
    updatedAt: '2026-05-22',
    sections: [
      {
        heading: '1. Product help (this manual)',
        paragraphs: [
          'Static guides shipped with FloPlug: designer features, SubFlo, expressions, how to use the Hub Admin portal, releases, and troubleshooting patterns.',
        ],
        bullets: [
          'Same content for every hub on a given product build.',
          'Updated when FloPlug ships a release (edited in code, not from your hub data).',
          'Eventually linked from the public marketing site for feature discovery.',
          'Includes how-to guides for hub admin tasks — not a live list of your plugs.',
        ],
      },
      {
        heading: '2. Hub configuration (tenant live catalog)',
        paragraphs: [
          'A live document generated from what your hub admin saved in the Hub Admin portal: plugs, connections, and FloActions on this tenant.',
        ],
        bullets: [
          'Open Profile → Hub configuration, or Product help → Hub configuration.',
          'Refreshes from Firestore when you click Refresh — reflects Hub Admin portal saves.',
          'Visible to all authenticated users on this hub (developers and admins).',
          'Use this to see what is enabled and to pinpoint admin vs designer issues.',
          'Roadmap: per-flo auto documentation similar to this catalog.',
        ],
        callout: {
          type: 'info',
          text: 'Hub configuration is NOT product documentation — it is your tenant’s integration catalog.',
        },
      },
      {
        heading: '3. Product configuration (FloPlug staff, platform portal)',
        paragraphs: [
          'A live catalog of connectors, FloKits, and actions registered in the Product Admin portal (dev/staging/prod product URLs). For the product team to see what platform features exist — not what a specific hub enabled.',
        ],
        bullets: [
          'Available only on the Product Admin portal (e.g. dev.floplug.xyz), not on tenant hub URLs.',
          'Hub tenants see entitlements and hub config — not the full platform registry.',
          'Schemas are managed in Product Admin → Schema management (listed separately for now).',
        ],
      },
      {
        heading: '4. Platform operations (FloPlug staff runbooks)',
        paragraphs: [
          'Internal how-to guides for provisioning hubs, connector registry, tiers, schema workflows, and product user maintenance. Static runbooks on the Product Admin portal — separate from the live product configuration catalog.',
        ],
      },
      {
        callout: {
          type: 'tip',
          text: 'Hub Admin portal = tenant hub setup. Product Admin portal = FloPlug staff platform work. Do not confuse the two when saving or reading live configuration docs.',
        },
      },
    ],
  },
  {
    id: 'maintaining-product-help',
    slug: 'maintaining-product-help',
    title: 'Maintaining product help (FloPlug team)',
    category: 'product',
    audience: 'platform-staff',
    summary: 'How product help pages are structured in code — for FloPlug releases only.',
    updatedAt: '2026-05-22',
    sections: [
      {
        heading: 'Where product help lives',
        bullets: [
          'frontend/src/docs/pages/developerPages.ts — designer & runtime features',
          'frontend/src/docs/pages/hubAdminPages.ts — how to perform hub admin tasks (product guide)',
          'frontend/src/docs/pages/metaPages.ts — documentation tier explanations',
          'frontend/src/docs/pages/platformAdminPages.ts — internal platform ops (staff portal only)',
          'Hub configuration — HubConfigDocView.tsx (reads tenant hub data)',
          'Product configuration — ProductConfigDocView.tsx (reads FloPlugConnectors registry)',
        ],
      },
      {
        heading: 'Sample: new product help page',
        code: `{
  id: 'product-webhooks',
  slug: 'webhooks',
  title: 'Inbound webhooks',
  category: 'product',
  audience: 'all',
  summary: 'How webhook triggers work in FloPlug.',
  updatedAt: '2026-05-22',
  sections: [{ bullets: ['Publish flo first', '…'] }],
}`,
      },
      {
        callout: {
          type: 'warning',
          text: 'Do not put secrets or tenant PII in product help — it ships to all hubs. Live configuration docs never expose credentials.',
        },
      },
    ],
  },
];
