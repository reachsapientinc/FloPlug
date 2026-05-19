/**
 * FloConnectionManager.tsx
 *
 * Hub Admin tab — manage FloConnections per tenant.
 *
 * Responsibilities:
 *  - List all active FloConnections for the current tenant
 *  - Create a new connection (opens FloConnectionFormModal)
 *  - Edit an existing connection (opens FloConnectionFormModal pre-filled)
 *  - Deactivate (soft-delete) a connection
 *  - Show which authProtocol each connection uses (badge)
 *  - Show which plugs reference this connection (future: link)
 *
 * Security: all mutations go through Cloud Functions via hubActionHandler.
 * This component never reads or writes Firestore directly.
 */

import React, { useState, useMemo } from 'react';
import type { AuthProtocol, ConnectorDoc } from '@floplug/shared';
import type { FloConnectionSafe }          from '@floplug/shared';
import type { SaveFloConnectionPayload }   from '../handlers/hubActionHandler';
import { FloConnectionFormModal }          from './FloConnectionFormModal';

// ── Style tokens ──────────────────────────────────────────────────────────────

const C = {
  bg:        '#0e0e14',
  surface:   '#16161f',
  border:    '#2a2a3a',
  accent:    '#7c6af7',
  text:      '#c0c0cc',
  textMuted: '#5a5a70',
  textStrong:'#e8e8f0',
  danger:    '#e05555',
  success:   '#4caf8a',
  warning:   '#e0a040',
  tag:       '#1e1e2e',
} as const;

// ── Protocol badge colours (deterministic from name string) ───────────────────
const protocolColours: Record<string, string> = {
  httpBasic:          '#4a90d9',
  bearerToken:        '#7c6af7',
  oauth2ClientCreds:  '#4caf8a',
  wsseHeader:         '#e0a040',
  apiKeyHeader:       '#d97c4a',
  apiKeyQuery:        '#d95a7c',
};

const protocolBadge = (protocol: string) => ({
  fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
  textTransform: 'uppercase' as const, padding: '2px 7px', borderRadius: 20,
  background: `${protocolColours[protocol] ?? '#5a5a70'}22`,
  color: protocolColours[protocol] ?? '#8888a0',
  border: `1px solid ${protocolColours[protocol] ?? '#5a5a70'}44`,
  whiteSpace: 'nowrap' as const,
});

// ── Props ─────────────────────────────────────────────────────────────────────

