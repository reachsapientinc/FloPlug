/**
 * ConnectorManagement.tsx
 *
 * v4 changes:
 *   - Auth Override now includes extraFields editor — add custom credential
 *     fields (e.g. Workday's refreshToken) without touching the seed script.
 *   - Fixed override section contrast / readability.
 *   - Fixed Firestore doc path (separate args, not slash string).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import {
  collection, doc, getDocs, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
// import type {
//   AuthProtocol, AuthProtocolField, ConnectorDoc, ConnectorAuthOverride,
// } from '../types/AuthConnectorTypes';

import type { AuthProtocol, ConnectorDoc, AuthProtocolField,ConnectorAuthOverride} from "@floplug/shared";
import {
  COLLECTIONS} from '@floplug/shared';

const CATEGORIES = ['ERP', 'CRM', 'HRIS', 'Payroll', 'Storage', 'Email', 'Messaging', 'Custom'];
const FIELD_TYPES = ['text', 'password', 'url', 'textarea', 'select'] as const;


// function grantColor(grantType: string): string {
//   const palette = [
//     '#4f8ef7', '#0f766e', '#7c3aed', '#0891b2',
//     '#b45309', '#6b7280', '#be185d', '#0f766e',
//   ];
//   let hash = 0;
//   for (let i = 0; i < (grantType ?? '').length; i++) {
//     hash = (grantType.charCodeAt(i) + ((hash << 5) - hash));
//   }
//   return palette[Math.abs(hash) % palette.length];
// }



const emptyOverride = (): ConnectorAuthOverride => ({
  grantType:            '',
  bodyFormat:           'form',
  extraBodyParams:      {},
  fieldMappings:        {},
  tokenResponseMapping: { accessToken: '', refreshToken: '', expiresIn: '' },
  extraFields:          [],
  notes:                '',
});

const emptyField = (): AuthProtocolField => ({
  name: '', label: '', fieldType: 'text',
  required: false, requiresMasking: false, placeholder: '', helpText: '',
});

const emptyForm = (): ConnectorDoc => ({
  id: '', label: '', category: 'ERP',
  supportedAuthTypes: [], description: '', isActive: true,
  allowActionNodes: false,
  tierControlled:             false,
  availableForTiers:          [],
});

// ── KV editor ────────────────────────────────────────────────────────────────
interface KVEditorProps {
  label: string; hint: string;
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}
const KVEditor: React.FC<KVEditorProps> = ({ label, hint, value, onChange }) => {
  const pairs = Object.entries(value);
  const set = (i: number, k: string, v: string) => {
    const next = [...pairs]; next[i] = [k, v];
    onChange(Object.fromEntries(next.filter(([key]) => key)));
  };
  const add    = () => onChange({ ...value, '': '' });
  const remove = (i: number) => onChange(Object.fromEntries(pairs.filter((_, idx) => idx !== i)));

  return (
    <div>
      <div style={s.oLabel}>{label}</div>
      <div style={s.oHint}>{hint}</div>
      {pairs.map(([k, v], i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 5, alignItems: 'center' }}>
          <input style={{ ...s.oInput, flex: 1 }} value={k} placeholder="key"
            onChange={e => set(i, e.target.value, v)} />
          <span style={{ color: '#6b6b80', fontSize: 12 }}>→</span>
          <input style={{ ...s.oInput, flex: 1 }} value={v} placeholder="value"
            onChange={e => set(i, k, e.target.value)} />
          <button onClick={() => remove(i)}
            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>×</button>
        </div>
      ))}
      <button onClick={add} style={s.addLink}>+ Add entry</button>
    </div>
  );
};

// ── Extra fields editor ───────────────────────────────────────────────────────
interface ExtraFieldsEditorProps {
  fields:   AuthProtocolField[];
  onChange: (next: AuthProtocolField[]) => void;
}
const ExtraFieldsEditor: React.FC<ExtraFieldsEditorProps> = ({ fields, onChange }) => {
  const add    = () => onChange([...fields, emptyField()]);
  const remove = (i: number) => onChange(fields.filter((_, idx) => idx !== i));
  const patch  = (i: number, p: Partial<AuthProtocolField>) =>
    onChange(fields.map((f, idx) => idx === i ? { ...f, ...p } : f));

  return (
    <div>
      <div style={s.oLabel}>Extra Credential Fields</div>
      <div style={s.oHint}>
        Add fields that don't exist in the base protocol — e.g. Workday needs a
        <code style={{ margin: '0 4px', color: '#4f8ef7' }}>refreshToken</code>
        field not present in the standard OAuth2 Password schema.
        These are merged into the plug form alongside the protocol's base fields.
      </div>

      {fields.length === 0 && (
        <div style={{ fontSize: 11, color: '#3a3a50', marginBottom: 8, fontStyle: 'italic' }}>
          No extra fields — base protocol fields are used as-is.
        </div>
      )}

      {fields.map((f, i) => (
        <div key={i} style={s.extraFieldCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#c0c0cc' }}>
              {f.label || f.name || `Field ${i + 1}`}
            </span>
            <button onClick={() => remove(i)}
              style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 13 }}>
              Remove
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <div style={s.oMiniLabel}>Field Key (name) *</div>
              <input style={s.oInput} value={f.name} placeholder="e.g. refreshToken"
                onChange={e => patch(i, { name: e.target.value })} />
            </div>
            <div>
              <div style={s.oMiniLabel}>Display Label *</div>
              <input style={s.oInput} value={f.label} placeholder="e.g. Refresh Token"
                onChange={e => patch(i, { label: e.target.value })} />
            </div>
            <div>
              <div style={s.oMiniLabel}>Field Type</div>
              <select style={s.oInput} value={f.fieldType}
                onChange={e => patch(i, { fieldType: e.target.value as any })}>
                {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={s.oMiniLabel}>Placeholder</div>
              <input style={s.oInput} value={f.placeholder ?? ''} placeholder="hint text…"
                onChange={e => patch(i, { placeholder: e.target.value })} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <label style={s.checkRow}>
              <input type="checkbox" checked={f.required}
                onChange={e => patch(i, { required: e.target.checked })}
                style={{ accentColor: '#f87171' }} />
              <span style={{ color: '#f87171' }}>Required</span>
            </label>
            <label style={s.checkRow}>
              <input type="checkbox" checked={f.requiresMasking}
                onChange={e => patch(i, { requiresMasking: e.target.checked })}
                style={{ accentColor: '#f59e0b' }} />
              <span style={{ color: '#f59e0b' }}>🔒 Mask (encrypt at rest)</span>
            </label>
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={s.oMiniLabel}>Help Text</div>
            <input style={s.oInput} value={f.helpText ?? ''} placeholder="Shown below the field in plug config…"
              onChange={e => patch(i, { helpText: e.target.value })} />
          </div>
        </div>
      ))}

      <button onClick={add} style={{ ...s.addLink, marginTop: 4 }}>+ Add extra field</button>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// ConnectorManagement
// ═════════════════════════════════════════════════════════════════════════════
const ConnectorManagement: React.FC = () => {
  const [connectors,   setConnectors]   = useState<ConnectorDoc[]>([]);
  const [authTypes,    setAuthTypes]    = useState<AuthProtocol[]>([]);
  const [selected,     setSelected]     = useState<string | null>(null);
  const [form,         setForm]         = useState<ConnectorDoc>(emptyForm());
  const [override,     setOverride]     = useState<ConnectorAuthOverride>(emptyOverride());
  const [showOverride, setShowOverride] = useState(false);
  const [isNew,        setIsNew]        = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [successMsg,   setSuccessMsg]   = useState('');
  const [expandedAuth, setExpandedAuth] = useState<string | null>(null);
  const [availableTiers, setAvailableTiers] = useState<{ id: string; tierName: string }[]>([]);

  const grantTypes = [...new Set(authTypes.map(p => p.grantType).filter(Boolean))];
  // const accent = (p: AuthProtocol | ConnectorDoc) =>
  //   grantColor(('grantType' in p ? p.grantType : '') ?? '');

  // ── Load ──────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [connSnap, authSnap] = await Promise.all([
        getDocs(collection(db, COLLECTIONS.CONNECTORS)),
        getDoc(doc(db, COLLECTIONS.AUTH_TYPES)),
      ]);
      setConnectors(connSnap.docs
        .map(d => {
          const data = d.data();
          const sat: string[] = Array.isArray(data.supportedAuthTypes)
            ? data.supportedAuthTypes
            : data.authTypeName ? [data.authTypeName] : [];
          return { id: d.id, ...data, supportedAuthTypes: sat } as ConnectorDoc;
        })
        .sort((a, b) => a.label.localeCompare(b.label)));

      if (authSnap.exists()) {
        const d = authSnap.data();
        const raw = (d.authProtocols ?? d.authTypes ?? []) as AuthProtocol[];
        setAuthTypes(raw.filter((p: AuthProtocol) => p.isActive));
        const tierSnap = await getDocs(collection(db, 'FloPlugTiers'));
        setAvailableTiers(tierSnap.docs.map(d => ({
          id:       d.id,
          tierName: (d.data().tierName as string) ?? d.id,
        })));
      }
    } catch (e: any) {
      console.error('[ConnectorMgmt] Load failed:', e);
      setError(`Load failed: ${e.message}`);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Select / new ──────────────────────────────────────────────────────────────
  const handleSelect = (c: ConnectorDoc) => {
    setSelected(c.id);
    setForm({ ...c, supportedAuthTypes: [...(c.supportedAuthTypes ?? [])] });
    setOverride(c.authOverride ? { ...emptyOverride(), ...c.authOverride } : emptyOverride());
    setShowOverride(!!c.authOverride);
    setIsNew(false); setExpandedAuth(null);
    setSuccessMsg(''); setError('');
  };

  const handleAddNew = () => {
    setSelected(null); setForm(emptyForm());
    setOverride(emptyOverride()); setShowOverride(false);
    setIsNew(true); setExpandedAuth(null);
    setSuccessMsg(''); setError('');
  };

  const patch = (p: Partial<ConnectorDoc>) => setForm(f => ({ ...f, ...p }));
  const patchOv = (p: Partial<ConnectorAuthOverride>) => setOverride(o => ({ ...o, ...p }));
  const patchTkMap = (p: Partial<NonNullable<ConnectorAuthOverride['tokenResponseMapping']>>) =>
    setOverride(o => ({ ...o, tokenResponseMapping: { ...o.tokenResponseMapping, ...p } }));

  const toggleAuthType = (name: string) => {
    setForm(f => {
      const has = f.supportedAuthTypes.includes(name);
      return { ...f, supportedAuthTypes: has ? f.supportedAuthTypes.filter(n => n !== name) : [...f.supportedAuthTypes, name] };
    });
    setExpandedAuth(p => p === name ? null : name);
  };

  // ── Save ──────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setError(''); setSuccessMsg('');
    const connId = form.id.trim();
    if (!connId)           { setError('Connector ID is required.'); return; }
    if (!form.label.trim()){ setError('Display Name is required.'); return; }
    if (form.supportedAuthTypes.length === 0) { setError('Select at least one auth type.'); return; }

    // Build clean override — only include if showOverride and has values
    const cleanOv: ConnectorAuthOverride | undefined = showOverride ? {
      ...(override.grantType ? { grantType: override.grantType } : {}),
      ...(override.bodyFormat ? { bodyFormat: override.bodyFormat } : {}),
      ...(Object.keys(override.extraBodyParams ?? {}).length ? { extraBodyParams: override.extraBodyParams } : {}),
      ...(Object.keys(override.fieldMappings   ?? {}).length ? { fieldMappings:   override.fieldMappings   } : {}),
      ...((override.tokenResponseMapping?.accessToken || override.tokenResponseMapping?.refreshToken)
        ? { tokenResponseMapping: override.tokenResponseMapping } : {}),
      ...((override.extraFields ?? []).length > 0 ? { extraFields: override.extraFields } : {}),
      ...(override.notes ? { notes: override.notes } : {}),
    } : undefined;

    console.log('[ConnectorMgmt] Saving:', connId);
    setSaving(true);
    try {
      const payload: Record<string, any> = {
          id: connId, label: form.label.trim(), category: form.category,
          supportedAuthTypes: form.supportedAuthTypes,
          description: form.description.trim(), isActive: form.isActive,
          allowActionNodes: form.allowActionNodes ?? false,
          tierControlled:             form.tierControlled             ?? false,
          availableForTiers:          form.availableForTiers          ?? [],
          updatedAt: serverTimestamp(),
        };
      if (cleanOv) payload.authOverride = cleanOv;

      await setDoc(doc(db, 'FloPlugConnectors', connId), payload, { merge: true });

      const saved: ConnectorDoc = { ...form, id: connId, authOverride: cleanOv };
      setConnectors(prev => {
        const idx = prev.findIndex(c => c.id === connId);
        if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n; }
        return [...prev, saved].sort((a, b) => a.label.localeCompare(b.label));
      });
      setSelected(connId); setIsNew(false);
      setSuccessMsg('Saved successfully.');
    } catch (e: any) {
      console.error('[ConnectorMgmt] Save failed:', e);
      setError(`Save failed: ${e.message}`);
    } finally { setSaving(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={s.root}>
      <div style={s.header}>
        <div>
          <div style={s.title}>Connector Registry</div>
          <div style={s.subtitle}>
            Register connectors and configure their supported auth protocols.
            Use Auth Overrides to handle connector-specific behavior like Workday's
            refresh_token grant or custom credential fields.
          </div>
        </div>
        <button onClick={handleAddNew} style={s.primaryBtn}>+ New Connector</button>
      </div>

      {error      && <div style={s.errBanner}>{error}</div>}
      {successMsg && <div style={s.okBanner}>{successMsg}</div>}

      <div style={s.body}>

        {/* ── Left: list ─────────────────────────────────────────────────────── */}
        <div style={s.list}>
          {loading ? <div style={s.empty}>Loading…</div>
          : connectors.length === 0 ? <div style={s.empty}>No connectors yet.</div>
          : connectors.map(c => (
            <div key={c.id} onClick={() => handleSelect(c)}
              style={{ ...s.listItem, ...(selected === c.id && !isNew ? s.listOn : {}) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#f0f0f4' }}>{c.label}</span>
                <span style={{ ...s.chip, ...(c.isActive ? s.chipGreen : s.chipRed) }}>
                  {c.isActive ? 'Active' : 'Off'}
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#45455a', marginBottom: 4 }}>{c.id} · {c.category}</div>
              {(c.supportedAuthTypes ?? []).map(n => {
                const at = authTypes.find(a => a.name === n);
                return <span key={n} style={s.authPill}>🔑 {at?.label ?? n}</span>;
              })}
              {c.authOverride && (
                <div style={s.overridePill}>⚙ override active
                  {(c.authOverride.extraFields ?? []).length > 0 &&
                    ` · ${c.authOverride.extraFields!.length} extra field(s)`}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Right: editor ──────────────────────────────────────────────────── */}
        {(isNew || selected) ? (
          <div style={s.editor}>

            {/* Basic info */}
            <div style={s.section}>
              <div style={s.secTitle}>{isNew ? 'New Connector' : `Editing: ${form.label}`}</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={s.fg}>
                  <label style={s.fl}>Connector ID *</label>
                  <input style={{ ...s.input, ...(isNew ? {} : s.inputDim) }}
                    value={form.id} placeholder="e.g. workday" disabled={!isNew}
                    onChange={e => patch({ id: e.target.value.replace(/\s/g, '_') })} />
                </div>
                <div style={s.fg}>
                  <label style={s.fl}>Display Name *</label>
                  <input style={s.input} value={form.label} placeholder="e.g. Workday HCM"
                    onChange={e => patch({ label: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                <div style={s.fg}>
                  <label style={s.fl}>Category</label>
                  <select style={s.input} value={form.category}
                    onChange={e => patch({ category: e.target.value })}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={s.fl}>Active</label>
                  <input type="checkbox" checked={form.isActive}
                    onChange={e => patch({ isActive: e.target.checked })}
                    style={{ width: 16, height: 16, accentColor: '#4f8ef7', cursor: 'pointer', marginTop: 6 }} />
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <label style={s.fl}>Description</label>
                <textarea style={{ ...s.input, minHeight: 44, resize: 'vertical', marginTop: 4 }}
                  value={form.description} placeholder="Brief description…"
                  onChange={e => patch({ description: e.target.value })} />
              </div>
              {/* ── FloKit / PreDefinedNode eligibility ────────────────────────── */}
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={s.secTitle} >PreDefined Nodes &amp; Tier Control</div>

                  {/* allowActionNodes */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <div
                      onClick={() => patch({ allowActionNodes: !form.allowActionNodes })}
                      style={{ ...s.toggle, ...(form.allowActionNodes ? s.toggleOn : {}) }}>
                      <div style={{ ...s.toggleThumb, ...(form.allowActionNodes ? s.toggleThumbOn : {}) }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: form.allowActionNodes ? '#2ae844' : '#6b6b80', fontWeight: 500 }}>
                        Eligible for Action Nodes
                      </div>
                      <div style={{ fontSize: 10, color: '#0ecae7', marginTop: 1 }}>
                        Enables FloKit and Action Node creation for this connector
                      </div>
                    </div>
                  </label>

                  {/* tierControlled */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <div
                      onClick={() => patch({ tierControlled: !form.tierControlled })}
                      style={{ ...s.toggle, ...(form.tierControlled ? s.toggleOn : {}) }}>
                      <div style={{ ...s.toggleThumb, ...(form.tierControlled ? s.toggleThumbOn : {}) }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: form.tierControlled ? '#f0f0f4' : '#6b6b80', fontWeight: 500 }}>
                        Tier Controlled
                      </div>
                      <div style={{ fontSize: 10, color: '#0ecae7', marginTop: 1 }}>
                        Access to this connector is gated by hub tier
                      </div>
                    </div>
                  </label>

                  {/* availableForTiers — only shown when tierControlled is on */}
                  {form.tierControlled && (
                    <div style={{ marginLeft: 44 }}>
                      <div style={{ fontSize: 10, color: '#2ae844', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        Available for Tiers
                      </div>
                      {availableTiers.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#0ecae7', fontStyle: 'italic' }}>
                          No tiers found — create tiers in Tier Management first.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {availableTiers.map(t => {
                            const selected = (form.availableForTiers ?? []).includes(t.id);
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => patch({
                                  availableForTiers: selected
                                    ? (form.availableForTiers ?? []).filter(id => id !== t.id)
                                    : [...(form.availableForTiers ?? []), t.id],
                                })}
                                style={{
                                  padding: '5px 12px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                                  border: `0.5px solid ${selected ? 'rgba(79,142,247,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                  background: selected ? 'rgba(79,142,247,0.15)' : 'rgba(255,255,255,0.03)',
                                  color: selected ? '#4f8ef7' : '#6b6b80',
                                  fontFamily: 'inherit',
                                }}
                              >
                                {selected ? '✓ ' : ''}{t.tierName}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
            </div>

            {/* Supported Auth Types */}
            <div style={s.section}>
              <div style={s.secTitle}>Supported Authentication Types</div>
              {authTypes.length === 0 ? (
                <div style={s.warnBox}>No active protocols found. Run the seed script first.</div>
              ) : authTypes.map(at => {
                const enabled = form.supportedAuthTypes.includes(at.name);
                const expanded = expandedAuth === at.name;
                return (
                  <div key={at.name} style={{ ...s.authCard, ...(enabled ? s.authCardOn : {}) }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div onClick={() => toggleAuthType(at.name)} style={{ ...s.toggle, ...(enabled ? s.toggleOn : {}) }}>
                          <div style={{ ...s.toggleThumb, ...(enabled ? s.toggleThumbOn : {}) }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: enabled ? '#f0f0f4' : '#6b6b80' }}>{at.label}</div>
                          <div style={{ fontSize: 9, color: '#3a3a50', marginTop: 1 }}>{at.fields.length} fields · {at.grantType}</div>
                        </div>
                      </div>
                      {enabled && (
                        <button style={s.expandBtn}
                          onClick={() => setExpandedAuth(expanded ? null : at.name)}>
                          {expanded ? '▲ hide' : '▼ fields'}
                        </button>
                      )}
                    </div>
                    {enabled && expanded && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
                        {at.fields.map(f => (
                          <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11 }}>
                            <span style={{ color: '#c0c0cc' }}>{f.label}{f.required && <span style={{ color: '#f87171' }}> *</span>}</span>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <span style={{ fontSize: 9, color: '#45455a', fontFamily: 'monospace' }}>{f.name}</span>
                              {f.requiresMasking && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>🔒</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {form.supportedAuthTypes.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: '#6b6b80' }}>Selected:</span>
                  {form.supportedAuthTypes.map(n => {
                    const at = authTypes.find(a => a.name === n);
                    return (
                      <span key={n} style={s.selectedChip}>
                        {at?.label ?? n}
                        <span style={{ marginLeft: 5, cursor: 'pointer', opacity: 0.7 }}
                          onClick={() => toggleAuthType(n)}>×</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Auth Override ───────────────────────────────────────────────── */}
            <div style={s.section}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={s.secTitle}>
                  Auth Override
                  <span style={s.warnChip}>connector-specific</span>
                </div>
                <button
                  onClick={() => setShowOverride(v => !v)}
                  style={{ fontSize: 11, color: '#4f8ef7', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {showOverride ? '▲ Hide override' : '▼ Configure override'}
                </button>
              </div>

              {!showOverride && (
                <div style={{ fontSize: 11, color: '#6b6b80', lineHeight: 1.5 }}>
                  Configure connector-specific auth behavior — override grant type,
                  add extra credential fields (like Workday's refresh token),
                  custom body params, or non-standard token response field names.
                </div>
              )}

              {showOverride && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 4 }}>

                  {/* Notes */}
                  <div>
                    <div style={s.oLabel}>Override Notes</div>
                    <textarea style={{ ...s.oInput, minHeight: 44, resize: 'vertical' }}
                      value={override.notes ?? ''}
                      placeholder="e.g. Workday uses refresh_token grant for machine-to-machine auth. Requires refreshToken credential field."
                      onChange={e => patchOv({ notes: e.target.value })} />
                  </div>

                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={s.oLabel}>Override Grant Type</div>
                      <div style={s.oHint}>Leave blank to use the protocol's default.</div>
                      <input
                        style={s.oInput}
                        value={override.grantType ?? ''}
                        list="grantTypeList"
                        placeholder="— use protocol default —"
                        onChange={e => patchOv({ grantType: e.target.value })}
                      />
                      <datalist id="grantTypeList">
                        <option value="">— use protocol default —</option>
                        {grantTypes.map(g => <option key={g} value={g} />)}
                      </datalist>
                    </div>
                    <div style={{ flex: '0 0 180px' }}>
                      <div style={s.oLabel}>Token Request Body Format</div>
                      <div style={s.oHint}>Most connectors use form encoding.</div>
                      <select style={s.oInput} value={override.bodyFormat ?? 'form'}
                        onChange={e => patchOv({ bodyFormat: e.target.value as 'form' | 'json' })}>
                        <option value="form">form-urlencoded (default)</option>
                        <option value="json">application/json</option>
                      </select>
                    </div>
                  </div>

                  {/* Extra credential fields */}
                  <div style={s.overrideBox}>
                    <ExtraFieldsEditor
                      fields={override.extraFields ?? []}
                      onChange={v => patchOv({ extraFields: v })}
                    />
                  </div>

                  {/* Field mappings */}
                  <div style={s.overrideBox}>
                    <KVEditor
                      label="Credential Field → Token Body Param Mappings"
                      hint="Map your credential field names to the token endpoint's expected param names."
                      value={override.fieldMappings ?? {}}
                      onChange={v => patchOv({ fieldMappings: v })}
                    />
                  </div>

                  {/* Extra body params */}
                  <div style={s.overrideBox}>
                    <KVEditor
                      label="Extra Static Token Request Body Params"
                      hint="Static key/value pairs always included in the token request body."
                      value={override.extraBodyParams ?? {}}
                      onChange={v => patchOv({ extraBodyParams: v })}
                    />
                  </div>

                  {/* Token response mapping */}
                  <div style={s.overrideBox}>
                    <div style={s.oLabel}>Token Response Field Name Overrides</div>
                    <div style={s.oHint}>
                      Only fill if this connector returns non-standard field names
                      (defaults: access_token, refresh_token, expires_in).
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                      {[
                        { key: 'accessToken',  label: 'Access Token field',  ph: 'access_token' },
                        { key: 'refreshToken', label: 'Refresh Token field', ph: 'refresh_token' },
                        { key: 'expiresIn',    label: 'Expires In field',    ph: 'expires_in' },
                      ].map(({ key, label, ph }) => (
                        <div key={key} style={{ flex: 1, minWidth: 130 }}>
                          <div style={{ fontSize: 10, color: '#9090a0', marginBottom: 3 }}>{label}</div>
                          <input style={s.oInput}
                            value={(override.tokenResponseMapping as any)?.[key] ?? ''}
                            placeholder={ph}
                            onChange={e => patchTkMap({ [key]: e.target.value })} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Workday example */}
                  <div style={s.exampleBox}>
                    <strong style={{ color: '#4f8ef7' }}>Workday example setup:</strong>
                    <div style={{ marginTop: 6, lineHeight: 1.7 }}>
                      1. <strong>Override Grant Type</strong> → <code style={s.code}>refresh_token</code><br/>
                      2. <strong>Extra Credential Fields</strong> → Add field: key <code style={s.code}>refreshToken</code>, label "Refresh Token", type password, required ✓, mask ✓<br/>
                      3. <strong>Field Mappings</strong> → <code style={s.code}>refreshToken → refresh_token</code>, <code style={s.code}>clientId → client_id</code>, <code style={s.code}>clientSecret → client_secret</code><br/>
                      4. <strong>Extra Body Params</strong> → <code style={s.code}>grant_type → refresh_token</code>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Save */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={s.cancelBtn}
                onClick={() => { setSelected(null); setIsNew(false); setForm(emptyForm()); setOverride(emptyOverride()); setError(''); setSuccessMsg(''); }}>
                Cancel
              </button>
              <button onClick={handleSave} style={s.primaryBtn} disabled={saving}>
                {saving ? 'Saving…' : isNew ? 'Register Connector' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ ...s.editor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={s.empty}>Select a connector to edit, or register a new one.</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root:        { padding: '28px 32px', color: '#f0f0f4', fontFamily: "'Inter',-apple-system,sans-serif", maxWidth: 1100 },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title:       { fontSize: 20, fontWeight: 700, color: '#f0f0f4', marginBottom: 4 },
  subtitle:    { fontSize: 12, color: '#6b6b80', maxWidth: 600, lineHeight: 1.5 },
  body:        { display: 'flex', gap: 20, alignItems: 'flex-start' },
  list:        { flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: 6 },
  listItem:    { background: '#181b24', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' },
  listOn:      { background: '#1e2130', borderColor: '#4f8ef7' },
  authPill:    { display: 'inline-block', fontSize: 9, padding: '2px 6px', borderRadius: 10, background: 'rgba(79,142,247,0.1)', color: '#4f8ef7', border: '0.5px solid rgba(79,142,247,0.2)', marginRight: 4, marginTop: 3 },
  overridePill:{ display: 'block', fontSize: 9, padding: '2px 6px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', color: '#f59e0b', border: '0.5px solid rgba(245,158,11,0.15)', marginTop: 5 },
  chip:        { fontSize: 9, padding: '2px 7px', borderRadius: 20, fontWeight: 600, border: '0.5px solid transparent' },
  chipGreen:   { background: 'rgba(34,197,94,0.12)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' },
  chipRed:     { background: 'rgba(239,68,68,0.1)',  color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' },
  warnChip:    { fontSize: 9, padding: '1px 7px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '0.5px solid rgba(245,158,11,0.3)', marginLeft: 6 },
  empty:       { fontSize: 12, color: '#45455a' },
  editor:      { flex: 1, background: '#181b24', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 },
  section:     { background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '14px 16px' },
  secTitle:    { fontSize: 10, fontWeight: 700, color: '#9090a0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12, display: 'flex', alignItems: 'center' },
  fg:          { display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 160 },
  fl:          { fontSize: 10, fontWeight: 500, color: '#9090a0', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 },
  input:       { padding: '7px 10px', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.12)', background: '#0d0f17', color: '#f0f0f4', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' },
  inputDim:    { opacity: 0.5, cursor: 'not-allowed' },
  // Override section styles — higher contrast
  oLabel:      { fontSize: 11, fontWeight: 600, color: '#c0c0cc', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.3px' },
  oHint:       { fontSize: 10, color: '#6b6b80', marginBottom: 6, lineHeight: 1.5 },
  oMiniLabel:  { fontSize: 10, color: '#9090a0', marginBottom: 3 },
  oInput:      { padding: '7px 10px', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.15)', background: '#0a0c14', color: '#e0e0e8', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' },
  overrideBox: { background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 7, padding: '12px 14px' },
  extraFieldCard:{ background: '#0f1219', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '12px 14px', marginBottom: 10 },
  checkRow:    { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' },
  addLink:     { fontSize: 11, color: '#4f8ef7', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' },
  exampleBox:  { background: 'rgba(79,142,247,0.05)', border: '0.5px solid rgba(79,142,247,0.2)', borderRadius: 7, padding: '12px 14px', fontSize: 11, color: '#9090a0', lineHeight: 1.5 },
  code:        { fontFamily: 'monospace', color: '#4f8ef7', fontSize: 11 },
  authCard:    { border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.01)', marginBottom: 8 },
  authCardOn:  { borderColor: 'rgba(79,142,247,0.4)', background: 'rgba(79,142,247,0.04)' },
  toggle:      { width: 34, height: 18, borderRadius: 9, background: 'rgba(255,255,255,0.08)', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.15s' },
  toggleOn:    { background: '#4f8ef7' },
  toggleThumb: { position: 'absolute', top: 3, left: 3, width: 12, height: 12, borderRadius: '50%', background: 'rgba(255,255,255,0.4)', transition: 'left 0.15s' },
  toggleThumbOn:{ left: 19, background: '#fff' },
  expandBtn:   { fontSize: 10, color: '#4f8ef7', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' },
  selectedChip:{ padding: '3px 10px', borderRadius: 12, background: 'rgba(79,142,247,0.12)', color: '#4f8ef7', border: '0.5px solid rgba(79,142,247,0.3)', fontSize: 11 },
  warnBox:     { padding: '10px 12px', borderRadius: 6, background: 'rgba(245,158,11,0.08)', border: '0.5px solid rgba(245,158,11,0.25)', color: '#f59e0b', fontSize: 12 },
  primaryBtn:  { padding: '8px 18px', borderRadius: 7, border: 'none', background: '#4f8ef7', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  cancelBtn:   { padding: '8px 18px', borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#9090a0', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  errBanner:   { padding: '10px 14px', borderRadius: 7, marginBottom: 14, background: 'rgba(220,38,38,0.1)', border: '0.5px solid rgba(220,38,38,0.25)', color: '#f87171', fontSize: 12 },
  okBanner:    { padding: '10px 14px', borderRadius: 7, marginBottom: 14, background: 'rgba(34,197,94,0.08)', border: '0.5px solid rgba(34,197,94,0.25)', color: '#22c55e', fontSize: 12 },
};

export default ConnectorManagement;
