import React from 'react';
import type { FloActionPaletteItem, FloConnectionSafe, PlugConfig } from '@floplug/shared';
import type { HubConfigSection } from '../types';
import type { HubConfigCatalog } from '../useHubConfigCatalog';

const fmtTime = (d: Date) => d.toLocaleString(undefined, {
  dateStyle: 'medium', timeStyle: 'short',
});

const StatusPill: React.FC<{ active: boolean }> = ({ active }) => (
  <span style={{
    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
    background: active ? '#ECFDF5' : '#FEF2F2',
    color: active ? '#059669' : '#DC2626',
    border: `1px solid ${active ? '#A7F3D0' : '#FECACA'}`,
  }}>
    {active ? 'Active' : 'Inactive'}
  </span>
);

const ConfigCard: React.FC<{
  title:    string;
  subtitle?: string;
  meta?:    React.ReactNode;
  body:     React.ReactNode;
}> = ({ title, subtitle, meta, body }) => (
  <article style={{
    border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 18px',
    marginBottom: 12, background: '#FAFAFA',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111827' }}>{title}</h3>
        {subtitle && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{subtitle}</div>}
      </div>
      {meta}
    </div>
    <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.55 }}>{body}</div>
  </article>
);

const PlugCard: React.FC<{ plug: PlugConfig; connNames: Record<string, string> }> = ({ plug, connNames }) => (
  <ConfigCard
    title={plug.name}
    subtitle={`${plug.connectorLabel ?? plug.connectorId} · ${plug.authProtocol}`}
    meta={<StatusPill active={plug.isActive !== false} />}
    body={
      <>
        <p style={{ margin: '0 0 8px' }}>{plug.urlPattern || 'No URL pattern configured.'}</p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
          <li>Connector: <code>{plug.connectorId}</code></li>
          {plug.defaultConnectionId && (
            <li>Default connection: {connNames[plug.defaultConnectionId] ?? plug.defaultConnectionId}</li>
          )}
          {(plug.allowedConnectionIds?.length ?? 0) > 0 && (
            <li>Allowed connections: {plug.allowedConnectionIds!.map(id => connNames[id] ?? id).join(', ')}</li>
          )}
          {(plug.variableHints?.length ?? 0) > 0 && (
            <li>Variables: {plug.variableHints!.map(v => v.name).join(', ')}</li>
          )}
        </ul>
      </>
    }
  />
);

const ConnectionCard: React.FC<{ conn: FloConnectionSafe }> = ({ conn }) => (
  <ConfigCard
    title={conn.name}
    subtitle={`${conn.connectorLabel ?? conn.connectorId} · ${conn.authProtocol}`}
    meta={<StatusPill active={conn.isActive !== false} />}
    body={
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
        {conn.environmentLabel && <li>Environment: {conn.environmentLabel}</li>}
        {conn.hostname && <li>Host: {conn.hostname}</li>}
        {conn.baseUrl && <li>Base URL: {conn.baseUrl}</li>}
        {conn.tenantKey && <li>Tenant key: {conn.tenantKey}</li>}
        <li>Connector: <code>{conn.connectorId}</code></li>
      </ul>
    }
  />
);

const FloActionCard: React.FC<{ action: FloActionPaletteItem; connNames: Record<string, string> }> = ({ action, connNames }) => (
  <ConfigCard
    title={action.flaLabel || action.floActionName}
    subtitle={`FloKit ${action.floKitId} · ${action.connectorId}`}
    body={
      <>
        {action.description && <p style={{ margin: '0 0 8px' }}>{action.description}</p>}
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
          <li>Actions enabled: {action.actionIds.join(', ') || '—'}</li>
          {action.defaultConnectionId && (
            <li>Default connection: {connNames[action.defaultConnectionId] ?? action.defaultConnectionId}</li>
          )}
          {(action.allowedConnectionIds?.length ?? 0) > 0 && (
            <li>Allowed connections: {action.allowedConnectionIds!.map(id => connNames[id] ?? id).join(', ')}</li>
          )}
        </ul>
      </>
    }
  />
);

export const HubConfigDocView: React.FC<{
  hubName?:    string;
  section:     HubConfigSection;
  catalog:     HubConfigCatalog | null;
  loading:     boolean;
  error:       string | null;
  onRefresh:   () => void;
}> = ({ hubName, section, catalog, loading, error, onRefresh }) => {
  if (loading && !catalog) {
    return <p style={{ color: '#6B7280' }}>Loading hub configuration…</p>;
  }
  if (error) {
    return (
      <div>
        <p style={{ color: '#DC2626' }}>Could not load hub configuration: {error}</p>
        <button type="button" className="fp-doc-btn fp-doc-btn-ghost" onClick={onRefresh}>Retry</button>
      </div>
    );
  }
  if (!catalog) return null;

  const connNames = Object.fromEntries(catalog.connections.map(c => [c.id, c.name]));
  const activePlugs = catalog.plugs.filter(p => p.isActive !== false);
  const activeConns = catalog.connections.filter(c => c.isActive !== false);

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        gap: 12, marginBottom: 20, flexWrap: 'wrap',
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, color: '#4B5563', lineHeight: 1.55 }}>
            Live catalog for <strong>{hubName ?? 'this hub'}</strong>. Generated from plugs, connections,
            and FloActions saved by your hub admin — not product release notes.
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: '#9CA3AF' }}>
            Refreshed {fmtTime(catalog.loadedAt)} · save in Hub Admin portal then click Refresh
          </p>
        </div>
        <button type="button" className="fp-doc-btn fp-doc-btn-ghost" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {section === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Plugs', count: activePlugs.length, total: catalog.plugs.length },
              { label: 'Connections', count: activeConns.length, total: catalog.connections.length },
              { label: 'FloActions', count: catalog.floActions.length, total: catalog.floActions.length },
            ].map(s => (
              <div key={s.label} style={{
                padding: 16, borderRadius: 10, background: '#F9FAFB', border: '1px solid #E5E7EB',
              }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#1a56db' }}>{s.count}</div>
                <div style={{ fontSize: 12, color: '#6B7280' }}>{s.label} active</div>
                {s.total !== s.count && (
                  <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 4 }}>{s.total} total</div>
                )}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: '#6B7280' }}>
            Use the sidebar to browse each section. If the designer palette is missing an item listed here,
            try reloading the designer. If it is missing here, ask a hub admin to configure it in the Hub Admin portal.
          </p>
        </>
      )}

      {section === 'plugs' && (
        activePlugs.length === 0
          ? <p style={{ color: '#6B7280' }}>No active plugs configured on this hub.</p>
          : activePlugs.map(p => <PlugCard key={p.id} plug={p} connNames={connNames} />)
      )}

      {section === 'connections' && (
        activeConns.length === 0
          ? <p style={{ color: '#6B7280' }}>No active connections configured on this hub.</p>
          : activeConns.map(c => <ConnectionCard key={c.id} conn={c} />)
      )}

      {section === 'floactions' && (
        catalog.floActions.length === 0
          ? <p style={{ color: '#6B7280' }}>No FloActions enabled for developers on this hub.</p>
          : catalog.floActions.map(a => <FloActionCard key={a.id} action={a} connNames={connNames} />)
      )}
    </div>
  );
};

export const HUB_CONFIG_NAV: { slug: HubConfigSection; label: string }[] = [
  { slug: 'overview',    label: 'Overview' },
  { slug: 'plugs',       label: 'Plugs' },
  { slug: 'connections', label: 'Connections' },
  { slug: 'floactions',  label: 'FloActions' },
];
