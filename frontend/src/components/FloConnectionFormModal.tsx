/**
 * FloConnectionFormModal.tsx
 *
 * Create / edit a FloConnection.
 * Fields are dynamically driven by the selected AuthProtocol — same pattern
 * as PlugFormModal uses for plug credentials.
 *
 * On edit, credential fields show a placeholder ("••••••") rather than the
 * stored value (credentials never travel to the browser). Leaving a field
 * blank on edit preserves the existing stored value (server merges).
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { AuthProtocol, ConnectorDoc }          from '@floplug/shared';
import type { FloConnectionSafe }                   from '@floplug/shared';
import type { SaveFloConnectionPayload }            from '../../handlers/hubActionHandler';

// ── Inline style tokens (matches the dark admin shell) ────────────────────────

const C = {
  bg:          '#0e0e14',
  surface:     '#16161f',
  border:      '#2a2a3a',
  accent:      '#7c6af7',
  accentHover: '#6a59e0',
  text:        '#c0c0cc',
  textMuted:   '#5a5a70',
  textStrong:  '#e8e8f0',
  danger:      '#e05555',
  success:     '#4caf8a',
  inputBg:     '#1c1c28',
  labelColor:  '#8888a0',
} as const;

const row: React.CSSProperties   = { display: 'flex', gap: 12 };
const col: React.CSSProperties   = { display: 'flex', flexDirection: 'column', flex: 1 };
const label: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: C.labelColor, marginBottom: 4,
};
const input: React.CSSProperties = {
  background: C.inputBg, border: `1px solid ${C.border}`, borderRadius: 6,
  color: C.textStrong, padding: '7px 10px', fontSize: 12, outline: 'none',
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  transition: 'border-color 0.15s',
};
const selectStyle: React.CSSProperties = { ...input, cursor: 'pointer' };

// ── Props ─────────────────────────────────────────────────────────────────────

export interface FloConnectionFormModalProps {
  /** Existing connection when editing; undefined when creating */
  connection?:  FloConnectionSafe;
  connectors:   ConnectorDoc[];
  protocols:    AuthProtocol[];
  onSave:       (payload: SaveFloConnectionPayload) => Promise<FloConnectionSafe>;
  onClose:      () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const FloConnectionFormModal: React.FC<FloConnectionFormModalProps> = ({
  connection,
  connectors,
  protocols,
  onSave,
  onClose,
}) => {
  const isEdit = !!connection;

  // ── Form state ─────────────────────────────────────────────────────────────
  const [connectorId,    setConnectorId]    = useState(connection?.connectorId    ?? '');
  const [authProtocol,   setAuthProtocol]   = useState(connection?.authProtocol   ?? '');
  const [name,           setName]           = useState(connection?.name           ?? '');
  const [envLabel,       setEnvLabel]       = useState(connection?.environmentLabel ?? '');
  const [hostname,       setHostname]       = useState(connection?.hostname        ?? '');
  const [tenantKey,      setTenantKey]      = useState(connection?.tenantKey       ?? '');
  const [credentials,    setCredentials]    = useState<Record<string, string>>({});
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState('');

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedConnector = connectors.find(c => c.id === connectorId);
  const availableProtocols = protocols.filter(p =>
    p.isActive &&
    (!selectedConnector || selectedConnector.supportedAuthTypes.includes(p.name)),
  );
  const selectedProtocol = protocols.find(p => p.name === authProtocol);

  // Reset protocol when connector changes (unless editing, keep original)
  useEffect(() => {
    if (!isEdit) setAuthProtocol('');
    setCredentials({});
  }, [connectorId]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Credential field handler ───────────────────────────────────────────────
  const setCredField = useCallback((fieldName: string, value: string) => {
    setCredentials(prev => ({ ...prev, [fieldName]: value }));
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError('');
    if (!connectorId || !authProtocol || !name.trim()) {
      setError('Connector, Auth Protocol and Name are required.');
      return;
    }

    // On create, validate that all required credential fields are filled
    if (!isEdit && selectedProtocol) {
      const missing = selectedProtocol.fields
        .filter(f => f.required && !credentials[f.name]?.trim());
      if (missing.length) {
        setError(`Required credential fields: ${missing.map(f => f.label).join(', ')}`);
        return;
      }
    }

    setSaving(true);
    try {
      await onSave({
        connectionId:   connection?.id,
        connectorId,
        connectorLabel: selectedConnector?.label,
        authProtocol,
        name:           name.trim(),
        environmentLabel: envLabel,
        hostname,
        tenantKey,
        credentials,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 12, width: 560, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Inter', -apple-system, sans-serif",
        boxShadow: '0 32px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 20px 14px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.textStrong }}>
              {isEdit ? 'Edit Connection' : 'New Connection'}
            </div>
            {isEdit && (
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                {connection!.id}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: C.textMuted,
            fontSize: 18, cursor: 'pointer', padding: '2px 6px', borderRadius: 4,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Connector */}
            <div style={col}>
              <div style={label}>Connector *</div>
              <select
                value={connectorId}
                onChange={e => setConnectorId(e.target.value)}
                disabled={isEdit}
                style={{ ...selectStyle, opacity: isEdit ? 0.5 : 1 }}
              >
                <option value="">— select connector —</option>
                {connectors.filter(c => c.isActive).map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Auth Protocol */}
            <div style={col}>
              <div style={label}>Auth Protocol *</div>
              <select
                value={authProtocol}
                onChange={e => setAuthProtocol(e.target.value)}
                disabled={isEdit || !connectorId}
                style={{ ...selectStyle, opacity: (isEdit || !connectorId) ? 0.5 : 1 }}
              >
                <option value="">— select protocol —</option>
                {availableProtocols.map(p => (
                  <option key={p.name} value={p.name}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* Name + Environment */}
            <div style={row}>
              <div style={col}>
                <div style={label}>Connection Name *</div>
                <input
                  style={input} value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Workday Production"
                />
              </div>
              <div style={col}>
                <div style={label}>Environment</div>
                <input
                  style={input} value={envLabel}
                  onChange={e => setEnvLabel(e.target.value)}
                  placeholder="Production / Sandbox"
                />
              </div>
            </div>

            {/* Hostname + Tenant Key */}
            <div style={row}>
              <div style={col}>
                <div style={label}>Hostname / Base URL</div>
                <input
                  style={input} value={hostname}
                  onChange={e => setHostname(e.target.value)}
                  placeholder="https://api.example.com"
                />
              </div>
              <div style={col}>
                <div style={label}>Tenant Key</div>
                <input
                  style={input} value={tenantKey}
                  onChange={e => setTenantKey(e.target.value)}
                  placeholder="target-system tenant id"
                />
              </div>
            </div>

            {/* Dynamic credential fields from the selected protocol */}
            {selectedProtocol && selectedProtocol.fields.length > 0 && (
              <div style={{
                borderTop: `1px solid ${C.border}`, paddingTop: 14,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: C.textMuted,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                }}>
                  Credentials — {selectedProtocol.label}
                </div>
                {isEdit && (
                  <div style={{
                    fontSize: 10, color: C.textMuted, padding: '6px 10px',
                    background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`,
                  }}>
                    Leave fields blank to keep existing stored values.
                    Only fields you fill will be updated.
                  </div>
                )}
                {selectedProtocol.fields.map(field => (
                  <div key={field.name} style={col}>
                    <div style={label}>
                      {field.label}
                      {field.required && !isEdit && (
                        <span style={{ color: C.danger, marginLeft: 3 }}>*</span>
                      )}
                    </div>
                    <input
                      style={input}
                      type={field.requiresMasking ? 'password' : 'text'}
                      value={credentials[field.name] ?? ''}
                      onChange={e => setCredField(field.name, e.target.value)}
                      placeholder={isEdit ? '•••••••• (unchanged)' : (field.placeholder ?? '')}
                      autoComplete="off"
                    />
                    {field.helpText && (
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3 }}>
                        {field.helpText}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                fontSize: 11, color: C.danger, padding: '8px 10px',
                background: `${C.danger}18`, borderRadius: 6,
                border: `1px solid ${C.danger}44`,
              }}>
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px', borderTop: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
              background: 'transparent', border: `1px solid ${C.border}`,
              color: C.text,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              padding: '7px 18px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
              background: saving ? C.textMuted : C.accent, border: 'none',
              color: '#fff', fontWeight: 600, opacity: saving ? 0.7 : 1,
              transition: 'background 0.15s',
            }}
          >
            {saving ? 'Saving…' : isEdit ? 'Update Connection' : 'Create Connection'}
          </button>
        </div>
      </div>
    </div>
  );
};
