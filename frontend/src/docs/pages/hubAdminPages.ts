import type { DocPage } from '../types';

export const HUB_ADMIN_PAGES: DocPage[] = [
  {
    id: 'admin-overview',
    slug: 'hub-overview',
    title: 'Hub Admin portal overview',
    category: 'product',
    audience: 'all',
    group: 'hub-admin',
    groupOrder: 1,
    summary: 'Product guide — how hub admins configure plugs, connections, and FloActions (not your live catalog).',
    updatedAt: '2026-06-01',
    sections: [
      {
        paragraphs: [
          'This is product documentation explaining how to perform hub admin tasks. For a live list of what is configured on your hub, open Hub configuration (generated from your tenant data).',
          'Hub admins configure connectors, connections, plugs, and FloActions that developers use on the canvas.',
        ],
        bullets: [
          'Hub Admin portal — hub admins only (profile menu → Hub Admin).',
          'Plugs — reusable HTTP/email integrations for the palette.',
          'Connections — credentials bound to connectors.',
          'Actions — FloKits exposed as FloAction nodes for developers.',
          'Users — invite hub users and assign roles/permissions.',
        ],
      },
      {
        callout: {
          type: 'tip',
          text: 'Profile → Hub configuration shows plugs, connections, and FloActions actually enabled on this hub (live data).',
        },
      },
      {
        callout: {
          type: 'warning',
          text: 'Changes to plugs and FloActions affect all developers on this hub immediately after save.',
        },
      },
    ],
  },
  {
    id: 'admin-plugs',
    slug: 'plugs',
    title: 'Managing plugs',
    category: 'product',
    audience: 'all',
    group: 'hub-admin',
    groupOrder: 2,
    summary: 'Create plugs, URL patterns, variable hints, and email plugs.',
    updatedAt: '2026-06-01',
    sections: [
      {
        bullets: [
          'Hub Admin portal → Plugs → create or edit a plug configuration.',
          'Assign connector, auth protocol, and allowed connections.',
          'URL pattern + variable hints drive the developer inspector on canvas.',
          'smtp_basic — admin captures SMTP credentials only; routing (to/cc/body) is on the canvas plug node.',
        ],
      },
    ],
  },
  {
    id: 'admin-connections',
    slug: 'connections',
    title: 'Connections',
    category: 'product',
    audience: 'all',
    group: 'hub-admin',
    groupOrder: 3,
    summary: 'FloConnections, credentials, and plug/FloAction binding.',
    updatedAt: '2026-06-01',
    sections: [
      {
        bullets: [
          'Connections store credentials for a connector (OAuth, API key, basic auth, etc.).',
          'Plugs reference allowedConnectionIds — developers pick from that list on canvas.',
          'Rotate credentials here; canvas nodes use connectionId at runtime.',
        ],
      },
    ],
  },
  {
    id: 'admin-actions',
    slug: 'floactions-and-kits',
    title: 'FloActions, FloKits & connectors',
    category: 'product',
    audience: 'all',
    group: 'hub-admin',
    groupOrder: 4,
    summary: 'Enable connector actions for developers as FloAction palette items.',
    updatedAt: '2026-06-01',
    sections: [
      {
        paragraphs: [
          'FloKits group connector actions. Hub admins enable specific actions and connections for the developer palette.',
        ],
        bullets: [
          'Actions tab — create FloAction nodes linked to a FloKit.',
          'Choose actionIds, default connection, and allowed connections.',
          'Developers drag ⚡ FloAction items onto the canvas; live hub config is applied at runtime.',
          'Platform-level connector registry is managed in the FloPlug product admin portal.',
        ],
      },
    ],
  },
  {
    id: 'admin-users',
    slug: 'users',
    title: 'Hub users & permissions',
    category: 'product',
    audience: 'all',
    group: 'hub-admin',
    groupOrder: 5,
    summary: 'Invite users, roles, and workspace access.',
    updatedAt: '2026-06-01',
    sections: [
      {
        bullets: [
          'Invite by email — assign developer or hub admin role.',
          'Permissions gate scheduler, plug management, and flo invoke.',
          'Workspace ids scope which flos a developer can open.',
        ],
      },
    ],
  },
  {
    id: 'admin-scheduler',
    slug: 'scheduler',
    title: 'Scheduler',
    category: 'product',
    audience: 'all',
    group: 'hub-admin',
    groupOrder: 6,
    summary: 'Cron and interval schedules for published flos.',
    updatedAt: '2026-06-01',
    sections: [
      {
        bullets: [
          'Requires invoke:flos permission or hub admin.',
          'Only published flos should be scheduled for production.',
          'Review runs in FloExecution Hub.',
        ],
      },
    ],
  },
  {
    id: 'admin-keys',
    slug: 'key-vault',
    title: 'Key vault',
    category: 'product',
    audience: 'all',
    group: 'hub-admin',
    groupOrder: 7,
    summary: 'SSH, PGP, and API secrets for advanced connectors.',
    updatedAt: '2026-06-01',
    sections: [
      {
        paragraphs: ['Store secrets referenced by connections and plugs without embedding them in flo graphs.'],
      },
    ],
  },
  {
    id: 'admin-alerts',
    slug: 'alerts',
    title: 'Alerts',
    category: 'product',
    audience: 'all',
    group: 'hub-admin',
    groupOrder: 8,
    summary: 'Failure notifications and monitoring hooks.',
    updatedAt: '2026-06-01',
    sections: [
      {
        bullets: [
          'Configure alert rules for failed runs or validation issues.',
          'Integrates with FloExecution Hub execution logs.',
        ],
      },
    ],
  },
];
