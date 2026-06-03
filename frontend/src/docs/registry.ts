import type { DocCategory, DocCategoryMeta, DocGroup, DocPage, DocPortal } from './types';

export interface DocGroupMeta {
  id:    DocGroup;
  label: string;
  icon:  string;
  order: number;
}

/** Ordered list of sidebar groups for the tenant/product portal */
export const PRODUCT_GROUPS: DocGroupMeta[] = [
  { id: 'getting-started',   label: 'Getting Started',     icon: '🚀', order: 1 },
  { id: 'workspaces-and-flos', label: 'Workspaces & Flos', icon: '🗂️', order: 2 },
  { id: 'designer-nodes',    label: 'Designer — Nodes',    icon: '🧩', order: 3 },
  { id: 'error-handling',    label: 'Error Handling',       icon: '⚡', order: 4 },
  { id: 'sample-flows',      label: 'Sample Flos',          icon: '📐', order: 5 },
  { id: 'run-and-test',      label: 'Run & Test',           icon: '▶', order: 6 },
  { id: 'hub-admin',         label: 'Hub Admin',            icon: '🏢', order: 7 },
  { id: 'platform-ops',      label: 'Platform Ops',         icon: '🔒', order: 8 },
];
import { DEVELOPER_PAGES } from './pages/developerPages';
import { HUB_ADMIN_PAGES } from './pages/hubAdminPages';
import { PRODUCT_META_PAGES } from './pages/metaPages';
import { PLATFORM_ADMIN_PAGES } from './pages/platformAdminPages';

export const TENANT_CATEGORIES: DocCategoryMeta[] = [
  {
    id: 'product',
    title: 'Product help',
    description: 'FloPlug features, releases, designer guides, and how to perform admin tasks.',
    icon: '📘',
    portal: 'tenant',
  },
  {
    id: 'hub-config',
    title: 'Hub configuration',
    description: 'Live catalog of plugs, connections & FloActions on this hub (generated).',
    icon: '🏢',
    portal: 'tenant',
    dynamic: true,
  },
];

export const PLATFORM_CATEGORIES: DocCategoryMeta[] = [
  {
    id: 'product-config',
    title: 'Product configuration',
    description: 'Live catalog of connectors, FloKits & actions configured at platform level.',
    icon: '🧩',
    portal: 'platform',
    dynamic: true,
  },
  {
    id: 'platform-internal',
    title: 'Platform operations',
    description: 'Internal FloPlug staff — hub provisioning, connector registry, schemas, product users.',
    icon: '🔒',
    portal: 'platform',
  },
];

export const PRODUCT_PAGES: DocPage[] = [
  ...PRODUCT_META_PAGES.filter(p => p.id === 'doc-architecture'),
  ...DEVELOPER_PAGES,
  ...HUB_ADMIN_PAGES,
  ...PRODUCT_META_PAGES.filter(p => p.id === 'maintaining-product-help'),
];

export const ALL_STATIC_PAGES: DocPage[] = [
  ...PRODUCT_PAGES,
  ...PLATFORM_ADMIN_PAGES,
];

export function categoriesForPortal(portal: DocPortal): DocCategoryMeta[] {
  return portal === 'platform' ? PLATFORM_CATEGORIES : TENANT_CATEGORIES;
}

export function pagesForUser(portal: DocPortal, isHubAdmin: boolean, isPlatformStaff: boolean): DocPage[] {
  return ALL_STATIC_PAGES.filter(p => {
    if (p.category === 'platform-internal') {
      return portal === 'platform' && isPlatformStaff;
    }
    if (p.category === 'product') {
      if (portal !== 'tenant') return false;
      if (p.audience === 'platform-staff') return isPlatformStaff;
      if (p.audience === 'hub-admin') return isHubAdmin;
      return true;
    }
    return false;
  });
}

export function pagesInCategory(
  category: DocCategory,
  portal: DocPortal,
  isHubAdmin: boolean,
  isPlatformStaff: boolean,
): DocPage[] {
  return pagesForUser(portal, isHubAdmin, isPlatformStaff).filter(p => p.category === category);
}

export function findDocPage(
  category: DocCategory,
  slug: string,
  portal: DocPortal,
  isHubAdmin: boolean,
  isPlatformStaff: boolean,
): DocPage | undefined {
  return pagesInCategory(category, portal, isHubAdmin, isPlatformStaff).find(p => p.slug === slug);
}

/** Returns pages organised into group buckets, preserving intra-group order. */
export function groupedPages(
  pages: DocPage[],
  groups: DocGroupMeta[],
): { group: DocGroupMeta; pages: DocPage[] }[] {
  const byGroup = new Map<DocGroup, DocPage[]>();
  for (const p of pages) {
    const key = p.group ?? 'getting-started';
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(p);
  }
  const result: { group: DocGroupMeta; pages: DocPage[] }[] = [];
  for (const g of groups.slice().sort((a, b) => a.order - b.order)) {
    const gPages = (byGroup.get(g.id) ?? []).sort((a, b) => (a.groupOrder ?? 99) - (b.groupOrder ?? 99));
    if (gPages.length > 0) result.push({ group: g, pages: gPages });
  }
  return result;
}

export function defaultPageForCategory(
  category: DocCategory,
  portal: DocPortal,
  isHubAdmin: boolean,
  isPlatformStaff: boolean,
): DocPage | undefined {
  return pagesInCategory(category, portal, isHubAdmin, isPlatformStaff)[0];
}
