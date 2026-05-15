/**
 * AuthManagement.tsx — v2
 * 
 * Full CRUD for AuthProtocols stored in FloPlugGlobalSettings/AuthenticationTypes.
 * Product admins can now create new protocols from UI — no seed script needed.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import type { AuthProtocol, AuthProtocolField } from '@floplug/shared';
import {
  COLLECTIONS} from '@floplug/shared';

function grantColor(grantType: string): string {
  const palette = [
    '#4f8ef7', '#0f766e', '#7c3aed', '#0891b2',
    '#b45309', '#6b7280', '#be185d', '#0f766e',
  ];
  let hash = 0;
  for (let i = 0; i < (grantType ?? '').length; i++) {
    hash = (grantType.charCodeAt(i) + ((hash << 5) - hash));
  }
  return palette[Math.abs(hash) % palette.length];
}

const FIELD_ICONS: Record<string, string> = {
  text: '𝐓', password: '🔒', url: '🔗', textarea: '¶', select: '▾',
};

const emptyField = (): AuthProtocolField => ({
  name: '', label: '', fieldType: 'text',
  required: false, requiresMasking: false,
  placeholder: '', helpText: '',
});

const emptyProtocol = (): AuthProtocol => ({
  name:        '',
  label:       '',
  grantType:   'basic',
  isActive:    true,
  sortOrder:   99,
  description: '',
  fields:      [],
});

const AuthManagement: React.FC = () => {
  const [protocols,   setProtocols]   = useState<AuthProtocol[]>([]);
  const [selected,    setSelected]    = useState<string | null>(null);
  const [draft,       setDraft]       = useState<AuthProtocol | null>(null);
  const [isNew,       setIsNew]       = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');
  const [showRuntime, setShowRuntime] = useState(false);

  const grantTypes = [...new Set(protocols.map(p => p.grantType).filter(Boolean))];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, COLLECTIONS.AUTH_TYPES));
      if (snap.exists()) {
        const d = snap.data();
        const raw = (d.authProtocols ?? d.authTypes ?? []) as AuthProtocol[];
        setProtocols(raw.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
      }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSelect = (name: string) => {
    const p = protocols.find(p => p.name === name);
    if (!p) return;
    setSelected(name);
    setIsNew(false);
    setDraft(JSON.parse(JSON.stringify(p)));
    setShowRuntime(false);
    setSuccess(''); setError('');
  };

  const handleNew = () => {
    setSelected(null);
    setIsNew(true);
    setDraft(emptyProtocol());
    setSuccess(''); setError('');
  };

  const handleSave = async () => {
    if (!draft) return;
    if (!draft.name.trim())  { setError('Protocol key (name) is required.'); return; }
    if (!draft.label.trim()) { setError('Display label is required.'); return; }
    if (isNew && protocols.find(p => p.name === draft.name)) {
      setError(`Protocol '${draft.name}' already exists.`); return;
    }

    setSaving(true); setError('');
    try {
      const updated = isNew
        ? [...protocols, { ...draft, sortOrder: protocols.length + 1 }]
        : protocols.map(p => p.name === draft.name ? { ...draft } : p);

      await setDoc(
        doc(db, COLLECTIONS.AUTH_TYPES),
        { authProtocols: updated, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setProtocols(updated);
      setSuccess(isNew ? `Protocol '${draft.label}' created.` : 'Saved.');
      setIsNew(false);
      setSelected(draft.name);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleToggle = async (name: string) => {
    const updated = protocols.map(p => p.name === name ? { ...p, isActive: !p.isActive } : p);
    try {
      await setDoc(doc(db, COLLECTIONS.AUTH_TYPES),
        { authProtocols: updated, updatedAt: serverTimestamp() }, { merge: true });
      setProtocols(updated);
      if (draft?.name === name) setDraft(d => d ? { ...d, isActive: !d.isActive } : d);
    } catch (e: any) { setError(e.message); }
  };

  // ── Field editor helpers ────────────────────────────────────────────────────
  const addField    = () => setDraft(d => d ? { ...d, fields: [...(d.fields ?? []), emptyField()] } : d);
  const removeField = (i: number) => setDraft(d => d ? { ...d, fields: d.fields.filter((_, idx) => idx !== i) } : d);
  const patchField  = (i: number, patch: Partial<AuthProtocolField>) =>
    setDraft(d => d ? { ...d, fields: d.fields.map((f, idx) => idx === i ? { ...f, ...patch } : f) } : d);

  const accent = (p: AuthProtocol) => grantColor(p.grantType ?? '');
  const isEditable = isNew || (selected !== null && !['basic','api_key','oauth2_client_credentials','oauth2_password','oauth2_auth_code','saml_assertion'].includes(selected ?? ''));
  const isSeeded   = !isNew && ['basic','api_key','oauth2_client_credentials','oauth2_password','oauth2_auth_code','saml_assertion'].includes(selected ?? '');

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div>
          <div style={s.title}>Authentication Protocols</div>
          <div style={s.subtitle}>
            Manage authentication protocols. Seeded protocols are read-only for fields —
            create new protocols for custom auth types like SMTP.
          </div>
        </div>
        <button style={s.primaryBtn} onClick={handleNew}>+ New Protocol</button>
      </div>

      {error   && <div style={s.errBanner}>{error}</div>}
      {success && <div style={s.okBanner}>{success}</div>}

      <div style={s.body}>

        {/* List */}
        <div style={s.list}>
          {loading ? <div style={s.empty}>Loading…</div>
          : protocols.map(p => (
            <div key={p.name} onClick={() => handleSelect(p.name)}
              style={{ ...s.listItem, borderLeftColor: accent(p), ...(selected === p.name ? s.listItemOn : {}) }}>
              <div style={s.listTop}>
                <span style={{ ...s.listName, ...(p.isActive ? {} : { color: '#45455a' }) }}>
                  {p.label}
                </span>
                <span onClick={e => { e.stopPropagation(); handleToggle(p.name); }}
                  style={{ ...s.chip, ...(p.isActive ? s.chipGreen : s.chipRed) }}>
                  {p.isActive ? 'Active' : 'Off'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                <span style={{ ...s.badge, background: `${accent(p)}22`, color: accent(p), borderColor: `${accent(p)}44` }}>
                  {p.grantType}
                </span>
                <span style={{ fontSize: 9, color: '#3a3a50' }}>{p.fields?.length ?? 0} fields</span>
                {['basic','api_key','oauth2_client_credentials','oauth2_password','oauth2_auth_code','saml_assertion'].includes(p.name) && (
                  <span style={s.lockBadge}>🔒 seeded</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Editor */}
        {draft ? (
          <div style={s.editor}>

            {/* Header strip */}
            <div style={{ ...s.strip, borderLeftColor: isNew ? '#22c55e' : accent(draft) }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#f0f0f4' }}>
                  {isNew ? 'New Protocol' : draft.label}
                </div>
                {!isNew && <div style={{ fontSize: 10, color: '#45455a', marginTop: 2, fontFamily: 'monospace' }}>{draft.name}</div>}
              </div>
              {isSeeded && <span style={s.lockBadge}>🔒 seeded — fields read-only</span>}
            </div>

            {/* Core fields */}
            <div style={s.section}>
              <div style={s.secTitle}>Protocol Identity</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                {isNew && (
                  <div>
                    <div style={s.label}>Protocol Key (name) *</div>
                    <input style={s.input} value={draft.name} placeholder="smtp_basic"
                      onChange={e => setDraft(d => d ? { ...d, name: e.target.value.toLowerCase().replace(/\s+/g, '_') } : d)} />
                    <div style={{ fontSize: 10, color: '#45455a', marginTop: 3 }}>
                      Lowercase, underscores only. Used as the identifier in connectors and plugs.
                    </div>
                  </div>
                )}

                <div>
                  <div style={s.label}>Display Label *</div>
                  <input style={s.input} value={draft.label}
                    onChange={e => setDraft(d => d ? { ...d, label: e.target.value } : d)} />
                </div>

                <div>
                  <div style={s.label}>Description</div>
                  <textarea style={{ ...s.input, minHeight: 52, resize: 'vertical' }}
                    value={draft.description ?? ''}
                    onChange={e => setDraft(d => d ? { ...d, description: e.target.value } : d)} />
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={s.label}>Grant Type</div>
                    {isNew ? (
                      <select style={s.input} value={draft.grantType ?? ''}
                        onChange={e => setDraft(d => d ? { ...d, grantType: e.target.value } : d)}>
                        <input style={s.input}
                        value={draft.grantType ?? ''}
                        list="grantTypeList"
                        placeholder="smtp, basic, api_key..."
                        onChange={e => setDraft(d => d ? { ...d, grantType: e.target.value } : d)} />
                      <datalist id="grantTypeList">
                        {grantTypes.map(g => <option key={g} value={g} />)}
                      </datalist>
                      </select>
                    ) : (
                      <div style={{ ...s.input, opacity: 0.5, cursor: 'not-allowed' }}>{draft.grantType}</div>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={s.label}>Sort Order</div>
                    <input style={s.input} type="number" value={draft.sortOrder ?? 99}
                      onChange={e => setDraft(d => d ? { ...d, sortOrder: Number(e.target.value) } : d)} />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={draft.isActive}
                    onChange={e => setDraft(d => d ? { ...d, isActive: e.target.checked } : d)}
                    style={{ width: 14, height: 14, accentColor: '#4f8ef7', cursor: 'pointer' }} />
                  <span style={{ fontSize: 12, color: '#9090a0' }}>Active — available to connectors</span>
                </div>
              </div>
            </div>

            {/* Credential Fields */}
            <div style={s.section}>
              <div style={s.secTitle}>
                Credential Fields
                {isSeeded && <span style={{ ...s.lockBadge, marginLeft: 8 }}>🔒 seed script only</span>}
              </div>

              {isSeeded ? (
                /* Read-only view for seeded protocols */
                <>
                  <div style={{ fontSize: 10, color: '#45455a', marginBottom: 10, lineHeight: 1.5 }}>
                    Shown to hub admins when configuring a plug. Managed via seed script.
                  </div>
                  <div style={{ display: 'flex', gap: 8, paddingBottom: 6, borderBottom: '0.5px solid rgba(255,255,255,0.06)', marginBottom: 4, fontSize: 9, color: '#45455a', textTransform: 'uppercase' as const }}>
                    <div style={{ flex: '0 0 18px' }} />
                    <div style={{ flex: 2 }}>Key</div>
                    <div style={{ flex: 2 }}>Label</div>
                    <div style={{ flex: '0 0 60px', textAlign: 'center' as const }}>Req</div>
                    <div style={{ flex: '0 0 60px', textAlign: 'center' as const }}>Mask</div>
                  </div>
                  {(draft.fields ?? []).map((f: AuthProtocolField) => (
                    <div key={f.name} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderBottom: '0.5px solid rgba(255,255,255,0.03)' }}>
                      <div style={{ flex: '0 0 18px', fontSize: 10, color: '#6b6b80' }}>{FIELD_ICONS[f.fieldType] ?? '?'}</div>
                      <div style={{ flex: 2, fontSize: 10, color: '#c0c0cc', fontFamily: 'monospace' }}>{f.name}</div>
                      <div style={{ flex: 2 }}>
                        <div style={{ fontSize: 11, color: '#f0f0f4' }}>{f.label}</div>
                        {f.placeholder && <div style={{ fontSize: 9, color: '#3a3a50', marginTop: 1 }}>{f.placeholder}</div>}
                      </div>
                      <div style={{ flex: '0 0 60px', textAlign: 'center' as const }}>
                        {f.required ? <span style={{ color: '#f87171', fontSize: 12 }}>✓</span> : <span style={{ color: '#3a3a50' }}>—</span>}
                      </div>
                      <div style={{ flex: '0 0 60px', textAlign: 'center' as const }}>
                        {f.requiresMasking ? '🔒' : <span style={{ color: '#3a3a50' }}>—</span>}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                /* Editable fields for new protocols */
                <>
                  <div style={{ fontSize: 10, color: '#45455a', marginBottom: 10, lineHeight: 1.5 }}>
                    Define the credential fields hub admins fill in when creating a plug.
                  </div>

                  {(draft.fields ?? []).map((f, i) => (
                    <div key={i} style={s.fieldCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#c0c0cc' }}>
                          {f.label || f.name || `Field ${i + 1}`}
                        </span>
                        <button onClick={() => removeField(i)}
                          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12 }}>
                          Remove
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <div>
                          <div style={s.label}>Field Key *</div>
                          <input style={s.input} value={f.name} placeholder="host"
                            onChange={e => patchField(i, { name: e.target.value })} />
                        </div>
                        <div>
                          <div style={s.label}>Display Label *</div>
                          <input style={s.input} value={f.label} placeholder="SMTP Host"
                            onChange={e => patchField(i, { label: e.target.value })} />
                        </div>
                        <div>
                          <div style={s.label}>Field Type</div>
                          <select style={s.input} value={f.fieldType}
                            onChange={e => patchField(i, { fieldType: e.target.value as any })}>
                            {['text','password','url','textarea','select'].map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <div style={s.label}>Placeholder</div>
                          <input style={s.input} value={f.placeholder ?? ''}
                            onChange={e => patchField(i, { placeholder: e.target.value })} />
                        </div>
                      </div>

                      {f.fieldType === 'select' && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={s.label}>Options (comma-separated)</div>
                          <input style={s.input}
                            value={(f.options ?? []).join(',')}
                            placeholder="25,465,587,2525"
                            onChange={e => patchField(i, { options: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })} />
                        </div>
                      )}

                      <div>
                        <div style={s.label}>Help Text</div>
                        <input style={s.input} value={f.helpText ?? ''}
                          onChange={e => patchField(i, { helpText: e.target.value })} />
                      </div>

                      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9090a0', cursor: 'pointer' }}>
                          <input type="checkbox" checked={f.required}
                            onChange={e => patchField(i, { required: e.target.checked })}
                            style={{ accentColor: '#4f8ef7' }} />
                          Required
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9090a0', cursor: 'pointer' }}>
                          <input type="checkbox" checked={f.requiresMasking}
                            onChange={e => patchField(i, { requiresMasking: e.target.checked })}
                            style={{ accentColor: '#4f8ef7' }} />
                          Mask (encrypt)
                        </label>
                      </div>
                    </div>
                  ))}

                  <button onClick={addField} style={s.addLink}>+ Add Field</button>
                </>
              )}
            </div>

            {/* Runtime config — collapsible, read-only */}
            {!isNew && draft.runtimeConfig && (
              <div style={s.section}>
                <div style={{ ...s.secTitle, cursor: 'pointer', userSelect: 'none' as const }}
                  onClick={() => setShowRuntime(v => !v)}>
                  Runtime Config
                  <span style={{ ...s.lockBadge, marginLeft: 8 }}>🔒 seed script only</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4f8ef7' }}>
                    {showRuntime ? '▲ hide' : '▼ show'}
                  </span>
                </div>
                {showRuntime && (
                  <pre style={{ fontSize: 10, color: '#6b6b80', background: '#0a0c12', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '12px', overflowX: 'auto', marginTop: 8, lineHeight: 1.6, fontFamily: 'monospace' }}>
                    {JSON.stringify(draft.runtimeConfig, null, 2)}
                  </pre>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={s.cancelBtn}
                onClick={() => { setDraft(null); setSelected(null); setIsNew(false); }}>
                Cancel
              </button>
              <button style={s.primaryBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : isNew ? 'Create Protocol' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ ...s.editor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={s.empty}>Select a protocol to view or edit, or create a new one.</div>
          </div>
        )}
      </div>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  root:      { padding: '28px 32px', color: '#f0f0f4', fontFamily: "'Inter',-apple-system,sans-serif", maxWidth: 1100 },
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title:     { fontSize: 20, fontWeight: 700, color: '#f0f0f4', marginBottom: 4 },
  subtitle:  { fontSize: 12, color: '#6b6b80', maxWidth: 620, lineHeight: 1.6 },
  body:      { display: 'flex', gap: 20, alignItems: 'flex-start' },
  list:      { flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: 6 },
  listItem:  { background: '#181b24', border: '0.5px solid rgba(255,255,255,0.07)', borderLeft: '3px solid transparent', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' },
  listItemOn:{ background: '#1e2130', borderColor: 'rgba(255,255,255,0.12)' },
  listTop:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  listName:  { fontSize: 12, fontWeight: 600, color: '#f0f0f4', lineHeight: 1.3 },
  chip:      { fontSize: 9, padding: '2px 7px', borderRadius: 20, fontWeight: 600, cursor: 'pointer', border: '0.5px solid transparent' },
  chipGreen: { background: 'rgba(34,197,94,0.12)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' },
  chipRed:   { background: 'rgba(239,68,68,0.1)',  color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' },
  badge:     { fontSize: 9, padding: '2px 7px', borderRadius: 4, fontFamily: 'monospace', border: '0.5px solid transparent' },
  lockBadge: { fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: '#45455a', border: '0.5px solid rgba(255,255,255,0.06)' },
  empty:     { fontSize: 12, color: '#45455a', lineHeight: 1.6 },
  editor:    { flex: 1, background: '#181b24', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 },
  strip:     { borderLeft: '3px solid transparent', paddingLeft: 12, display: 'flex', alignItems: 'center', gap: 12 },
  section:   { background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '14px 16px' },
  secTitle:  { fontSize: 10, fontWeight: 700, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 },
  label:     { fontSize: 10, color: '#6b6b80', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 },
  input:     { padding: '8px 10px', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.1)', background: '#0f1117', color: '#f0f0f4', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' },
  fieldCard: { background: '#0f1219', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 7, padding: '12px 14px', marginBottom: 10 },
  addLink:   { fontSize: 11, color: '#4f8ef7', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' },
  primaryBtn:{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#4f8ef7', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  cancelBtn: { padding: '8px 18px', borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#6b6b80', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  errBanner: { padding: '10px 14px', borderRadius: 7, marginBottom: 14, background: 'rgba(220,38,38,0.1)', border: '0.5px solid rgba(220,38,38,0.25)', color: '#f87171', fontSize: 12 },
  okBanner:  { padding: '10px 14px', borderRadius: 7, marginBottom: 14, background: 'rgba(34,197,94,0.08)', border: '0.5px solid rgba(34,197,94,0.25)', color: '#22c55e', fontSize: 12 },
};

export default AuthManagement;