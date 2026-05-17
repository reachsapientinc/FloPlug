/**
 * Hub Management — list hubs, edit existing, or provision new.
 * Immutable after create: hubSlug, tierId.
 */
import React, { useState, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { HubDoc } from '@floplug/shared';
import { COLLECTIONS } from '@floplug/shared';
import HubEditor from './HubEditor';
import ProvisionHubForm from './ProvisionHubForm';
import { hubMgmtStyles as s, TIER_LABELS } from './hubManagementStyles';

const HubManagement: React.FC = () => {
  const [hubs, setHubs] = useState<HubDoc[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.HUBS));
      const loaded = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as HubDoc))
        .sort((a, b) => a.hubName.localeCompare(b.hubName));
      setHubs(loaded);
    } catch (e: unknown) {
      console.error('[HubMgmt] Load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

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
            Edit hub details, branding, and entitlements. Slug and tier cannot be changed after provisioning.
          </div>
        </div>
        <button type="button" onClick={() => { setShowNew(v => !v); setSelected(null); }} style={s.primaryBtn}>
          {showNew ? '← Cancel' : '+ New Hub'}
        </button>
      </div>

      <div style={s.body}>
        <div style={s.list}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6b6b80', textTransform: 'uppercase', marginBottom: 8 }}>
            Existing Hubs
          </div>
          {loading ? (
            <div style={s.empty}>Loading…</div>
          ) : hubs.length === 0 ? (
            <div style={s.empty}>No hubs yet.</div>
          ) : hubs.map(h => (
            <div
              key={h.id}
              role="button"
              tabIndex={0}
              onClick={() => { setSelected(h.id); setShowNew(false); }}
              onKeyDown={e => { if (e.key === 'Enter') { setSelected(h.id); setShowNew(false); } }}
              style={{ ...s.listItem, ...(selected === h.id && !showNew ? s.listOn : {}) }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#f0f0f4' }}>{h.hubName}</span>
                <span style={{ ...s.chip, ...(h.isActive !== false ? s.chipGreen : s.chipRed) }}>
                  {h.isActive !== false ? 'Active' : 'Off'}
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#45455a' }}>
                {h.hubSlug} · {TIER_LABELS[h.tierId] ?? h.tierId}
                {h.entitlements?.floKits?.length != null && ` · ${h.entitlements.floKits.length} kits`}
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }}>
          {showNew ? (
            <ProvisionHubForm onProvisioned={handleProvisioned} />
          ) : selectedHub ? (
            <HubEditor hub={selectedHub} onSaved={handleSaved} />
          ) : (
            <div style={{ ...s.section, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
              <div style={s.empty}>Select a hub to edit, or provision a new one.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HubManagement;
