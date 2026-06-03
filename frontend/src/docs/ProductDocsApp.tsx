/**
 * FloPlug documentation viewer — product help, hub/product configuration, or platform ops.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { DocCategory, DocPage, DocPortal, HubConfigSection, ProductConfigSection } from './types';
import {
  categoriesForPortal,
  defaultPageForCategory,
  findDocPage,
  groupedPages,
  pagesInCategory,
  PRODUCT_GROUPS,
} from './registry';
import {
  defaultCategoryForPortal,
  navigateDocsHash,
  parseDocsHash,
  parseHubConfigSection,
  parseProductConfigSection,
} from './docRoutes';
import { DocContentRenderer } from './components/DocContentRenderer';
import { HubConfigDocView, HUB_CONFIG_NAV } from './components/HubConfigDocView';
import { ProductConfigDocView, PRODUCT_CONFIG_NAV } from './components/ProductConfigDocView';
import { useHubConfigCatalog } from './useHubConfigCatalog';
import { useProductConfigCatalog } from './useProductConfigCatalog';
import './product-docs.css';

export interface ProductDocsAppProps {
  portal:           DocPortal;
  isHubAdmin?:      boolean;
  isPlatformStaff?: boolean;
  hubId?:           string;
  tenantId?:        string;
  hubName?:         string;
  envLabel?:        string;
  onClose?:         () => void;
}

interface StaticRoute {
  category: DocCategory;
  page:     DocPage | undefined;
}

interface HubConfigRoute {
  category: 'hub-config';
  section:  HubConfigSection;
}

interface ProductConfigRoute {
  category: 'product-config';
  section:  ProductConfigSection;
}

type DocViewRoute = StaticRoute | HubConfigRoute | ProductConfigRoute;

function readRoute(
  portal: DocPortal,
  isHubAdmin: boolean,
  isPlatformStaff: boolean,
): DocViewRoute {
  const parsed = parseDocsHash(window.location.hash);
  const category = parsed?.category ?? defaultCategoryForPortal(portal);

  if (category === 'hub-config') {
    if (portal !== 'tenant') {
      if (portal === 'platform') {
        return { category: 'product-config', section: parseProductConfigSection(parsed?.slug) };
      }
      return {
        category: 'product',
        page: defaultPageForCategory('product', portal, isHubAdmin, isPlatformStaff),
      };
    }
    return { category: 'hub-config', section: parseHubConfigSection(parsed?.slug) };
  }

  if (category === 'product-config') {
    if (portal !== 'platform') {
      if (portal === 'tenant') {
        return { category: 'hub-config', section: parseHubConfigSection(parsed?.slug) };
      }
      return {
        category: 'product',
        page: defaultPageForCategory('product', portal, isHubAdmin, isPlatformStaff),
      };
    }
    return { category: 'product-config', section: parseProductConfigSection(parsed?.slug) };
  }

  const slug = parsed?.slug;
  const page = slug
    ? findDocPage(category, slug, portal, isHubAdmin, isPlatformStaff)
    : defaultPageForCategory(category, portal, isHubAdmin, isPlatformStaff);

  return {
    category,
    page: page ?? defaultPageForCategory('product', portal, isHubAdmin, isPlatformStaff),
  };
}

export const ProductDocsApp: React.FC<ProductDocsAppProps> = ({
  portal,
  isHubAdmin = false,
  isPlatformStaff = portal === 'platform',
  hubId = '',
  tenantId = '',
  hubName,
  envLabel,
  onClose,
}) => {
  const [route, setRoute] = useState<DocViewRoute>(() => readRoute(portal, isHubAdmin, isPlatformStaff));

  const { catalog: hubCatalog, loading: hubLoading, error: hubError, reload: reloadHub } = useHubConfigCatalog(
    portal === 'tenant' ? hubId : '',
    portal === 'tenant' ? tenantId : '',
  );

  const { catalog: productCatalog, loading: productLoading, error: productError, reload: reloadProduct } =
    useProductConfigCatalog(portal === 'platform');

  const syncFromHash = useCallback(() => {
    setRoute(readRoute(portal, isHubAdmin, isPlatformStaff));
  }, [portal, isHubAdmin, isPlatformStaff]);

  useEffect(() => {
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, [syncFromHash]);

  const cats = useMemo(() => categoriesForPortal(portal), [portal]);
  const productPages = useMemo(
    () => pagesInCategory('product', portal, isHubAdmin, isPlatformStaff),
    [portal, isHubAdmin, isPlatformStaff],
  );
  const platformPages = useMemo(
    () => pagesInCategory('platform-internal', portal, isHubAdmin, isPlatformStaff),
    [portal, isHubAdmin, isPlatformStaff],
  );
  const productGroups = useMemo(() => groupedPages(productPages, PRODUCT_GROUPS), [productPages]);

  // Track which sidebar groups are expanded. All open by default.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(PRODUCT_GROUPS.map(g => g.id)));
  const toggleGroup = (id: string) => setOpenGroups(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const goToProduct = (page: DocPage) => {
    navigateDocsHash({ category: 'product', slug: page.slug });
    setRoute({ category: 'product', page });
  };

  const goToPlatform = (page: DocPage) => {
    navigateDocsHash({ category: 'platform-internal', slug: page.slug });
    setRoute({ category: 'platform-internal', page });
  };

  const goHubConfig = (section: HubConfigSection) => {
    navigateDocsHash({ category: 'hub-config', slug: section });
    setRoute({ category: 'hub-config', section });
  };

  const goProductConfig = (section: ProductConfigSection) => {
    navigateDocsHash({ category: 'product-config', slug: section });
    setRoute({ category: 'product-config', section });
  };

  const goCategory = (category: DocCategory) => {
    if (category === 'hub-config') {
      goHubConfig('overview');
      return;
    }
    if (category === 'product-config') {
      goProductConfig('overview');
      return;
    }
    const first = defaultPageForCategory(category, portal, isHubAdmin, isPlatformStaff);
    if (first) {
      navigateDocsHash({ category, slug: first.slug });
      setRoute({ category, page: first });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const headerTitle = portal === 'platform'
    ? 'FloPlug Product Admin'
    : 'FloPlug Product Help';

  const staticPage = route.category !== 'hub-config' && route.category !== 'product-config'
    ? route.page
    : undefined;

  useEffect(() => {
    if (staticPage) {
      document.title = `${staticPage.title} · FloPlug Help`;
    } else if (route.category === 'hub-config') {
      document.title = `Hub configuration · ${hubName ?? 'FloPlug'}`;
    } else if (route.category === 'product-config') {
      document.title = 'Product configuration · FloPlug';
    }
    return () => { document.title = 'FloPlug'; };
  }, [staticPage, route, hubName]);

  return (
    <div className="fp-product-docs">
      <header className="fp-doc-header">
        <div className="fp-doc-header-brand">
          <div className="fp-doc-logo">{portal === 'platform' ? '🧩' : '📘'}</div>
          <div>
            <div className="fp-doc-header-title">{headerTitle}</div>
            <div className="fp-doc-header-sub">
              {portal === 'platform'
                ? 'Internal — live product catalog + platform operations runbooks'
                : `${hubName ? `${hubName} · ` : ''}Product guides + live hub configuration`}
            </div>
          </div>
        </div>
        <div className="fp-doc-header-actions">
          {onClose && (
            <button type="button" className="fp-doc-btn fp-doc-btn-ghost" onClick={onClose}>
              ← Back to app
            </button>
          )}
          <button type="button" className="fp-doc-btn fp-doc-btn-ghost" onClick={() => window.close()}>
            Close tab
          </button>
        </div>
      </header>

      <div className="fp-doc-body">
        <aside className="fp-doc-sidebar">
          {cats.map(cat => (
            <div key={cat.id} className="fp-doc-sidebar-group">
              <button
                type="button"
                className={`fp-doc-cat-btn ${route.category === cat.id ? 'active' : ''}`}
                onClick={() => goCategory(cat.id)}
              >
                <span>{cat.icon}</span>
                <span>{cat.title}</span>
                {cat.dynamic && <span className="fp-doc-badge fp-doc-badge-live">Live</span>}
              </button>
              {route.category === cat.id && cat.id === 'product' && (
                <nav className="fp-doc-page-list">
                  {productGroups.map(({ group, pages }) => (
                    <div key={group.id} className="fp-doc-page-group">
                      <button
                        type="button"
                        className="fp-doc-group-header"
                        onClick={() => toggleGroup(group.id)}
                        aria-expanded={openGroups.has(group.id)}
                      >
                        <span className="fp-doc-group-icon">{group.icon}</span>
                        <span className="fp-doc-group-label">{group.label}</span>
                        <span className="fp-doc-group-chevron">
                          {openGroups.has(group.id) ? '▾' : '▸'}
                        </span>
                      </button>
                      {openGroups.has(group.id) && (
                        <div className="fp-doc-group-pages">
                          {pages.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              className={`fp-doc-page-link ${staticPage?.id === p.id ? 'active' : ''}`}
                              onClick={() => goToProduct(p)}
                            >
                              <span>{p.title}</span>
                              {p.audience === 'platform-staff' && (
                                <span className="fp-doc-badge fp-doc-badge-inline">Staff</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </nav>
              )}
              {route.category === cat.id && cat.id === 'platform-internal' && (
                <nav className="fp-doc-page-list">
                  {platformPages.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className={`fp-doc-page-link ${staticPage?.id === p.id ? 'active' : ''}`}
                      onClick={() => goToPlatform(p)}
                    >
                      {p.title}
                    </button>
                  ))}
                </nav>
              )}
              {route.category === cat.id && cat.id === 'hub-config' && (
                <nav className="fp-doc-page-list">
                  {HUB_CONFIG_NAV.map(item => (
                    <button
                      key={item.slug}
                      type="button"
                      className={`fp-doc-page-link ${
                        route.category === 'hub-config' && (route as HubConfigRoute).section === item.slug ? 'active' : ''
                      }`}
                      onClick={() => goHubConfig(item.slug)}
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>
              )}
              {route.category === cat.id && cat.id === 'product-config' && (
                <nav className="fp-doc-page-list">
                  {PRODUCT_CONFIG_NAV.map(item => (
                    <button
                      key={item.slug}
                      type="button"
                      className={`fp-doc-page-link ${
                        route.category === 'product-config' && (route as ProductConfigRoute).section === item.slug ? 'active' : ''
                      }`}
                      onClick={() => goProductConfig(item.slug)}
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>
              )}
            </div>
          ))}
          <div className="fp-doc-sidebar-foot">
            {portal === 'tenant'
              ? 'Hub configuration reflects Hub Admin portal saves. Product help updates with FloPlug releases.'
              : 'Product configuration reflects Product Admin portal saves. Not visible to hub tenants.'}
          </div>
        </aside>

        <main className="fp-doc-main">
          {route.category === 'hub-config' ? (
            <>
              <h1 className="fp-doc-page-title">Hub configuration</h1>
              <p className="fp-doc-page-summary">
                What is configured on this hub/tenant — plugs, connections, and FloActions your hub admin enabled in the Hub Admin portal.
              </p>
              <HubConfigDocView
                hubName={hubName}
                section={(route as HubConfigRoute).section}
                catalog={hubCatalog}
                loading={hubLoading}
                error={hubError}
                onRefresh={reloadHub}
              />
            </>
          ) : route.category === 'product-config' ? (
            <>
              <h1 className="fp-doc-page-title">Product configuration</h1>
              <p className="fp-doc-page-summary">
                Platform-level connectors, FloKits, and actions configured in the Product Admin portal for internal product team reference.
              </p>
              <ProductConfigDocView
                envLabel={envLabel}
                section={(route as ProductConfigRoute).section}
                catalog={productCatalog}
                loading={productLoading}
                error={productError}
                onRefresh={reloadProduct}
              />
            </>
          ) : staticPage ? (
            <>
              <div className="fp-doc-meta">
                <span className="fp-doc-meta-cat">
                  {cats.find(c => c.id === staticPage.category)?.title}
                </span>
                <span>Last updated {staticPage.updatedAt}</span>
              </div>
              <h1 className="fp-doc-page-title">{staticPage.title}</h1>
              <p className="fp-doc-page-summary">{staticPage.summary}</p>
              <DocContentRenderer sections={staticPage.sections} />
            </>
          ) : (
            <div className="fp-doc-empty">Select a topic from the sidebar.</div>
          )}
        </main>
      </div>
    </div>
  );
};

export {
  openProductDocs,
  openHubConfigDocs,
  openPlatformDocs,
  openProductConfigDocs,
  enterProductDocs,
  enterHubConfigDocs,
  enterPlatformDocs,
  enterProductConfigDocs,
  buildDocsUrl,
} from './docRoutes';
