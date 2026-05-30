import React from 'react';
import type { ConnectorDoc, FloKitDoc } from '@floplug/shared';
import type { ProductConfigSection } from '../types';
import type { ProductConfigCatalog } from '../useProductConfigCatalog';

const fmtTime = (d: Date) => d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const Card: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
  title, subtitle, children,
}) => (
  <article style={{
    border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px',
    marginBottom: 12, background: '#FAFAFA',
  }}>
    <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>{title}</h3>
    {subtitle && <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>{subtitle}</div>}
    <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.55 }}>{children}</div>
  </article>
);

export const PRODUCT_CONFIG_NAV: { slug: ProductConfigSection; label: string }[] = [
  { slug: 'overview',    label: 'Overview' },
  { slug: 'connectors',  label: 'Connectors' },
  { slug: 'flo-kits',    label: 'FloKits' },
  { slug: 'actions',     label: 'Actions' },
];

export const ProductConfigDocView: React.FC<{
  envLabel?:   string;
  section:     ProductConfigSection;
  catalog:     ProductConfigCatalog | null;
  loading:     boolean;
  error:       string | null;
  onRefresh:   () => void;
}> = ({ envLabel, section, catalog, loading, error, onRefresh }) => {
  if (loading && !catalog) {
    return <p style={{ color: '#6B7280' }}>Loading product configuration…</p>;
  }
  if (error) {
    return (
      <div>
        <p style={{ color: '#DC2626' }}>Could not load: {error}</p>
        <button type="button" className="fp-doc-btn fp-doc-btn-ghost" onClick={onRefresh}>Retry</button>
      </div>
    );
  }
  if (!catalog) return null;

  const totalKits = Object.values(catalog.floKitsByConn).reduce((n, k) => n + k.length, 0);
  const totalActions = Object.values(catalog.actionsByKitKey).reduce((n, a) => n + a.length, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, color: '#4B5563', lineHeight: 1.55 }}>
            Live catalog of platform features configured in the <strong>Product Admin portal</strong>
            {envLabel ? ` (${envLabel})` : ''}: connectors, FloKits, and registered actions.
            Hub tenants consume subsets via entitlements and Hub Admin setup.
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: '#9CA3AF' }}>
            Refreshed {fmtTime(catalog.loadedAt)} · save in Product Admin then Refresh
          </p>
        </div>
        <button type="button" className="fp-doc-btn fp-doc-btn-ghost" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {section === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Connectors', n: catalog.connectors.length },
              { label: 'FloKits', n: totalKits },
              { label: 'Actions', n: totalActions },
            ].map(s => (
              <div key={s.label} style={{ padding: 16, borderRadius: 10, background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#7c3aed' }}>{s.n}</div>
                <div style={{ fontSize: 12, color: '#6B7280' }}>{s.label}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: '#6B7280' }}>
            Schemas are managed per connector in Product Admin → Schema management (not listed here yet).
            Hub-level plugs and connections appear in tenant <strong>Hub configuration</strong>, not this catalog.
          </p>
        </>
      )}

      {section === 'connectors' && catalog.connectors.map(c => (
        <Card key={c.id} title={c.label} subtitle={`${c.id} · ${c.category} · ${c.urlMode ?? 'segmented'}`}>
          <p style={{ margin: '0 0 6px' }}>{c.description || 'No description.'}</p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
            <li>Auth types: {(c.supportedAuthTypes ?? []).join(', ') || '—'}</li>
            <li>Action nodes allowed: {c.allowActionNodes ? 'yes' : 'no'}</li>
            <li>FloKits on connector: {(catalog.floKitsByConn[c.id] ?? []).length}</li>
          </ul>
        </Card>
      ))}

      {section === 'flo-kits' && catalog.connectors.flatMap(c => {
        const kits = catalog.floKitsByConn[c.id] ?? [];
        return kits.map((kit: FloKitDoc) => (
          <Card
            key={`${c.id}-${kit.id}`}
            title={kit.name ?? kit.id}
            subtitle={`Connector ${c.label} · kit ${kit.id}`}
          >
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
              <li>{kit.description || 'No description'}</li>
              <li>Kit version: {kit.kitVersion ?? '—'}</li>
              <li>Actions registered: {(kit.actionIds ?? []).length}</li>
            </ul>
          </Card>
        ));
      })}

      {section === 'actions' && catalog.connectors.flatMap(c => {
        const kits = catalog.floKitsByConn[c.id] ?? [];
        return kits.flatMap(kit => {
          const key = `${c.id}/${kit.id}`;
          const actions = catalog.actionsByKitKey[key] ?? [];
          if (actions.length === 0) return [];
          return (
            <Card key={key} title={`${c.label} / ${kit.name ?? kit.id}`} subtitle={`${actions.length} action(s)`}>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                {actions.map(a => (
                  <li key={a.id}>
                    <strong>{a.label}</strong>
                    {a.method ? ` · ${a.method}` : ''}
                    {a.description ? ` — ${a.description}` : ''}
                  </li>
                ))}
              </ul>
            </Card>
          );
        });
      })}
    </div>
  );
};
