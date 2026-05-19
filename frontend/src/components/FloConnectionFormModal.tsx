/**
 * FloConnectionFormModal.tsx
 *
 * Create / edit a FloConnection.
 *
 * BUG FIX (was causing the CF error):
 *   On CREATE, `connectionId: connection?.id` evaluated to `undefined`
 *   because `connection` is undefined in create mode. The Cloud Function
 *   requires a non-empty connectionId (it is the Firestore docId AND the
 *   Registry key with prefix "flc_"). Fix: generate a slug from the name
 *   automatically and let the admin override it before saving.
 *
 * connectionId rules:
 *   CREATE — auto-derived from name as a URL-safe slug. Admin can override.
 *             Shown as an editable field with a live preview of the Registry key.
 *   EDIT   — locked to the original id (changing it would create a new doc).
 *             Passed through as-is to saveFloConnection for idempotent update.
 *
 * Credential fields: never pre-filled (credentials never leave the backend).
 * On edit, leaving a field blank keeps the existing encrypted value server-side.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { AuthProtocol, ConnectorDoc }          from '@floplug/shared';
import type { FloConnectionSafe }                   from '@floplug/shared';
import type { SaveFloConnectionPayload }            from '../handlers/hubActionHandler';

// ── Slug helper ───────────────────────────────────────────────────────────────
// "Production Gmail SMTP" → "production-gmail-smtp"
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:          '#0e0e14',
  surface:     '#16161f',
  border:      '#2a2a3a',
  borderFocus: '#7c6af7',
  accent:      '#7c6af7',
  accentDim:   '#7c6af718',
  text:        '#c0c0cc',
  textMuted:   '#5a5a70',
  textStrong:  '#e8e8f0',
  danger:      '#e05555',
  dangerDim:   '#e0555518',
  warning:     '#e0a040',
  warningDim:  '#e0a04018',
  success:     '#4caf8a',
  inputBg:     '#1c1c28',
  locked:      '#13131e',
  labelColor:  '#8888a0',
  tag:         '#1e1e2e',
} as const;

const protocolColours: Record<string, string> = {
  httpBasic:         '#4a90d9',
  bearerToken:       '#7c6af7',
  oauth2ClientCreds: '#4caf8a',
  wsseHeader:        '#e0a040',
  apiKeyHeader:      '#d97c4a',
  apiKeyQuery:       '#d95a7c',
  smtp_basic:        '#06b6d4',
};
const protoColor = (p: string) => protocolColours[p] ?? '#7c6af7';

// ── Shared style primitives ───────────────────────────────────────────────────
const baseInput: React.CSSProperties = {
  background: C.inputBg,
  border: `1px solid ${C.border}`,
  borderRadius: 7,
  color: C.textStrong,
  padding: '8px 11px',
  fontSize: 12,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: "'Inter', -apple-system, sans-serif",
  transition: 'border-color 0.15s',
};
const monoInput: React.CSSProperties = {
  ...baseInput,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
  letterSpacing: '0.02em',
};
const lockedInput: React.CSSProperties = {
  ...monoInput,
  background: C.locked,
  color: C.textMuted,
  cursor: 'not-allowed',
  border: `1px solid ${C.border}`,
};
const sLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: C.labelColor, marginBottom: 5,
};
const fg: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 0,
};

// ── Props ─────────────────────────────────────────────────────────────────────
export interface FloConnectionFormModalProps {
  connection?:  FloConnectionSafe;    // undefined = create; defined = edit
  connectors:   ConnectorDoc[];
  protocols:    AuthProtocol[];
  onSave:       (payload: SaveFloConnectionPayload) => Promise<FloConnectionSafe>;
  onClose:      () => void;
}

// ═════════════════════════════════════════════════════════════════════════════
// FloConnectionFormModal
// ═════════════════════════════════════════════════════════════════════════════
export const FloConnectionFormModal: React.FC<FloConnectionFormModalProps> = ({
  connection,
  connectors,
  protocols,
  onSave,
  onClose,
}) => {
  const isEdit = !!connection;

  // ── Form state ─────────────────────────────────────────────────────────────
  const [connectorId,       setConnectorId]       = useState('');
  const [authProtocol,      setAuthProtocol]      = useState('');
  const [name,              setName]              = useState('');
  const [connectionId,      setConnectionId]      = useState('');
  const [idOverridden,      setIdOverridden]      = useState(false);  // true once admin manually edits the id
  const [envLabel,          setEnvLabel]          = useState('');
  const [hostname,          setHostname]          = useState('');
  const [tenantKey,         setTenantKey]         = useState('');
  const [credentials,       setCredentials]       = useState<Record<string, string>>({});
  const [saving,            setSaving]            = useState(false);
  const [error,             setError]             = useState('');
  const [idFocused,         setIdFocused]         = useState(false);

  // ── Seed from existing connection (edit mode) ──────────────────────────────
  useEffect(() => {
    if (isEdit && connection) {
      setConnectorId(connection.connectorId   ?? '');
      setAuthProtocol(connection.authProtocol ?? '');
      setName(connection.name                 ?? '');
      setConnectionId(connection.id           ?? '');  // ← always set on edit
      setIdOverridden(true);                           // lock slug recomputation
      setEnvLabel(connection.environmentLabel ?? '');
      setHostname(connection.hostname         ?? '');
      setTenantKey(connection.tenantKey       ?? '');
    } else {
      // create mode — start blank
      setConnectorId('');
      setAuthProtocol('');
      setName('');
      setConnectionId('');
      setIdOverridden(false);
      setEnvLabel('');
      setHostname('');
      setTenantKey('');
    }
    setCredentials({});
    setError('');
  }, [connection?.id, isEdit]);

  // ── Auto-slug: keep connectionId in sync with name unless admin overrode it ─
  const handleNameChange = (val: string) => {
    setName(val);
    if (!idOverridden) {
      setConnectionId(slugify(val));
    }
  };

  // ── Manual connectionId override ───────────────────────────────────────────
  const handleIdChange = (val: string) => {
    // Allow only valid Firestore docId chars (alphanumeric, hyphens, underscores)
    const safe = val.toLowerCase().replace(/[^a-z0-9-_]/g, '');
    setConnectionId(safe);
    setIdOverridden(true);   // stop auto-slug from overwriting once admin types here
  };

  // ── Reset id override so slug re-derives from name ─────────────────────────
  const resetIdToSlug = () => {
    setConnectionId(slugify(name));
    setIdOverridden(false);
  };

  // ── Connector change → auto-pick first protocol, reset creds ──────────────
  const handleConnectorChange = (id: string) => {
    setConnectorId(id);
    if (!isEdit) {
      const c     = connectors.find(c => c.id === id);
      const first = protocols.find(p => c?.supportedAuthTypes?.includes(p.name) && p.isActive);
      setAuthProtocol(first?.name ?? '');
    }
    setCredentials({});
  };

  const patchCred = useCallback((key: string, val: string) => {
    setCredentials(prev => ({ ...prev, [key]: val }));
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedConnector  = connectors.find(c => c.id === connectorId) ?? null;
  const availableProtocols = protocols.filter(
    p => p.isActive && (!selectedConnector || selectedConnector.supportedAuthTypes.includes(p.name))
  );
  const selectedProtocol   = protocols.find(p => p.name === authProtocol) ?? null;
  const accent             = protoColor(authProtocol || 'bearerToken');
  const registryPreview    = connectionId ? `flc_${connectionId}` : '';

  // ── Validate ───────────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!connectorId)           return 'Please select a Connector.';
    if (!authProtocol)          return 'Please select an Authentication Protocol.';
    if (!name.trim())           return 'Connection Name is required.';
    if (!connectionId.trim())   return 'Connection ID is required — enter a name to auto-generate one.';
    if (!/^[\w-]+$/.test(connectionId)) {
      return 'Connection ID may only contain letters, numbers, hyphens and underscores.';
    }
    if (!isEdit && selectedProtocol) {
      for (const f of selectedProtocol.fields) {
        if (f.required && !credentials[f.name]?.trim()) {
          return `"${f.label}" is required.`;
        }
      }
    }
    return null;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setSaving(true);
    try {
      // ── THE FIX ────────────────────────────────────────────────────────────
      // Previously: connectionId: connection?.id  → undefined on create
      // Now: always send the connectionId from local state, which is either:
      //   CREATE — a slug auto-derived from name (or admin's manual override)
      //   EDIT   — the original connection.id, seeded into state on mount
      // ──────────────────────────────────────────────────────────────────────
      await onSave({
        connectionId:     connectionId.trim(),
        connectorId,
        connectorLabel:   selectedConnector?.label,
        authProtocol,
        name:             name.trim(),
        environmentLabel: envLabel.trim(),
        hostname:         hostname.trim(),
        tenantKey:        tenantKey.trim(),
        credentials,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Escape key ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 14, width: 580, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Inter', -apple-system, sans-serif",
        boxShadow: '0 40px 80px rgba(0,0,0,0.7)',
        overflow: 'hidden',
      }}>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div style={{
          padding: '18px 22px 16px',
          borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          background: '#13131c',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.textStrong, letterSpacing: '-0.01em' }}>
              {isEdit ? 'Edit Connection' : 'New Connection'}
            </div>
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3 }}>
              {isEdit
                ? `Editing ${connection!.name} — leave credential fields blank to keep current values`
                : 'Configure a reusable set of credentials for a connector'}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: C.textMuted,
            fontSize: 16, cursor: 'pointer', padding: '2px 5px',
            borderRadius: 4, lineHeight: 1, marginLeft: 12, flexShrink: 0,
          }}>✕</button>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── Error banner ── */}
            {error && (
              <div style={{
                fontSize: 12, color: C.danger, padding: '9px 12px',
                background: C.dangerDim, borderRadius: 7,
                border: `1px solid ${C.danger}44`,
                display: 'flex', gap: 7, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* ── Connector ── */}
            <div style={fg}>
              <div style={sLabel}>Connector *</div>
              <select
                value={connectorId}
                onChange={e => handleConnectorChange(e.target.value)}
                disabled={isEdit}
                style={{
                  ...baseInput, cursor: isEdit ? 'not-allowed' : 'pointer',
                  opacity: isEdit ? 0.55 : 1,
                  background: isEdit ? C.locked : C.inputBg,
                }}
              >
                <option value="">— select connector —</option>
                {connectors.filter(c => c.isActive).map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              {isEdit && (
                <div style={{ fontSize: 9, color: C.textMuted, marginTop: 3 }}>
                  Connector cannot be changed on edit.
                </div>
              )}
            </div>

            {/* ── Auth Protocol ── */}
            {connectorId && (
              <div style={fg}>
                <div style={sLabel}>Authentication Protocol *</div>
                <select
                  value={authProtocol}
                  onChange={e => { setAuthProtocol(e.target.value); setCredentials({}); }}
                  disabled={isEdit}
                  style={{
                    ...baseInput, cursor: isEdit ? 'not-allowed' : 'pointer',
                    opacity: isEdit ? 0.55 : 1,
                    background: isEdit ? C.locked : C.inputBg,
                  }}
                >
                  <option value="">— select protocol —</option>
                  {availableProtocols.map(p => (
                    <option key={p.name} value={p.name}>{p.label}</option>
                  ))}
                </select>
                {isEdit && (
                  <div style={{ fontSize: 9, color: C.textMuted, marginTop: 3 }}>
                    Auth protocol cannot be changed on edit.
                  </div>
                )}
              </div>
            )}

            {/* ── Name ── */}
            {authProtocol && (
              <div style={fg}>
                <div style={sLabel}>Connection Name *</div>
                <input
                  style={baseInput}
                  value={name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="e.g. Production Gmail SMTP"
                />
                <div style={{ fontSize: 9, color: C.textMuted, marginTop: 3 }}>
                  A human-readable label for this connection.
                </div>
              </div>
            )}

            {/* ── Connection ID — THE KEY FIELD ── */}
            {authProtocol && (
              <div style={{
                background: isEdit ? C.locked : `${accent}0a`,
                border: `1px solid ${isEdit ? C.border : accent + '33'}`,
                borderRadius: 9, padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ ...sLabel, marginBottom: 0, color: isEdit ? C.textMuted : accent }}>
                    Connection ID {isEdit ? '(locked)' : '*'}
                  </div>
                  {!isEdit && idOverridden && (
                    <button
                      onClick={resetIdToSlug}
                      style={{
                        background: 'none', border: 'none', color: C.textMuted,
                        fontSize: 10, cursor: 'pointer', padding: '1px 5px', borderRadius: 3,
                        textDecoration: 'underline',
                      }}
                    >
                      Reset to auto
                    </button>
                  )}
                </div>

                <input
                  style={{
                    ...(isEdit ? lockedInput : {
                      ...monoInput,
                      borderColor: idFocused ? accent : C.border,
                      boxShadow: idFocused ? `0 0 0 2px ${accent}22` : 'none',
                    }),
                  }}
                  value={connectionId}
                  onChange={e => !isEdit && handleIdChange(e.target.value)}
                  onFocus={() => setIdFocused(true)}
                  onBlur={() => setIdFocused(false)}
                  readOnly={isEdit}
                  placeholder="auto-generated from name…"
                  spellCheck={false}
                />

                {/* Registry preview */}
                {registryPreview && (
                  <div style={{
                    marginTop: 7, fontSize: 10, color: C.textMuted,
                    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                  }}>
                    <span>Registry key:</span>
                    <span style={{
                      fontFamily: 'monospace', color: accent,
                      background: `${accent}14`, borderRadius: 4,
                      padding: '1px 6px', fontSize: 10,
                    }}>
                      flc_{connectionId}
                    </span>
                    {!isEdit && (
                      <span style={{ color: C.textMuted }}>
                        · unique per tenant · immutable after save
                      </span>
                    )}
                  </div>
                )}

                {!isEdit && (
                  <div style={{ marginTop: 6, fontSize: 10, color: C.textMuted, lineHeight: 1.5 }}>
                    Used as the Firestore document ID. Auto-generated from the name —
                    override only if you need a specific identifier.
                    Only letters, numbers, hyphens and underscores.
                  </div>
                )}
              </div>
            )}

            {/* ── Environment + Hostname + Tenant Key ── */}
            {authProtocol && (
              <>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ ...fg, flex: 1 }}>
                    <div style={sLabel}>Environment</div>
                    <input
                      style={baseInput} value={envLabel}
                      onChange={e => setEnvLabel(e.target.value)}
                      placeholder="Production / Sandbox / Dev"
                    />
                  </div>
                  <div style={{ ...fg, flex: 1 }}>
                    <div style={sLabel}>Tenant Key</div>
                    <input
                      style={baseInput} value={tenantKey}
                      onChange={e => setTenantKey(e.target.value)}
                      placeholder="target-system tenant id"
                    />
                  </div>
                </div>

                <div style={fg}>
                  <div style={sLabel}>Hostname / Base URL</div>
                  <input
                    style={baseInput} value={hostname}
                    onChange={e => setHostname(e.target.value)}
                    placeholder="https://api.example.com"
                  />
                </div>
              </>
            )}

            {/* ── Dynamic credential fields ── */}
            {selectedProtocol && selectedProtocol.fields.length > 0 && (
              <div style={{
                borderTop: `1px solid ${C.border}`, paddingTop: 16,
                display: 'flex', flexDirection: 'column', gap: 11,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: C.textMuted,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                  }}>
                    Credentials — {selectedProtocol.label}
                  </div>
                  <div style={{
                    fontSize: 9, padding: '1px 7px', borderRadius: 10,
                    background: `${accent}18`, color: accent,
                    border: `0.5px solid ${accent}44`, fontWeight: 600,
                  }}>
                    {selectedProtocol.fields.filter(f => f.requiresMasking).length > 0 ? '🔒 encrypted' : 'stored server-side'}
                  </div>
                </div>

                {isEdit && (
                  <div style={{
                    fontSize: 10, color: C.textMuted, padding: '7px 10px',
                    background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`,
                    lineHeight: 1.5,
                  }}>
                    Credentials are stored encrypted and never returned to the browser.
                    Leave fields blank to keep existing values — only filled fields are updated.
                  </div>
                )}

                {selectedProtocol.fields.map(field => (
                  <div key={field.name} style={fg}>
                    <div style={sLabel}>
                      {field.label}
                      {field.required && !isEdit && (
                        <span style={{ color: C.danger, marginLeft: 3 }}>*</span>
                      )}
                      {field.requiresMasking && (
                        <span style={{ color: C.warning, marginLeft: 5, fontSize: 9 }}>🔒</span>
                      )}
                    </div>
                    {field.fieldType === 'textarea'
                      ? (
                        <textarea
                          style={{
                            ...baseInput, minHeight: 72, resize: 'vertical',
                            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                          } as React.CSSProperties}
                          value={credentials[field.name] ?? ''}
                          onChange={e => patchCred(field.name, e.target.value)}
                          placeholder={isEdit ? '(leave blank to keep current)' : (field.placeholder ?? '')}
                        />
                      ) : field.fieldType === 'select' && (field as any).options ? (
                        <select
                          style={{ ...baseInput, cursor: 'pointer' }}
                          value={credentials[field.name] ?? ''}
                          onChange={e => patchCred(field.name, e.target.value)}
                        >
                          <option value="">— select —</option>
                          {((field as any).options as string[]).map((o: string) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          style={baseInput}
                          type={field.requiresMasking ? 'password' : field.fieldType === 'url' ? 'url' : 'text'}
                          value={credentials[field.name] ?? ''}
                          onChange={e => patchCred(field.name, e.target.value)}
                          placeholder={isEdit ? '(leave blank to keep current)' : (field.placeholder ?? '')}
                          autoComplete={field.requiresMasking ? 'new-password' : 'off'}
                        />
                      )
                    }
                    {field.helpText && (
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3, lineHeight: 1.4 }}>
                        {field.helpText}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div style={{
          padding: '14px 22px',
          borderTop: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#13131c',
        }}>
          {/* ID reminder on create */}
          <div style={{ fontSize: 10, color: C.textMuted, flex: 1, paddingRight: 12 }}>
            {!isEdit && connectionId && (
              <>
                ID: <span style={{ fontFamily: 'monospace', color: accent }}>{connectionId}</span>
                <span style={{ marginLeft: 5 }}>· Registry: </span>
                <span style={{ fontFamily: 'monospace', color: C.textMuted }}>flc_{connectionId}</span>
              </>
            )}
            {isEdit && (
              <span style={{ fontFamily: 'monospace', color: C.textMuted, fontSize: 9 }}>
                ID: {connection!.id}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={onClose}
              style={{
                padding: '7px 16px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                background: 'transparent', border: `1px solid ${C.border}`,
                color: C.text, fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              style={{
                padding: '7px 20px', borderRadius: 7, fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer',
                background: saving ? C.textMuted : accent,
                border: 'none', color: '#fff', fontWeight: 700,
                opacity: saving ? 0.65 : 1, transition: 'background 0.15s',
                fontFamily: 'inherit',
              }}
            >
              {saving ? 'Saving…' : isEdit ? 'Update Connection' : 'Create Connection'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
