/**
 * HubManagement.tsx
 *
 * Two panels:
 *   LEFT  — list of all existing hubs (loaded from FloPlugHubs)
 *   RIGHT — branding editor for selected hub (displayTitle, logo, accentColor only)
 *           OR the provision-new-hub form
 *
 * Editable fields: displayTitle, logoBase64, accentColor only.
 * Immutable fields: hubName, hubSlug, tierId, contactEmailId, authMethod.
 * Reason: slug is used as a URL path; tier changes require provisioning logic;
 *         contactEmail changes require auth updates — none are safe to edit here.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable }  from 'firebase/functions';
import { db }                           from '../firebaseConfig';
import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import type { HubDoc, HubBranding }     from '@floplug/shared';
import {COLLECTIONS,HUB_COLLECTIONS} from '@floplug/shared';
const ACCENT_PRESETS = [
  '#4f8ef7','#cc0000','#0066cc','#16a34a',
  '#d97706','#7c3aed','#0f766e','#db2777',
];

const TIER_LABELS: Record<string, string> = {
  gold_tier:   'Gold — Premium',
  silver_tier: 'Silver — Standard',
  bronze_tier: 'Bronze — Basic',
};

// ═════════════════════════════════════════════════════════════════════════════
// BrandingEditor — edit displayTitle / logo / accentColor for an existing hub
// ═════════════════════════════════════════════════════════════════════════════
interface BrandingEditorProps {
  hub:      HubDoc;
  onSaved:  (updated: HubDoc) => void;
}

const BrandingEditor: React.FC<BrandingEditorProps> = ({ hub, onSaved }) => {
  const [displayTitle, setDisplayTitle] = useState(hub.branding?.displayTitle ?? hub.hubName);
  const [accentColor,  setAccentColor]  = useState(hub.branding?.accentColor  ?? '#4f8ef7');
  const [logoBase64,   setLogoBase64]   = useState(hub.branding?.logoBase64   ?? '');
  const [logoFileName, setLogoFileName] = useState('');
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset when hub changes
  useEffect(() => {
    setDisplayTitle(hub.branding?.displayTitle ?? hub.hubName);
    setAccentColor(hub.branding?.accentColor   ?? '#4f8ef7');
    setLogoBase64(hub.branding?.logoBase64     ?? '');
    setLogoFileName('');
    setError(''); setSuccess('');
  }, [hub.id]);

  const handleLogoUpload = (file: File) => {
    if (file.size > 256 * 1024) { setError('Logo must be under 256 KB.'); return; }
    const allowed = ['image/png','image/svg+xml','image/jpeg','image/webp'];
    if (!allowed.includes(file.type)) { setError('Only PNG, SVG, JPG or WebP.'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      setLogoBase64(e.target?.result as string);
      setLogoFileName(file.name);
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const branding: HubBranding = {
        displayTitle: displayTitle.trim() || hub.hubName,
        accentColor:  accentColor,
        logoBase64:   logoBase64 || undefined,
      };

      // Update each tenant's branding sub-document
      const tenantsSnap = await getDocs(
        collection(db, 'FloPlugHubs', hub.id, 'Tenants'),
      );

      const updates = tenantsSnap.docs.map(tenantDoc =>
        updateDoc(doc(db, COLLECTIONS.HUBS, hub.id, HUB_COLLECTIONS.TENANTS, tenantDoc.id), {
          'branding.displayTitle': branding.displayTitle,
          'branding.accentColor':  branding.accentColor,
          ...(branding.logoBase64 ? { 'branding.logoBase64': branding.logoBase64 } : {}),
          updatedAt: serverTimestamp(),
        }),
      );

      await Promise.all(updates);
      setSuccess('Branding updated across all tenants.');
      onSaved({ ...hub, branding });
    } catch (e: any) {
      setError(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.brandingPanel}>
      {/* Hub info — read-only */}
      <div style={s.section}>
        <div style={s.secTitle}>Hub Details <span style={s.immutableBadge}>read-only</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'Hub Name',      value: hub.hubName },
            { label: 'Slug',          value: hub.hubSlug },
            { label: 'Tier',          value: TIER_LABELS[hub.tierId] ?? hub.tierId },
            { label: 'Contact Email', value: hub.contactEmailId },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={s.roLabel}>{label}</div>
              <div style={s.roValue}>{value ?? '—'}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 10, color: '#3a3a50', lineHeight: 1.5 }}>
          Slug, tier, and contact email cannot be changed here — they require re-provisioning.
          Contact engineering if these need to change.
        </div>
      </div>

      {/* Branding — editable */}
      <div style={s.section}>
        <div style={s.secTitle}>Branding</div>

        {error   && <div style={s.errBanner}>{error}</div>}
        {success && <div style={s.okBanner}>{success}</div>}

        {/* Display title */}
        <div style={s.fg}>
          <label style={s.fl}>Display Title (shown to end users)</label>
          <input style={s.input} value={displayTitle}
            placeholder={hub.hubName}
            onChange={e => setDisplayTitle(e.target.value)} />
        </div>

        {/* Accent color */}
        <div style={{ ...s.fg, marginTop: 12 }}>
          <label style={s.fl}>Accent Color</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="color" value={accentColor}
              onChange={e => setAccentColor(e.target.value)}
              style={{ width: 36, height: 36, borderRadius: 6, border: 'none', cursor: 'pointer', padding: 0, background: 'none' }} />
            <input style={{ ...s.input, fontFamily: 'monospace', width: 120 }}
              value={accentColor}
              onChange={e => setAccentColor(e.target.value)} />
            {/* Preview swatch */}
            <div style={{ width: 28, height: 28, borderRadius: 6, background: accentColor, flexShrink: 0 }} />
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {ACCENT_PRESETS.map(c => (
              <button key={c} type="button"
                onClick={() => setAccentColor(c)}
                style={{ width: 22, height: 22, borderRadius: 4, background: c, border: accentColor === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer', padding: 0 }}
                title={c} />
            ))}
          </div>
        </div>

        {/* Logo */}
        <div style={{ ...s.fg, marginTop: 12 }}>
          <label style={s.fl}>Hub Logo (PNG / SVG · max 256 KB)</label>
          <div
            onClick={() => fileRef.current?.click()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleLogoUpload(f); }}
            onDragOver={e => e.preventDefault()}
            style={s.uploadZone}
          >
            <input ref={fileRef} type="file"
              accept="image/png,image/svg+xml,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }} />

            {logoBase64 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src={logoBase64} alt="logo" style={{ height: 36, maxWidth: 120, objectFit: 'contain', borderRadius: 4 }} />
                <div>
                  <div style={{ fontSize: 12, color: '#c0c0cc' }}>{logoFileName || 'Current logo'}</div>
                  <div style={{ fontSize: 10, color: '#45455a' }}>~{Math.round(logoBase64.length / 1024)} KB · click to replace</div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#45455a' }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>📁</div>
                <div style={{ fontSize: 12 }}>Drop logo here or click to browse</div>
                <div style={{ fontSize: 10, marginTop: 2 }}>PNG, SVG, JPG · max 256 KB</div>
              </div>
            )}
          </div>
          {logoBase64 && (
            <button onClick={() => { setLogoBase64(''); setLogoFileName(''); }}
              style={{ ...s.cancelBtn, fontSize: 11, padding: '4px 10px', marginTop: 6, alignSelf: 'flex-start' }}>
              Remove logo
            </button>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={handleSave} style={s.primaryBtn} disabled={saving}>
            {saving ? 'Saving…' : 'Update Branding'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// ProvisionForm — provision a new hub (existing form, cleaned up)
// ═════════════════════════════════════════════════════════════════════════════
interface ProvisionFormProps {
  onProvisioned: (hub: HubDoc) => void;
}

const ProvisionForm: React.FC<ProvisionFormProps> = ({ onProvisioned }) => {
  const [form, setForm] = useState({
    name: '', slug: '', tier: 'gold_tier',
    authMethod: 'usernameCredentials', contactEmailId: '',
  });
  const [branding, setBranding] = useState({
    displayTitle: '', logoBase64: '', logoFileName: '', accentColor: '',
  });
  const [logoPreview, setLogoPreview] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [status,      setStatus]      = useState<{ type: string; msg: string }>({ type: '', msg: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  const handleNameChange = (val: string) => {
    const slug = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setForm(p => ({ ...p, name: val, slug }));
  };

  const handleLogoUpload = (file: File) => {
    if (file.size > 256 * 1024) { setStatus({ type: 'error', msg: 'Logo must be under 256 KB.' }); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const b64 = e.target?.result as string;
      setBranding(p => ({ ...p, logoBase64: b64, logoFileName: file.name }));
      setLogoPreview(b64);
      setStatus({ type: '', msg: '' });
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.slug) { setStatus({ type: 'error', msg: 'Hub name and slug are required.' }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmailId)) {
      setStatus({ type: 'error', msg: 'Valid email required.' }); return;
    }
    setLoading(true);
    setStatus({ type: 'info', msg: 'Provisioning…' });
    try {
      const fn = httpsCallable(getFunctions(), 'energizeHub');
      const result: any = await fn({
        hubName: form.name, hubSlug: form.slug,
        tierId: form.tier, authMethod: form.authMethod,
        contactEmailId: form.contactEmailId,
        branding: {
          displayTitle: branding.displayTitle || form.name,
          logoBase64:   branding.logoBase64   || null,
          accentColor:  branding.accentColor  || null,
        },
      });
      setStatus({ type: 'success', msg: `Hub "${form.name}" provisioned! ID: ${result.data?.hubId ?? 'N/A'}` });
      onProvisioned({
        id: result.data?.hubId ?? '',
        hubName: form.name, hubSlug: form.slug,
        tierId: form.tier, contactEmailId: form.contactEmailId,
        isActive: true,
        branding: {
          displayTitle: branding.displayTitle || form.name,
          accentColor: branding.accentColor || undefined,
          logoBase64:  branding.logoBase64   || undefined,
        },
      });
      setForm({ name: '', slug: '', tier: 'gold_tier', authMethod: 'usernameCredentials', contactEmailId: '' });
      setBranding({ displayTitle: '', logoBase64: '', logoFileName: '', accentColor: '' });
      setLogoPreview('');
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.message ?? 'Unknown error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.section}>
      <div style={s.secTitle}>Provision New Hub</div>
      <div style={{ fontSize: 11, color: '#6b6b80', marginBottom: 16, lineHeight: 1.5 }}>
        Creates the hub, DEV/PROD tenants, and default workspace in one operation.
      </div>

      {status.msg && (
        <div style={status.type === 'error' ? s.errBanner : status.type === 'success' ? s.okBanner : s.infoBanner}>
          {status.msg}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          <div style={s.fg}>
            <label style={s.fl}>Hub Name *</label>
            <input style={s.input} value={form.name} placeholder="e.g. Tesla Motors"
              onChange={e => handleNameChange(e.target.value)} required />
          </div>

          <div style={s.fg}>
            <label style={s.fl}>Slug * (auto-generated)</label>
            <input style={{ ...s.input, fontFamily: 'monospace' }}
              value={form.slug} placeholder="tesla"
              onChange={e => setForm(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
              required />
          </div>

          <div style={s.fg}>
            <label style={s.fl}>Contact Email *</label>
            <input style={s.input} type="email" value={form.contactEmailId}
              placeholder="admin@company.com" required
              onChange={e => setForm(p => ({ ...p, contactEmailId: e.target.value.toLowerCase() }))} />
          </div>

          <div style={s.fg}>
            <label style={s.fl}>Tier</label>
            <select style={s.input} value={form.tier}
              onChange={e => setForm(p => ({ ...p, tier: e.target.value }))}>
              <option value="gold_tier">Gold — Premium</option>
              <option value="silver_tier">Silver — Standard</option>
              <option value="bronze_tier">Bronze — Basic</option>
            </select>
          </div>

          <div style={{ ...s.fg, gridColumn: '1/-1' }}>
            <label style={s.fl}>Display Title <span style={{ color: '#45455a', textTransform: 'none' }}>(optional)</span></label>
            <input style={s.input} value={branding.displayTitle}
              placeholder={form.name || 'e.g. Tesla Integration Hub'}
              onChange={e => setBranding(p => ({ ...p, displayTitle: e.target.value }))} />
          </div>

          <div style={{ ...s.fg, gridColumn: '1/-1' }}>
            <label style={s.fl}>Accent Color</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="color" value={branding.accentColor || '#4f8ef7'}
                onChange={e => setBranding(p => ({ ...p, accentColor: e.target.value }))}
                style={{ width: 32, height: 32, border: 'none', borderRadius: 5, cursor: 'pointer' }} />
              {ACCENT_PRESETS.map(c => (
                <button key={c} type="button" onClick={() => setBranding(p => ({ ...p, accentColor: c }))}
                  style={{ width: 22, height: 22, borderRadius: 4, background: c, border: branding.accentColor === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button type="button" style={s.cancelBtn}
            onClick={() => {
              setForm({ name: '', slug: '', tier: 'gold_tier', authMethod: 'usernameCredentials', contactEmailId: '' });
              setBranding({ displayTitle: '', logoBase64: '', logoFileName: '', accentColor: '' });
              setLogoPreview(''); setStatus({ type: '', msg: '' });
            }}>Clear</button>
          <button type="submit" style={s.primaryBtn} disabled={loading}>
            {loading ? 'Provisioning…' : '⚡ Energize Hub'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// HubManagement — main component
// ═════════════════════════════════════════════════════════════════════════════
const HubManagement: React.FC = () => {
  const [hubs,      setHubs]      = useState<HubDoc[]>([]);
  const [selected,  setSelected]  = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [showNew,   setShowNew]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.HUBS));
      const loaded = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as HubDoc))
        .sort((a, b) => a.hubName.localeCompare(b.hubName));
      setHubs(loaded);
    } catch (e: any) {
      console.error('[HubMgmt] Load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedHub = hubs.find(h => h.id === selected) ?? null;

  const handleSaved = (updated: HubDoc) =>
    setHubs(prev => prev.map(h => h.id === updated.id ? updated : h));

  const handleProvisioned = (newHub: HubDoc) => {
    setHubs(prev => [...prev, newHub].sort((a, b) => a.hubName.localeCompare(b.hubName)));
    setShowNew(false);
    setSelected(newHub.id);
  };

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div>
          <div style={s.title}>Hub Management</div>
          <div style={s.subtitle}>
            View existing hubs and update their branding. Provision new hubs below.
            Immutable fields (slug, tier, email) require re-provisioning to change.
          </div>
        </div>
        <button onClick={() => { setShowNew(v => !v); setSelected(null); }} style={s.primaryBtn}>
          {showNew ? '← Cancel' : '+ New Hub'}
        </button>
      </div>

      <div style={s.body}>

        {/* ── Left: hub list ──────────────────────────────────────────────────── */}
        <div style={s.list}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            Existing Hubs
          </div>

          {loading ? (
            <div style={s.empty}>Loading…</div>
          ) : hubs.length === 0 ? (
            <div style={s.empty}>No hubs yet. Provision one →</div>
          ) : hubs.map(h => (
            <div key={h.id}
              onClick={() => { setSelected(h.id); setShowNew(false); }}
              style={{ ...s.listItem, ...(selected === h.id && !showNew ? s.listOn : {}) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#f0f0f4' }}>{h.hubName}</span>
                <span style={{ ...s.chip, ...(h.isActive !== false ? s.chipGreen : s.chipRed) }}>
                  {h.isActive !== false ? 'Active' : 'Off'}
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#45455a', marginBottom: 4 }}>
                {h.hubSlug} · {TIER_LABELS[h.tierId] ?? h.tierId}
              </div>
              {h.branding?.accentColor && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: h.branding.accentColor }} />
                  <span style={{ fontSize: 9, color: '#45455a', fontFamily: 'monospace' }}>{h.branding.accentColor}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Right: editor or provision form ────────────────────────────────── */}
        <div style={{ flex: 1 }}>
          {showNew ? (
            <ProvisionForm onProvisioned={handleProvisioned} />
          ) : selectedHub ? (
            <BrandingEditor hub={selectedHub} onSaved={handleSaved} />
          ) : (
            <div style={{ ...s.section, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
              <div style={s.empty}>Select a hub to edit its branding, or provision a new one.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root:         { padding: '28px 32px', color: '#f0f0f4', fontFamily: "'Inter',-apple-system,sans-serif", maxWidth: 1100 },
  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title:        { fontSize: 20, fontWeight: 700, color: '#f0f0f4', marginBottom: 4 },
  subtitle:     { fontSize: 12, color: '#6b6b80', maxWidth: 580, lineHeight: 1.5 },
  body:         { display: 'flex', gap: 20, alignItems: 'flex-start' },
  list:         { flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: 6 },
  listItem:     { background: '#181b24', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 12px', cursor: 'pointer' },
  listOn:       { background: '#1e2130', borderColor: '#4f8ef7' },
  chip:         { fontSize: 9, padding: '2px 7px', borderRadius: 20, fontWeight: 600, border: '0.5px solid transparent' },
  chipGreen:    { background: 'rgba(34,197,94,0.12)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' },
  chipRed:      { background: 'rgba(239,68,68,0.1)',  color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' },
  empty:        { fontSize: 12, color: '#45455a', lineHeight: 1.5 },
  section:      { background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '16px 18px', marginBottom: 16 },
  secTitle:     { fontSize: 10, fontWeight: 700, color: '#9090a0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 },
  immutableBadge:{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: '#45455a', border: '0.5px solid rgba(255,255,255,0.06)' },
  brandingPanel:{ display: 'flex', flexDirection: 'column', gap: 0 },
  roLabel:      { fontSize: 10, color: '#6b6b80', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 },
  roValue:      { fontSize: 13, color: '#c0c0cc', fontFamily: 'inherit' },
  fg:           { display: 'flex', flexDirection: 'column', gap: 5 },
  fl:           { fontSize: 10, fontWeight: 500, color: '#9090a0', textTransform: 'uppercase', letterSpacing: '0.4px' },
  input:        { padding: '8px 10px', borderRadius: 6, border: '0.5px solid rgba(255,255,255,0.12)', background: '#0d0f17', color: '#f0f0f4', fontSize: 12, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' },
  uploadZone:   { border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 8, padding: '20px', cursor: 'pointer', background: 'rgba(255,255,255,0.01)', minHeight: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryBtn:   { padding: '8px 18px', borderRadius: 7, border: 'none', background: '#4f8ef7', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  cancelBtn:    { padding: '8px 18px', borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#9090a0', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  errBanner:    { padding: '10px 14px', borderRadius: 7, marginBottom: 14, background: 'rgba(220,38,38,0.1)', border: '0.5px solid rgba(220,38,38,0.25)', color: '#f87171', fontSize: 12 },
  okBanner:     { padding: '10px 14px', borderRadius: 7, marginBottom: 14, background: 'rgba(34,197,94,0.08)', border: '0.5px solid rgba(34,197,94,0.25)', color: '#22c55e', fontSize: 12 },
  infoBanner:   { padding: '10px 14px', borderRadius: 7, marginBottom: 14, background: 'rgba(79,142,247,0.08)', border: '0.5px solid rgba(79,142,247,0.2)', color: '#4f8ef7', fontSize: 12 },
};

export default HubManagement;
