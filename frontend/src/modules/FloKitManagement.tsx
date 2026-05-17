/**
 * FloKitManagement.tsx
 *
 * Product Admin screen — manage FloKits per connector.
 * FloKits are first-class entities that group PreDefinedNodes by business domain.
 *
 * Firestore paths:
 *   FloPlugConnectors/{connectorId}/FloKits/{floKitId}
 *
 * Fields:
 *   floKitId:          auto-slugged from name (immutable after create)
 *   name:              display name (editable)
 *   description:       optional
 *   connectorId:       parent connector
 *   availableForTiers: string[] of tier IDs
 *   isActive:          boolean
 *   createdAt:         timestamp
 */

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import {
  collection, doc, getDocs, setDoc,
  serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import type { ConnectorDoc,FloKitDoc} from '@floplug/shared';
import { loadConnectors } from '../types/AuthConnectorTypes';
import {COLLECTIONS,SUB_COLLECTIONS} from '@floplug/shared';


// ── Types ─────────────────────────────────────────────────────────────────────



// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

const emptyKit = (connectorId: string): FloKitDoc => ({
  id: '', name: '', description: '',
  connectorId, availableForTiers: [], isActive: true,
});

// ═════════════════════════════════════════════════════════════════════════════
// FloKitManagement
// ═════════════════════════════════════════════════════════════════════════════

const FloKitManagement: React.FC = () => {
  const [connectors,    setConnectors]    = useState<ConnectorDoc[]>([]);
  const [selectedConn,  setSelectedConn]  = useState<string | null>(null);
  const [floKits,       setFloKits]       = useState<FloKitDoc[]>([]);
  const [selectedKit,   setSelectedKit]   = useState<FloKitDoc | null>(null);
  const [form,          setForm]          = useState<FloKitDoc>(emptyKit(''));
  const [isNew,         setIsNew]         = useState(false);
  const [availableTiers,setAvailableTiers]= useState<{ id: string; tierName: string }[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');
  const [successMsg,    setSuccessMsg]    = useState('');

  const flash = (msg: string, isErr = false) => {
    if (isErr) { setError(msg); setTimeout(() => setError(''), 4000); }
    else { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); }
  };

  const patch = (p: Partial<FloKitDoc>) => setForm(f => ({ ...f, ...p }));

  // ── Load connectors + tiers ─────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const [conns, tierSnap] = await Promise.all([
          loadConnectors(),
          getDocs(collection(db, COLLECTIONS.FLOPLUGTIERS)),
        ]);
        // Only show connectors eligible for PreDefined Nodes
        setConnectors(conns.filter(c => c.allowActionNodes));
        setAvailableTiers(tierSnap.docs.map(d => ({
          id:       d.id,
          tierName: (d.data().tierName as string) ?? d.id,
        })));
      } catch (e: any) { flash(e.message, true); }
      finally { setLoading(false); }
    };
    init();
  }, []);

  // ── Load FloKits for selected connector ─────────────────────────────────────
  const loadFloKits = useCallback(async (connId: string) => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, COLLECTIONS.FLOPLUGCONNECTORS, connId, SUB_COLLECTIONS.FLOKITS), orderBy('name'))
      );
      setFloKits(snap.docs.map(d => ({ id: d.id, ...d.data() } as FloKitDoc)));
    } catch (e: any) { flash(e.message, true); }
    finally { setLoading(false); }
  }, []);

  const handleSelectConnector = (connId: string) => {
    setSelectedConn(connId);
    setSelectedKit(null);
    setIsNew(false);
    setForm(emptyKit(connId));
    loadFloKits(connId);
  };

  const handleSelectKit = (kit: FloKitDoc) => {
    setSelectedKit(kit);
    setForm({ ...kit });
    setIsNew(false);
    setError(''); setSuccessMsg('');
  };

  const handleNew = () => {
    if (!selectedConn) return;
    setSelectedKit(null);
    setForm(emptyKit(selectedConn));
    setIsNew(true);
    setError(''); setSuccessMsg('');
  };

  // ── Auto-slug name → id for new kits ───────────────────────────────────────
  const handleNameChange = (name: string) => {
    patch({ name, ...(isNew ? { id: slugify(name) } : {}) });
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim())       { flash('Name is required', true); return; }
    if (!form.id.trim())         { flash('ID is required', true); return; }
    if (!selectedConn)           { flash('Select a connector first', true); return; }

    if (isNew && floKits.find(k => k.id === form.id)) {
      flash(`FloKit ID '${form.id}' already exists for this connector`, true);
      return;
    }

    setSaving(true);
    try {
      const ref = doc(db, COLLECTIONS.FLOPLUGCONNECTORS, selectedConn, SUB_COLLECTIONS.FLOKITS, form.id);
      const payload: FloKitDoc = {
        ...form,
        connectorId: selectedConn,
        updatedAt:   serverTimestamp() as any,
        ...( isNew ? { createdAt: serverTimestamp() as any } : {} ),
      };
      await setDoc(ref, payload, { merge: true });

      const saved = { ...payload, id: form.id };
      setFloKits(prev => {
        const idx = prev.findIndex(k => k.id === form.id);
        return idx >= 0
          ? prev.map(k => k.id === form.id ? saved : k)
          : [...prev, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
      setSelectedKit(saved);
      setIsNew(false);
      flash(`FloKit '${form.name}' saved ✓`);
    } catch (e: any) { flash(e.message, true); }
    finally { setSaving(false); }
  };

  const conn = connectors.find(c => c.id === selectedConn);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={s.root}>
      <div style={s.header}>
        <div>
          <div style={s.title}>FloKit Management</div>
          <div style={s.subtitle}>
            Define FloKits — business-domain groupings of PreDefined Nodes per connector.
            Only connectors marked <em>Eligible for PreDefined Nodes</em> appear here.
          </div>
        </div>
      </div>

      {error      && <div style={s.errBanner}>{error}</div>}
      {successMsg && <div style={s.okBanner}>{successMsg}</div>}

      <div style={s.body}>

        {/* ── Connector list ──────────────────────────────────────────────── */}
        <div style={s.connList}>
          <div style={s.colHeader}>Connectors</div>
          {loading && !selectedConn ? (
            <div style={s.empty}>Loading…</div>
          ) : connectors.length === 0 ? (
            <div style={s.empty}>
              No connectors eligible for PreDefined Nodes.
              Enable the flag in Connector Management first.
            </div>
          ) : connectors.map(c => (
            <div key={c.id} onClick={() => handleSelectConnector(c.id)}
              style={{ ...s.listItem, ...(selectedConn === c.id ? s.listOn : {}) }}>
              <div style={s.listName}>{c.label}</div>
              <div style={s.listMeta}>{c.category}</div>
            </div>
          ))}
        </div>

        {/* ── FloKit list ─────────────────────────────────────────────────── */}
        {selectedConn && (
          <div style={s.kitList}>
            <div style={{ ...s.colHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>FloKits — {conn?.label}</span>
              <button onClick={handleNew} style={s.addBtn}>+ New</button>
            </div>
            {floKits.length === 0 ? (
              <div style={s.empty}>No FloKits yet — create one.</div>
            ) : floKits.map(k => (
              <div key={k.id} onClick={() => handleSelectKit(k)}
                style={{ ...s.listItem, ...(selectedKit?.id === k.id && !isNew ? s.listOn : {}) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={s.listName}>{k.name}</span>
                  <span style={{ ...s.chip, ...(k.isActive ? s.chipGreen : s.chipRed) }}>
                    {k.isActive ? 'Active' : 'Off'}
                  </span>
                </div>
                <div style={s.listMeta}>{k.id}</div>
                {k.availableForTiers.length > 0 && (
                  <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                    {k.availableForTiers.map(tid => (
                      <span key={tid} style={s.tierPill}>
                        {availableTiers.find(t => t.id === tid)?.tierName ?? tid}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── FloKit editor ───────────────────────────────────────────────── */}
        {(isNew || selectedKit) && selectedConn ? (
          <div style={s.editor}>

            {/* Identity */}
            <div style={s.section}>
              <div style={s.secTitle}>{isNew ? 'New FloKit' : `Editing: ${form.name}`}</div>

              <div style={{ marginBottom: 12 }}>
                <label style={s.fl}>Display Name *</label>
                <input style={s.input} value={form.name}
                  placeholder="e.g. Workday Financials"
                  onChange={e => handleNameChange(e.target.value)} />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={s.fl}>
                  FloKit ID *
                  {isNew && <span style={{ color: '#45455a', marginLeft: 6, fontSize: 10 }}>
                    auto-generated · immutable after create
                  </span>}
                </label>
                <input
                  style={{ ...s.input, ...(isNew ? {} : s.inputDim) }}
                  value={form.id}
                  disabled={!isNew}
                  placeholder="workday_financials"
                  onChange={e => isNew && patch({ id: slugify(e.target.value) })}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={s.fl}>Description</label>
                <textarea style={{ ...s.input, minHeight: 52, resize: 'vertical' as const }}
                  value={form.description}
                  placeholder="What business domain does this FloKit cover?"
                  onChange={e => patch({ description: e.target.value })} />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.isActive}
                  onChange={e => patch({ isActive: e.target.checked })}
                  style={{ width: 14, height: 14, accentColor: '#4f8ef7', cursor: 'pointer' }} />
                <span style={{ fontSize: 12, color: '#9090a0' }}>Active</span>
              </label>
            </div>

            {/* Tier availability */}
            <div style={s.section}>
              <div style={s.secTitle}>Available for Tiers</div>
              <div style={{ fontSize: 11, color: '#45455a', marginBottom: 10 }}>
                Which hub tiers can access this FloKit. Leave empty for all tiers.
              </div>
              {availableTiers.length === 0 ? (
                <div style={{ fontSize: 11, color: '#45455a', fontStyle: 'italic' }}>
                  No tiers found — create tiers in Tier Management first.
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  {availableTiers.map(t => {
                    const sel = form.availableForTiers.includes(t.id);
                    return (
                      <button key={t.id} type="button"
                        onClick={() => patch({
                          availableForTiers: sel
                            ? form.availableForTiers.filter(id => id !== t.id)
                            : [...form.availableForTiers, t.id],
                        })}
                        style={{
                          padding: '5px 14px', borderRadius: 20, fontSize: 11,
                          cursor: 'pointer', fontFamily: 'inherit',
                          border: `0.5px solid ${sel ? 'rgba(79,142,247,0.5)' : 'rgba(255,255,255,0.1)'}`,
                          background: sel ? 'rgba(79,142,247,0.15)' : 'rgba(255,255,255,0.03)',
                          color: sel ? '#4f8ef7' : '#6b6b80',
                        }}>
                        {sel ? '✓ ' : ''}{t.tierName}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={s.cancelBtn}
                onClick={() => { setIsNew(false); setSelectedKit(null); setForm(emptyKit(selectedConn)); }}>
                Cancel
              </button>
              <button style={s.primaryBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : isNew ? 'Create FloKit' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : selectedConn ? (
          <div style={{ ...s.editor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={s.empty}>Select a FloKit to edit or create a new one.</div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root:      { padding: '28px 32px', color: '#f0f0f4', fontFamily: "'Inter',-apple-system,sans-serif", maxWidth: 1200 },
  header:    { marginBottom: 24 },
  title:     { fontSize: 20, fontWeight: 700, color: '#f0f0f4', marginBottom: 4 },
  subtitle:  { fontSize: 12, color: '#6b6b80', maxWidth: 640, lineHeight: 1.6 },
  body:      { display: 'flex', gap: 16, alignItems: 'flex-start' },
  connList:  { flex: '0 0 200px', display: 'flex', flexDirection: 'column', gap: 4 },
  kitList:   { flex: '0 0 220px', display: 'flex', flexDirection: 'column', gap: 4 },
  editor:    { flex: 1, background: '#181b24', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 },
  colHeader: { fontSize: 10, fontWeight: 700, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6, padding: '0 2px' },
  listItem:  { background: '#181b24', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' },
  listOn:    { background: '#1e2130', borderColor: 'rgba(79,142,247,0.3)' },
  listName:  { fontSize: 12, fontWeight: 600, color: '#f0f0f4' },
  listMeta:  { fontSize: 10, color: '#45455a', marginTop: 2, fontFamily: 'monospace' },
  section:   { background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '14px 16px' },
  secTitle:  { fontSize: 10, fontWeight: 700, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 },
  fl:        { fontSize: 10, color: '#6b6b80', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4, display: 'block' },
  input:     { padding: '8px 10px', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.1)', background: '#0f1117', color: '#f0f0f4', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' },
  inputDim:  { opacity: 0.5, cursor: 'not-allowed' },
  empty:     { fontSize: 12, color: '#45455a', lineHeight: 1.6, padding: '8px 4px' },
  chip:      { fontSize: 9, padding: '2px 7px', borderRadius: 20, fontWeight: 600, border: '0.5px solid transparent' },
  chipGreen: { background: 'rgba(34,197,94,0.12)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' },
  chipRed:   { background: 'rgba(239,68,68,0.1)',  color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' },
  tierPill:  { fontSize: 9, padding: '1px 7px', borderRadius: 10, background: 'rgba(79,142,247,0.1)', color: '#4f8ef7', border: '0.5px solid rgba(79,142,247,0.2)' },
  addBtn:    { padding: '3px 10px', borderRadius: 5, border: '0.5px solid rgba(79,142,247,0.3)', background: 'rgba(79,142,247,0.1)', color: '#4f8ef7', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
  primaryBtn:{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#4f8ef7', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  cancelBtn: { padding: '8px 18px', borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#6b6b80', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  errBanner: { padding: '10px 14px', borderRadius: 7, marginBottom: 14, background: 'rgba(220,38,38,0.1)', border: '0.5px solid rgba(220,38,38,0.25)', color: '#f87171', fontSize: 12 },
  okBanner:  { padding: '10px 14px', borderRadius: 7, marginBottom: 14, background: 'rgba(34,197,94,0.08)', border: '0.5px solid rgba(34,197,94,0.25)', color: '#22c55e', fontSize: 12 },
};

export default FloKitManagement;