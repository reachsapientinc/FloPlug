/**
 * FloActionManager.tsx
 *
 * Hub Admin tab — browse entitled connector FloKits and their actions,
 * and create/manage ActionNodes that associate a FloAction with a connection.
 *
 * Data flow:
 *  ┌──────────────────────────────────────────────────────────────────┐
 *  │  HubEntitlements                                                 │
 *  │   connectors: { workday: { floKits: [hrKit, financeKit] } }     │
 *  └──────────────┬───────────────────────────────────────────────────┘
 *                 │  entitled FloKits + their ActionDocs
 *                 ▼
 *  ┌──────────────────────────────────────────────────────────────────┐
 *  │  FloActionManager UI                                             │
 *  │   • left panel: connector/kit tree                               │
 *  │   • right panel: action list with "Add to Canvas" button         │
 *  │   • "Add to Canvas" → opens ActionNodeFormModal                  │
 *  │     - picks a FloConnection (filtered by connector.authProtocol) │
 *  │     - sets output target (cStream / local / global)              │
 *  │     - saves ActionNode doc to tenant sub-collection              │
 *  └──────────────────────────────────────────────────────────────────┘
 *
 * ActionNode doc is stored at:
 *   FloPlugHubs/{hubId}/Tenants/{tenantId}/ActionNodes/{nodeId}
 *
 * Security: all writes go through Cloud Functions.
 * This component never writes to Firestore directly.
 */

import React, { useState, useMemo, useCallback } from 'react';
import type {
  ConnectorDoc,
  ActionDoc,
  AuthProtocol,
}                              from '@floplug/shared';
import type { FloConnectionSafe } from '@floplug/shared';

// ── Style tokens ──────────────────────────────────────────────────────────────

const C = {
  bg:        '#0e0e14',
  surface:   '#16161f',
  surfaceAlt:'#13131c',
  border:    '#2a2a3a',
  accent:    '#7c6af7',
  text:      '#c0c0cc',
  textMuted: '#5a5a70',
  textStrong:'#e8e8f0',
  danger:    '#e05555',
  success:   '#4caf8a',
  warning:   '#e0a040',
  pill:      '#1e1e2e',
} as const;

const methodColour: Record<string, string> = {
  GET:    '#4caf8a',
  POST:   '#7c6af7',
  PUT:    '#e0a040',
  PATCH:  '#4a90d9',
  DELETE: '#e05555',
};

// ── Shared types ──────────────────────────────────────────────────────────────

export interface FloKitMeta {
  id:          string;
  connectorId: string;
  label:       string;
  description?: string;
  actionIds:   string[];
}

/** What the parent passes down — already filtered to entitled items */
export interface FloActionManagerProps {
  /** Entitled connectors (full ConnectorDoc) */
  connectors:    ConnectorDoc[];
  /** All entitled FloKits keyed by connectorId */
  floKits:       Record<string, FloKitMeta[]>;
  /** All entitled ActionDocs keyed by floKitId */
  actions:       Record<string, ActionDoc[]>;
  /** Active FloConnections for the current tenant (credentials stripped) */
  connections:   FloConnectionSafe[];
  protocols:     AuthProtocol[];
  /** Called when user confirms "Add to Canvas" for an action + connection */
  onAddActionNode: (params: AddActionNodeParams) => Promise<void>;
}

export interface AddActionNodeParams {
  actionId:     string;
  floKitId:     string;
  connectorId:  string;
  connectionId: string;
  outputTarget: 'cStream' | 'local' | 'global';
  varName?:     string;
}

// ── ActionNodeFormModal ───────────────────────────────────────────────────────
// Shown when the user clicks "Add to Canvas" on an action.

interface ActionNodeFormModalProps {
  action:      ActionDoc;
  connections: FloConnectionSafe[];
  protocols:   AuthProtocol[];
  connector:   ConnectorDoc;
  onConfirm:   (connectionId: string, outputTarget: 'cStream'|'local'|'global', varName: string) => void;
  onClose:     () => void;
}

