import type { DocCategory, DocCategoryMeta, DocPage, DocPortal } from './types';
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

export function defaultPageForCategory(
  category: DocCategory,
  portal: DocPortal,
  isHubAdmin: boolean,
  isPlatformStaff: boolean,
): DocPage | undefined {
  return pagesInCategory(category, portal, isHubAdmin, isPlatformStaff)[0];
}
