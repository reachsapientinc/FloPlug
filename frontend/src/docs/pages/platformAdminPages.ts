import type { DocPage } from '../types';

/** FloPlug product admin portal — internal only, not visible to hub tenants. */
export const PLATFORM_ADMIN_PAGES: DocPage[] = [
  {
    id: 'platform-overview',
    slug: 'platform-overview',
    title: 'Platform operations overview',
    category: 'platform-internal',
    audience: 'platform-staff',
    summary: 'FloPlug staff portal — provisioning hubs, connectors, FloKits, tiers, and global users.',
    updatedAt: '2026-05-22',
    sections: [
      {
        paragraphs: [
          'This documentation is for FloPlug product administrators only. Hub tenants never see this portal or these pages.',
        ],
        bullets: [
          'dev / stage / sb / prod.floplug.xyz — product admin portal (no tenant slug).',
          'Hub provisioning — create subscriber hubs and tenant environments.',
          'Connector registry — integrations available to all hubs.',
          'Schema & FloKits — actions developers consume via hub admins.',
          'Tiers & auth protocols — subscription and security baselines.',
        ],
      },
    ],
  },
  {
    id: 'platform-hubs',
    slug: 'hub-provisioning',
    title: 'Hub provisioning',
    category: 'platform-internal',
    audience: 'platform-staff',
    summary: 'Create hubs, tenants, branding, and environment activation.',
    updatedAt: '2026-05-22',
    sections: [
      {
        bullets: [
          'Hub Management → provision hub with tenant slug and env (dev/stage/sb/prod).',
          'Set branding (logo, accent) shown in tenant designer top bar.',
          'Activate tenant before customers can log in.',
          'Assign entitlements / tier limits that gate connector catalog.',
        ],
      },
    ],
  },
  {
    id: 'platform-connectors',
    slug: 'connector-registry',
    title: 'Connector & schema registry',
    category: 'platform-internal',
    audience: 'platform-staff',
    summary: 'Register connectors, upload schemas, define actions and FloKits.',
    updatedAt: '2026-05-22',
    sections: [
      {
        bullets: [
          'Connector registry — HTTP, ERP, HRIS connectors available platform-wide.',
          'Schema management — WSDL/XSD/OpenAPI upload and action registration.',
          'FloKit management — bundle actions + schema version for hub admins to enable.',
          'Hub admins then enable FloActions per tenant — see hub configuration doc on tenant portal.',
        ],
      },
    ],
  },
  {
    id: 'platform-users',
    slug: 'product-users',
    title: 'Product & hub users',
    category: 'platform-internal',
    audience: 'platform-staff',
    summary: 'Global product admins vs hub-scoped tenant users.',
    updatedAt: '2026-05-22',
    sections: [
      {
        bullets: [
          'Product admin users — access this portal (FloPlug staff).',
          'Hub users — invited by hub admin on tenant URL; never access platform portal.',
          'Claims: isHubAdmin, permissions[], workspaceIds on tenant tokens.',
        ],
      },
    ],
  },
];
