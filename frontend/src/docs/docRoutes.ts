import type { DocCategory, DocPortal, HubConfigSection, ProductConfigSection } from './types';

export interface DocRoute {
  category: DocCategory;
  slug?:    string;
}

const DOCS_PREFIX = '#/docs';

const LEGACY_CATEGORY: Record<string, DocCategory> = {
  developer: 'product',
  'hub-admin': 'product',
};

const HUB_CONFIG_SECTIONS = new Set<string>(['overview', 'plugs', 'connections', 'floactions']);
const PRODUCT_CONFIG_SECTIONS = new Set<string>(['overview', 'connectors', 'flo-kits', 'actions']);

export function parseDocsHash(hash: string): DocRoute | null {
  const path = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (path[0] !== 'docs') return null;

  let category = path[1] as DocCategory | undefined;
  if (category && LEGACY_CATEGORY[category]) {
    category = LEGACY_CATEGORY[category];
  }

  const valid: DocCategory[] = ['product', 'hub-config', 'product-config', 'platform-internal'];
  if (!category || !valid.includes(category)) {
    return { category: 'product' };
  }

  return { category, slug: path[2] };
}

export function parseHubConfigSection(slug?: string): HubConfigSection {
  if (slug && HUB_CONFIG_SECTIONS.has(slug)) return slug as HubConfigSection;
  return 'overview';
}

export function parseProductConfigSection(slug?: string): ProductConfigSection {
  if (slug && PRODUCT_CONFIG_SECTIONS.has(slug)) return slug as ProductConfigSection;
  return 'overview';
}

export function isDocsHash(hash: string): boolean {
  return hash.startsWith('#/docs') || hash.startsWith('#docs');
}

export function buildDocsHash(route: DocRoute): string {
  let h = `${DOCS_PREFIX}/${route.category}`;
  if (route.slug) h += `/${route.slug}`;
  return h;
}

export function buildDocsUrl(route?: Partial<DocRoute>): string {
  const base = window.location.href.split('#')[0];
  const category = route?.category ?? 'product';
  return `${base}${buildDocsHash({ category, slug: route?.slug })}`;
}

export function openProductDocs(route?: Partial<DocRoute>): void {
  window.open(buildDocsUrl(route), '_blank', 'noopener,noreferrer');
}

export function openHubConfigDocs(section: HubConfigSection = 'overview'): void {
  openProductDocs({ category: 'hub-config', slug: section });
}

export function openPlatformDocs(slug?: string): void {
  openProductDocs({ category: 'platform-internal', slug: slug ?? 'platform-overview' });
}

export function openProductConfigDocs(section: ProductConfigSection = 'overview'): void {
  openProductDocs({ category: 'product-config', slug: section });
}

/** In-app docs navigation (same tab) — updates hash without full page load. */
export function navigateDocsHash(route: DocRoute, replace = false): void {
  const hash = buildDocsHash(route);
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  if (replace) {
    window.history.replaceState({ fpDocs: true }, '', url);
  } else {
    window.history.pushState({ fpDocs: true }, '', url);
  }
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Open docs in the current tab (tenant / admin shell listens for #/docs). */
export function enterProductDocs(route?: Partial<DocRoute>): void {
  const category = route?.category ?? 'product';
  const replace = !isDocsHash(window.location.hash);
  navigateDocsHash({ category, slug: route?.slug }, replace);
}

export function enterHubConfigDocs(section: HubConfigSection = 'overview'): void {
  enterProductDocs({ category: 'hub-config', slug: section });
}

export function enterProductConfigDocs(section: ProductConfigSection = 'overview'): void {
  enterProductDocs({ category: 'product-config', slug: section });
}

export function enterPlatformDocs(slug?: string): void {
  enterProductDocs({ category: 'platform-internal', slug: slug ?? 'platform-overview' });
}

export function defaultCategoryForPortal(portal: DocPortal): DocCategory {
  return portal === 'platform' ? 'product-config' : 'product';
}