export interface FloConnectionManagerProps {
  connections:    FloConnectionSafe[];
  connectors:     ConnectorDoc[];
  protocols:      AuthProtocol[];
  onSave:         (payload: SaveFloConnectionPayload) => Promise<FloConnectionSafe>;
  onDeactivate:   (connectionId: string) => Promise<void>;
  /** Match HubAdminDashboard white shell */
  lightTheme?:    boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

const lightC = {
  bg:        '#fff',
  surface:   '#fff',
  border:    '#E5E7EB',
  accent:    '#1a56db',
  text:      '#374151',
  textMuted: '#6B7280',
  textStrong:'#111827',
  danger:    '#DC2626',
  warning:   '#D97706',
} as const;

export const FloConnectionManager: React.FC<FloConnectionManagerProps> = ({
  connections,
  connectors,
  protocols,
  onSave,
  onDeactivate,
  lightTheme = false,
}) => {
  const T = lightTheme ? lightC : C;
  const [showModal,       setShowModal]       = useState(false);
  const [editTarget,      setEditTarget]      = useState<FloConnectionSafe | undefined>();
  const [filterProtocol,  setFilterProtocol]  = useState('');
  const [filterConnector, setFilterConnector] = useState('');
  const [search,          setSearch]          = useState('');
  const [confirmDeactivate, setConfirmDeactivate] = useState<FloConnectionSafe | null>(null);
  const [deactivating,    setDeactivating]    = useState(false);

  // ── Connector label lookup ─────────────────────────────────────────────────
  const connectorLabel = (id: string) =>
    connectors.find(c => c.id === id)?.label ?? id;

  const protocolLabel = (name: string) =>
    protocols.find(p => p.name === name)?.label ?? name;

  // ── Filtered list ──────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    return connections.filter(c => {
      if (!c.isActive) return false;
      if (filterProtocol  && c.authProtocol !== filterProtocol)  return false;
      if (filterConnector && c.connectorId  !== filterConnector)  return false;
      if (search) {
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.connectorId.toLowerCase().includes(q);
      }
      return true;
    });
  }, [connections, filterProtocol, filterConnector, search]);

  // ── Unique filter options from current data ────────────────────────────────
  const usedProtocols  = [...new Set(connections.map(c => c.authProtocol))];
  const usedConnectors = [...new Set(connections.map(c => c.connectorId))];

  // ── Deactivate ─────────────────────────────────────────────────────────────
  const handleDeactivate = async () => {
    if (!confirmDeactivate) return;
    setDeactivating(true);
    await onDeactivate(confirmDeactivate.id);
    setDeactivating(false);
    setConfirmDeactivate(null);
  };

  // ── Open modal ─────────────────────────────────────────────────────────────
  const openCreate = () => { setEditTarget(undefined); setShowModal(true); };
  const openEdit   = (c: FloConnectionSafe) => { setEditTarget(c); setShowModal(true); };
  const closeModal = () => { setEditTarget(undefined); setShowModal(false); };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      fontFamily: "'Inter', -apple-system, sans-serif", color: T.text,
    }}>
      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 0 14px', flexWrap: 'wrap',
      }}>
        {/* Search */}
        <input
          style={{
            background: lightTheme ? '#F9FAFB' : '#16161f', border: `1px solid ${T.border}`,
            borderRadius: 6, color: T.textStrong, padding: '6px 10px',
            fontSize: 12, outline: 'none', minWidth: 180,
          }}
          placeholder="Search connections…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Protocol filter */}
        <select
          style={{
            background: lightTheme ? '#F9FAFB' : '#16161f', border: `1px solid ${T.border}`,
            borderRadius: 6, color: T.text, padding: '6px 10px',
            fontSize: 11, outline: 'none', cursor: 'pointer',
          }}
          value={filterProtocol}
          onChange={e => setFilterProtocol(e.target.value)}
        >
          <option value="">All Protocols</option>
          {usedProtocols.map(p => (
            <option key={p} value={p}>{protocolLabel(p)}</option>
          ))}
        </select>

        {/* Connector filter */}
        <select
          style={{
            background: lightTheme ? '#F9FAFB' : '#16161f', border: `1px solid ${T.border}`,
            borderRadius: 6, color: T.text, padding: '6px 10px',
            fontSize: 11, outline: 'none', cursor: 'pointer',
          }}
          value={filterConnector}
          onChange={e => setFilterConnector(e.target.value)}
        >
          <option value="">All Connectors</option>
          {usedConnectors.map(c => (
            <option key={c} value={c}>{connectorLabel(c)}</option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        {/* Summary */}
        <div style={{ fontSize: 10, color: T.textMuted }}>
          {visible.length} / {connections.filter(c => c.isActive).length} connections
        </div>

        {/* New button */}
        <button
          onClick={openCreate}
          style={{
            background: T.accent, border: 'none', borderRadius: 6,
            color: '#fff', padding: '7px 14px', fontSize: 12,
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          + New Connection
        </button>
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {visible.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 0',
            color: T.textMuted, fontSize: 12,
          }}>
            {connections.length === 0
              ? 'No connections yet. Create one to get started.'
              : 'No connections match the current filters.'}
          </div>
        ) : (
          <table style={{
            width: '100%', borderCollapse: 'collapse', fontSize: 12,
          }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {['Name', 'Connector', 'Protocol', 'Environment', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '6px 10px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, color: T.textMuted, letterSpacing: '0.08em',
                    textTransform: 'uppercase', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((conn, i) => (
                <tr
                  key={conn.id}
                  style={{
                    borderBottom: `1px solid ${T.border}`,
                    background: i % 2 === 0 ? 'transparent' : lightTheme ? '#F9FAFB' : '#13131c',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = lightTheme ? '#F3F4F6' : '#1c1c2a')}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : lightTheme ? '#F9FAFB' : '#13131c')}
                >
                  {/* Name + ID */}
                  <td style={{ padding: '10px 10px' }}>
                    <div style={{ fontWeight: 600, color: T.textStrong }}>{conn.name}</div>
                    <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2, fontFamily: 'monospace' }}>
                      {conn.id}
                    </div>
                  </td>

                  {/* Connector */}
                  <td style={{ padding: '10px 10px', color: T.text }}>
                    {connectorLabel(conn.connectorId)}
                  </td>

                  {/* Protocol badge */}
                  <td style={{ padding: '10px 10px' }}>
                    <span style={protocolBadge(conn.authProtocol)}>
                      {protocolLabel(conn.authProtocol)}
                    </span>
                  </td>

                  {/* Environment */}
                  <td style={{ padding: '10px 10px', color: T.textMuted, fontSize: 11 }}>
                    {conn.environmentLabel || '—'}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '10px 10px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => openEdit(conn)}
                        style={{
                          background: 'transparent', border: `1px solid ${T.border}`,
                          borderRadius: 5, color: T.text, padding: '4px 10px',
                          fontSize: 11, cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmDeactivate(conn)}
                        style={{
                          background: 'transparent', border: `1px solid ${T.danger}44`,
                          borderRadius: 5, color: T.danger, padding: '4px 10px',
                          fontSize: 11, cursor: 'pointer',
                        }}
                      >
                        Deactivate
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Create / Edit modal ── */}
      {showModal && (
        <FloConnectionFormModal
          connection={editTarget}
          connectors={connectors}
          protocols={protocols}
          onSave={onSave}
          onClose={closeModal}
        />
      )}

      {/* ── Deactivate confirmation ── */}
      {confirmDeactivate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000,
        }}>
          <div style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 10, width: 400, padding: 24,
            fontFamily: "'Inter', -apple-system, sans-serif",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.textStrong, marginBottom: 10 }}>
              Deactivate Connection
            </div>
            <div style={{ fontSize: 12, color: T.text, marginBottom: 6 }}>
              Are you sure you want to deactivate{' '}
              <strong style={{ color: T.textStrong }}>{confirmDeactivate.name}</strong>?
            </div>
            <div style={{ fontSize: 11, color: T.warning, marginBottom: 20 }}>
              Any plugs referencing this connection will stop resolving credentials
              until reassigned.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setConfirmDeactivate(null)}
                style={{
                  background: 'transparent', border: `1px solid ${T.border}`,
                  borderRadius: 6, color: T.text, padding: '7px 16px',
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeactivate}
                disabled={deactivating}
                style={{
                  background: T.danger, border: 'none', borderRadius: 6,
                  color: '#fff', padding: '7px 16px', fontSize: 12,
                  fontWeight: 600, cursor: 'pointer', opacity: deactivating ? 0.7 : 1,
                }}
              >
                {deactivating ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
