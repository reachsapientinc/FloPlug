/**
 * PlugNodeInspectorPanel.tsx
 *
 * Inspector panel for a plugNode in the designer canvas.
 *
 * Additions vs the previous stub:
 *  - Connection dropdown: fetches active FloConnections filtered by
 *    the plug's authProtocol (calls getFloConnectionsForPlug CF).
 *  - Saves connectionId onto the node data on selection.
 *  - Shows a "no connections" warning when none are available for
 *    the plug's protocol (admin must create one in Hub Admin).
 *  - NodePalette tooltip text is derived from the selected connection name.
 *
 * The connectionId stored on the node is the BARE id (no flc_ prefix).
 * The engine's resolvePlugCredentials reads Registry/flc_{connectionId}
 * at runtime.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { Node }                               from '@xyflow/react';
import type { InspectorOnUpdate, DesignerInspectorContext } from './types';
import { getFunctions, httpsCallable }             from 'firebase/functions';
import type { FloConnectionSafe }                  from '@floplug/shared';

// ── Style tokens (matches the dark designer shell) ────────────────────────────

const C = {
  border:    '#2a2a3a',
  accent:    '#7c6af7',
  text:      '#c0c0cc',
  textMuted: '#5a5a70',
  textStrong:'#e8e8f0',
  danger:    '#e05555',
  warning:   '#e0a040',
  success:   '#4caf8a',
  inputBg:   '#1c1c28',
  label:     '#8888a0',
} as const;

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: C.label, marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  background: C.inputBg, border: `1px solid ${C.border}`, borderRadius: 6,
  color: C.textStrong, padding: '6px 10px', fontSize: 11, outline: 'none',
  width: '100%', boxSizing: 'border-box',
  fontFamily: "'Inter', -apple-system, sans-serif",
};
const sectionStyle: React.CSSProperties = {
  marginBottom: 14,
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface PlugNodeInspectorPanelProps {
  node:     Node;
  onUpdate: InspectorOnUpdate;
  ctx:      DesignerInspectorContext;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const PlugNodeInspectorPanel: React.FC<PlugNodeInspectorPanelProps> = ({
  node, onUpdate, ctx,
}) => {
  const data        = node.data as Record<string, any>;
  const authProtocol: string = data.authProtocol ?? '';
  const currentConnectionId: string = data.connectionId ?? '';

  const [connections,    setConnections]    = useState<FloConnectionSafe[]>([]);
  const [loadingConns,   setLoadingConns]   = useState(false);
  const [connError,      setConnError]      = useState('');
  const [selectedConnId, setSelectedConnId] = useState(currentConnectionId);

  // ── Fetch compatible connections ───────────────────────────────────────────
  const fetchConnections = useCallback(async () => {
    if (!authProtocol || !ctx.hubId || !ctx.tenantId) return;
    setLoadingConns(true);
    setConnError('');
    try {
      const fn = httpsCallable<
        { hubId: string; tenantId: string; authProtocol: string },
        { connections: FloConnectionSafe[] }
      >(getFunctions(), 'getFloConnectionsForPlug');
      const res = await fn({
        hubId: ctx.hubId, tenantId: ctx.tenantId, authProtocol,
      });
      setConnections(res.data.connections ?? []);
    } catch (e: any) {
      setConnError(e?.message ?? 'Failed to load connections.');
    } finally {
      setLoadingConns(false);
    }
  }, [authProtocol, ctx.hubId, ctx.tenantId]);

  useEffect(() => { fetchConnections(); }, [fetchConnections]);

  // ── Handle connection selection ────────────────────────────────────────────
  const handleConnectionChange = (connectionId: string) => {
    setSelectedConnId(connectionId);
    const selected = connections.find(c => c.id === connectionId);
    // Persist both the id and the display name onto the node
    onUpdate(node.id, {
      ...data,
      connectionId,
      connectionName: selected?.name ?? '',
    });
  };

  // ── Derive display values ──────────────────────────────────────────────────
  const selectedConn   = connections.find(c => c.id === selectedConnId);
  const hasConnections = connections.length > 0;
  const isConnected    = !!selectedConnId && !!selectedConn;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* ── Plug identity (read-only) ── */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Plug</div>
        <div style={{
          fontSize: 12, fontWeight: 600, color: C.textStrong,
        }}>
          {data.plugName ?? data.name ?? node.id}
        </div>
        {data.connectorLabel && (
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
            {data.connectorLabel}
          </div>
        )}
      </div>

      {/* ── Auth protocol badge ── */}
      {authProtocol && (
        <div style={{ ...sectionStyle }}>
          <div style={labelStyle}>Auth Protocol</div>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 20,
            background: `${C.accent}22`, color: C.accent,
            border: `1px solid ${C.accent}44`,
          }}>
            {authProtocol}
          </span>
        </div>
      )}

      {/* ── Connection selector ── */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={labelStyle}>Connection</div>
          {loadingConns && (
            <span style={{ fontSize: 9, color: C.textMuted }}>Loading…</span>
          )}
          {!loadingConns && (
            <button
              onClick={fetchConnections}
              style={{
                background: 'none', border: 'none', color: C.textMuted,
                fontSize: 9, cursor: 'pointer', padding: 0,
              }}
            >↺ Refresh</button>
          )}
        </div>

        {connError && (
          <div style={{
            fontSize: 10, color: C.danger, padding: '5px 8px',
            background: `${C.danger}18`, borderRadius: 5, marginBottom: 6,
          }}>{connError}</div>
        )}

        {!authProtocol ? (
          <div style={{ fontSize: 10, color: C.textMuted, fontStyle: 'italic' }}>
            No auth protocol on this plug.
          </div>
        ) : !hasConnections && !loadingConns ? (
          <div style={{
            fontSize: 10, color: C.warning, padding: '6px 8px',
            background: `${C.warning}18`, borderRadius: 5,
            border: `1px solid ${C.warning}44`,
          }}>
            No connections found for <strong>{authProtocol}</strong>.<br />
            Ask your hub admin to create one in Hub Admin → Connections.
          </div>
        ) : (
          <select
            value={selectedConnId}
            onChange={e => handleConnectionChange(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
            disabled={loadingConns}
          >
            <option value="">— select connection —</option>
            {connections.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.environmentLabel ? ` (${c.environmentLabel})` : ''}
              </option>
            ))}
          </select>
        )}

        {/* Active connection summary */}
        {isConnected && (
          <div style={{
            marginTop: 6, padding: '6px 8px',
            background: `${C.success}12`, borderRadius: 5,
            border: `1px solid ${C.success}33`,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 10, color: C.success }}>●</span>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.success }}>
                {selectedConn!.name}
              </div>
              {selectedConn!.environmentLabel && (
                <div style={{ fontSize: 9, color: C.textMuted }}>
                  {selectedConn!.environmentLabel}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── URL pattern (read-only) ── */}
      {data.urlPattern && (
        <div style={sectionStyle}>
          <div style={labelStyle}>URL Pattern</div>
          <code style={{
            fontSize: 10, color: C.textMuted, wordBreak: 'break-all',
            display: 'block',
          }}>
            {data.urlPattern}
          </code>
        </div>
      )}

      {/* ── Variable hints ── */}
      {Array.isArray(data.variableHints) && data.variableHints.length > 0 && (
        <div style={sectionStyle}>
          <div style={labelStyle}>URL Variables</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.variableHints.map((hint: any) => (
              <div key={hint.name}>
                <div style={{ fontSize: 10, color: C.label, marginBottom: 3 }}>
                  {'{{'}{hint.name}{'}}'}
                  {hint.hint && (
                    <span style={{ color: C.textMuted, marginLeft: 4, fontStyle: 'italic' }}>
                      — {hint.hint}
                    </span>
                  )}
                </div>
                <input
                  style={inputStyle}
                  defaultValue={
                    data.urlVariables?.[hint.name]?.value ?? hint.defaultValue ?? ''
                  }
                  placeholder={hint.defaultValue ?? ''}
                  onChange={e => {
                    const urlVariables = {
                      ...(data.urlVariables ?? {}),
                      [hint.name]: { source: 'static', value: e.target.value },
                    };
                    onUpdate(node.id, { ...data, urlVariables });
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Response storage config ── */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Response Storage</div>
        <select
          value={data.outputTarget ?? 'cStream'}
          onChange={e => onUpdate(node.id, { ...data, outputTarget: e.target.value })}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="cStream">cStream (default)</option>
          <option value="local">local variable</option>
          <option value="global">global variable</option>
        </select>
        {data.outputTarget && data.outputTarget !== 'cStream' && (
          <input
            style={{ ...inputStyle, marginTop: 6 }}
            value={data.varName ?? ''}
            onChange={e => onUpdate(node.id, { ...data, varName: e.target.value })}
            placeholder={`${data.outputTarget}.myResult`}
          />
        )}
      </div>
    </div>
  );
};