const ActionNodeFormModal: React.FC<ActionNodeFormModalProps> = ({
  action, connections, protocols, connector, onConfirm, onClose,
}) => {
  // Filter connections by any protocol the connector supports
  const compatible = connections.filter(c =>
    connector.supportedAuthTypes.includes(c.authProtocol),
  );

  const [connectionId,  setConnectionId]  = useState(compatible[0]?.id ?? '');
  const [outputTarget,  setOutputTarget]  = useState<'cStream'|'local'|'global'>('cStream');
  const [varName,       setVarName]       = useState('');
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');

  const inp: React.CSSProperties = {
    background: '#1c1c28', border: `1px solid ${C.border}`, borderRadius: 6,
    color: C.textStrong, padding: '7px 10px', fontSize: 12, outline: 'none',
    fontFamily: "'Inter', -apple-system, sans-serif",
  };

  const handleConfirm = async () => {
    if (!connectionId) { setError('Select a connection.'); return; }
    setSaving(true);
    try {
      await onConfirm(connectionId, outputTarget, varName);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to add action node.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
        width: 480, boxShadow: '0 32px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textStrong }}>
              Add to Canvas
            </div>
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
              {action.label}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: C.textMuted,
            fontSize: 18, cursor: 'pointer',
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Action summary */}
          <div style={{
            background: C.surfaceAlt, borderRadius: 8, padding: 12,
            border: `1px solid ${C.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                background: `${methodColour[action.method] ?? '#5a5a70'}22`,
                color: methodColour[action.method] ?? C.textMuted,
                border: `1px solid ${methodColour[action.method] ?? '#5a5a70'}44`,
              }}>{action.method}</span>
              <code style={{ fontSize: 10, color: C.textMuted }}>{action.endpoint}</code>
            </div>
            {action.description && (
              <div style={{ fontSize: 11, color: C.textMuted }}>{action.description}</div>
            )}
          </div>

          {/* Connection selector */}
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: '#8888a0', marginBottom: 4,
            }}>Connection *</div>
            {compatible.length === 0 ? (
              <div style={{
                fontSize: 11, color: C.warning, padding: '8px 10px',
                background: `${C.warning}18`, borderRadius: 6,
                border: `1px solid ${C.warning}44`,
              }}>
                No compatible connections. Create one in the Connections tab first.
              </div>
            ) : (
              <select
                value={connectionId}
                onChange={e => setConnectionId(e.target.value)}
                style={{ ...inp, width: '100%', cursor: 'pointer' }}
              >
                {compatible.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}  ({c.authProtocol})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Output target */}
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: '#8888a0', marginBottom: 4,
            }}>Response Storage</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['cStream', 'local', 'global'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setOutputTarget(t)}
                  style={{
                    flex: 1, padding: '7px 0', borderRadius: 6, fontSize: 11,
                    cursor: 'pointer', fontWeight: 600,
                    background: outputTarget === t ? C.accent : 'transparent',
                    border: `1px solid ${outputTarget === t ? C.accent : C.border}`,
                    color: outputTarget === t ? '#fff' : C.textMuted,
                    transition: 'all 0.15s',
                  }}
                >{t}</button>
              ))}
            </div>
          </div>

          {/* Variable name (for local/global) */}
          {(outputTarget === 'local' || outputTarget === 'global') && (
            <div>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: '#8888a0', marginBottom: 4,
              }}>Variable Name</div>
              <input
                style={{ ...inp, width: '100%', boxSizing: 'border-box' }}
                value={varName}
                onChange={e => setVarName(e.target.value)}
                placeholder={`${outputTarget}.myResult`}
              />
            </div>
          )}

          {error && (
            <div style={{
              fontSize: 11, color: C.danger, padding: '8px 10px',
              background: `${C.danger}18`, borderRadius: 6,
            }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px', borderTop: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button onClick={onClose} style={{
            padding: '7px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
            background: 'transparent', border: `1px solid ${C.border}`,
            color: C.text,
          }}>Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={saving || compatible.length === 0}
            style={{
              padding: '7px 18px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
              background: C.accent, border: 'none', color: '#fff',
              fontWeight: 600, opacity: saving ? 0.7 : 1,
            }}
          >{saving ? 'Adding…' : 'Add to Canvas'}</button>
        </div>
      </div>
    </div>
  );
};

// ── FloActionManager (main component) ────────────────────────────────────────

export const FloActionManager: React.FC<FloActionManagerProps> = ({
  connectors, floKits, actions, connections, protocols, onAddActionNode,
}) => {
  const [selectedConnector, setSelectedConnector] = useState<string>(connectors[0]?.id ?? '');
  const [selectedKit,       setSelectedKit]       = useState<string>('');
  const [search,            setSearch]            = useState('');
  const [addTarget,         setAddTarget]         = useState<{
    action: ActionDoc; connector: ConnectorDoc; floKitId: string;
  } | null>(null);

  // ── Derived: kits for selected connector ──────────────────────────────────
  const kitsForConnector = useMemo(() =>
    floKits[selectedConnector] ?? [],
  [floKits, selectedConnector]);

  // Auto-select first kit when connector changes
  const handleSelectConnector = useCallback((id: string) => {
    setSelectedConnector(id);
    setSelectedKit(floKits[id]?.[0]?.id ?? '');
    setSearch('');
  }, [floKits]);

  // ── Derived: actions for selected kit, filtered by search ─────────────────
  const visibleActions = useMemo(() => {
    const all = actions[selectedKit] ?? [];
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter(a =>
      a.label.toLowerCase().includes(q) ||
      a.endpoint.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q),
    );
  }, [actions, selectedKit, search]);

  const activeConnector = connectors.find(c => c.id === selectedConnector);

  return (
    <div style={{
      display: 'flex', height: '100%', gap: 0,
      fontFamily: "'Inter', -apple-system, sans-serif", color: C.text,
    }}>
      {/* ── Left: connector + kit tree ────────────────────────────────────── */}
      <div style={{
        width: 220, flexShrink: 0, overflowY: 'auto',
        borderRight: `1px solid ${C.border}`, paddingRight: 0,
      }}>
        {connectors.length === 0 ? (
          <div style={{ padding: 16, fontSize: 11, color: C.textMuted }}>
            No entitled connectors.
          </div>
        ) : connectors.map(connector => (
          <div key={connector.id}>
            {/* Connector header */}
            <button
              onClick={() => handleSelectConnector(connector.id)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 14px',
                background: selectedConnector === connector.id ? '#1e1e2e' : 'transparent',
                border: 'none', borderBottom: `1px solid ${C.border}`,
                color: selectedConnector === connector.id ? C.textStrong : C.text,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                borderLeft: selectedConnector === connector.id
                  ? `3px solid ${C.accent}` : '3px solid transparent',
                transition: 'all 0.1s',
              }}
            >
              {connector.label}
            </button>

            {/* FloKits under connector */}
            {selectedConnector === connector.id && (
              (floKits[connector.id] ?? []).map(kit => (
                <button
                  key={kit.id}
                  onClick={() => setSelectedKit(kit.id)}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '8px 14px 8px 26px',
                    background: selectedKit === kit.id ? '#16162a' : 'transparent',
                    border: 'none', borderBottom: `1px solid ${C.border}22`,
                    color: selectedKit === kit.id ? C.accent : C.textMuted,
                    fontSize: 11, cursor: 'pointer',
                    transition: 'all 0.1s',
                  }}
                >
                  {kit.label}
                  <span style={{
                    marginLeft: 6, fontSize: 9, color: C.textMuted,
                  }}>({kit.actionIds.length})</span>
                </button>
              ))
            )}
          </div>
        ))}
      </div>

      {/* ── Right: action list ────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Search bar */}
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <input
            style={{
              background: '#16161f', border: `1px solid ${C.border}`,
              borderRadius: 6, color: C.textStrong, padding: '6px 10px',
              fontSize: 12, outline: 'none', flex: 1,
            }}
            placeholder="Search actions…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div style={{ fontSize: 10, color: C.textMuted, whiteSpace: 'nowrap' }}>
            {visibleActions.length} action{visibleActions.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Action cards */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {!selectedKit ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: C.textMuted, fontSize: 12 }}>
              Select a FloKit from the left panel.
            </div>
          ) : visibleActions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: C.textMuted, fontSize: 12 }}>
              No actions found.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleActions.map(action => (
                <div
                  key={action.id}
                  style={{
                    background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: '12px 14px',
                    display: 'flex', alignItems: 'flex-start',
                    gap: 12, transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = C.accent + '66')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                >
                  {/* Method badge */}
                  <div style={{ paddingTop: 2 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                      background: `${methodColour[action.method] ?? '#5a5a70'}22`,
                      color: methodColour[action.method] ?? C.textMuted,
                      border: `1px solid ${methodColour[action.method] ?? '#5a5a70'}44`,
                    }}>{action.method}</span>
                  </div>

                  {/* Action info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: C.textStrong, fontSize: 12 }}>
                      {action.label}
                    </div>
                    <code style={{
                      fontSize: 10, color: C.textMuted, display: 'block',
                      marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {action.endpoint}
                    </code>
                    {action.description && (
                      <div style={{
                        fontSize: 11, color: C.textMuted, marginTop: 4,
                        lineHeight: 1.4,
                      }}>
                        {action.description}
                      </div>
                    )}
                    {/* Output keys preview */}
                    {action.outputKeys && action.outputKeys.length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {action.outputKeys.map(k => (
                          <span key={k} style={{
                            fontSize: 9, padding: '1px 6px', borderRadius: 10,
                            background: C.pill, color: C.textMuted,
                            border: `1px solid ${C.border}`,
                          }}>{k}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add button */}
                  <button
                    onClick={() => activeConnector && setAddTarget({
                      action,
                      connector: activeConnector,
                      floKitId: selectedKit,
                    })}
                    style={{
                      flexShrink: 0, background: 'transparent',
                      border: `1px solid ${C.accent}66`, borderRadius: 6,
                      color: C.accent, padding: '5px 12px',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      transition: 'all 0.15s',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = C.accent;
                      (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      (e.currentTarget as HTMLButtonElement).style.color = C.accent;
                    }}
                  >
                    + Canvas
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── ActionNode form modal ── */}
      {addTarget && (
        <ActionNodeFormModal
          action={addTarget.action}
          connector={addTarget.connector}
          connections={connections}
          protocols={protocols}
          onConfirm={async (connectionId, outputTarget, varName) => {
            await onAddActionNode({
              actionId:    addTarget.action.id,
              floKitId:    addTarget.floKitId,
              connectorId: addTarget.connector.id,
              connectionId,
              outputTarget,
              varName,
            });
          }}
          onClose={() => setAddTarget(null)}
        />
      )}
    </div>
  );
};
