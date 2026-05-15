import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { doc, setDoc, getDoc, getDocs, collection, query, where, serverTimestamp } from 'firebase/firestore';

const TierManagement: React.FC = () => {
  const [availableTiers, setAvailableTiers] = useState<any[]>([]);
  const [availableTenantTypes, setAvailableTenantTypes] = useState<{key: string, value: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false); // Tracks if form has changed

  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info' | ''; message: string }>({
    type: '',
    message: '',
  });

  const INITIAL_STATE = {
    tierName: '',
    tierShortCode: '',
    eligibleTenantTypes: [] as string[],
    costModel: { basePrice: 0, markUpPrice: 0, pricePerFlow: 0, pricePerWorkspace: 0, pricePerUser: 0, maxSchedules: 0, pricePerSchedule: 0, pricePerTenant: 0 },
    inclUsers: 0, inclFlos: 0, inclWorkspaces: 0, inclTenants: 0, inclSchedules: 0, inclConnectors: 0
  };

  const [tier, setTier] = useState(INITIAL_STATE);

  // ── Navigation Guard: Warn before exit if dirty ──
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = ''; // Standard browser prompt
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const init = async () => {
      try {
        const typeSnap = await getDocs(query(collection(db, 'FloPlugGlobalSettings', 'GlobalLookUps', 'TenantTypes'), where('isActive', '==', true)));
        setAvailableTenantTypes(typeSnap.docs.map(d => ({ key: d.data().key, value: d.data().value })));
        const tierSnap = await getDocs(collection(db, 'FloPlugTiers'));
        setAvailableTiers(tierSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) { console.error(err); }
      setLoading(false);
    };
    init();
  }, []);

  const loadTierToEdit = async (shortCode: string) => {
    if (!shortCode) {
        setTier(INITIAL_STATE);
        setIsDirty(false);
        return;
    }
    const docRef = doc(db, 'FloPlugTiers', shortCode);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        setTier(snap.data() as any);
        setIsDirty(false); // Reset dirty when a fresh record is loaded
    }
  };

  // Helper to update and mark dirty
  const updateTier = (updates: any) => {
    setTier(prev => ({ ...prev, ...updates }));
    setIsDirty(true);
  };

  const toggleEnv = (key: string) => {
    const current = tier.eligibleTenantTypes.includes(key)
        ? tier.eligibleTenantTypes.filter(k => k !== key)
        : [...tier.eligibleTenantTypes, key];
    updateTier({ eligibleTenantTypes: current });
  };

  const handleSave = async () => {
    if (!tier.tierShortCode) {
        setStatus({ type: 'error', message: "Short Code required" });
        return;
    }
    setIsSaving(true);
    setStatus({ type: 'info', message: 'Deploying tier strategy...' });

    try {
      await setDoc(doc(db, 'FloPlugTiers', tier.tierShortCode), { ...tier, updatedAt: serverTimestamp() });
      setStatus({ type: 'success', message: "Tier Policy Deployed ⚡" });
      setIsDirty(false);
      setTier(INITIAL_STATE); // Clear form after success
    } catch (e: any) { 
        setStatus({ type: 'error', message: e.message });
    } finally {
        setIsSaving(false);
    }
  };

  const handleClear = () => {
    if (isDirty && !window.confirm("Discard unsaved changes?")) return;
    setTier(INITIAL_STATE);
    setIsDirty(false);
    setStatus({ type: '', message: '' });
  };

  if (loading) return <div className="glass-card">Initializing Architect...</div>;

  return (
    <div className="glass-card" style={{ maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h2 className="title">Tier Architect</h2>
          <p className="subtitle">Provisioning logic and commercial bounds.</p>
        </div>
        
        <select 
          className="modern-input" 
          style={{ width: '250px' }} 
          onChange={(e) => loadTierToEdit(e.target.value)}
          value={tier.tierShortCode}
        >
          <option value="">-- Load Existing Tier --</option>
          {availableTiers.map(t => <option key={t.id} value={t.id}>{t.tierName || t.id}</option>)}
        </select>
      </div>

      {/* Status messages matching HubManagement style */}
      {status.message && (
        <div className={`status-message ${status.type}`} style={{ marginBottom: '20px' }}>
          {status.message}
        </div>
      )}

      {/* EXACT ORIGINAL 3-COLUMN GRID */}
      <div className="module-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
        
        {/* COLUMN 1: IDENTITY */}
        <section className="glass-section">
          <h3 style={{ color: 'var(--accent-primary)', marginBottom: '15px' }}>Identity</h3>
          <div className="input-group">
            <label>Tier Name</label>
            <input className="modern-input" value={tier.tierName} onChange={e => updateTier({tierName: e.target.value})} placeholder="e.g. Enterprise Gold" />
          </div>
          <div className="input-group" style={{ marginTop: '15px' }}>
            <label>System Short Code</label>
            <input className="modern-input" value={tier.tierShortCode} onChange={e => updateTier({tierShortCode: e.target.value})} placeholder="TIER-GOLD" />
          </div>
          
          <div style={{ marginTop: '20px' }}>
            <label style={{ fontSize: '0.8rem', opacity: 0.7 }}>Eligible Environments</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
              {availableTenantTypes.map(t => (
                <button 
                  key={t.key} 
                  type="button"
                  onClick={() => toggleEnv(t.key)}
                  style={{
                    padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--glass-border)', fontSize: '12px', cursor: 'pointer',
                    background: tier.eligibleTenantTypes.includes(t.key) ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                    color: 'white'
                  }}
                >
                  {t.value}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* COLUMN 2: INCLUDED QUOTAS */}
        <section className="glass-section">
          <h3 style={{ color: 'var(--accent-primary)', marginBottom: '15px' }}>Included Quotas</h3>
          {[
            { label: 'Users', key: 'inclUsers' },
            { label: 'Tenants', key: 'inclTenants' },
            { label: 'Workspaces', key: 'inclWorkspaces' },
            { label: 'Flos', key: 'inclFlos' },
            { label: 'Schedules', key: 'inclSchedules' }
          ].map(item => (
            <div className="input-group" key={item.key} style={{ marginBottom: '12px' }}>
              <label>{item.label}</label>
              <input type="number" className="modern-input" value={(tier as any)[item.key]} onChange={e => updateTier({[item.key]: Number(e.target.value)})} />
            </div>
          ))}
        </section>

        {/* COLUMN 3: OVERAGE PRICING */}
        <section className="glass-section">
          <h3 style={{ color: 'var(--accent-primary)', marginBottom: '15px' }}>Overage Pricing (USD)</h3>
          <div className="input-group" style={{ marginBottom: '12px' }}>
            <label>Base Subscription</label>
            <input type="number" className="modern-input" value={tier.costModel.basePrice} onChange={e => updateTier({costModel: {...tier.costModel, basePrice: Number(e.target.value)}})} />
          </div>
          <div className="input-group" style={{ marginBottom: '12px' }}>
            <label>Markup</label>
            <input type="number" className="modern-input" value={tier.costModel.markUpPrice} onChange={e => updateTier({costModel: {...tier.costModel, markUpPrice: Number(e.target.value)}})} />
          </div>
          {[
            { label: 'Per Addl. User', key: 'pricePerUser' },
            { label: 'Per Addl. Tenant', key: 'pricePerTenant' },
            { label: 'Per Addl. Flow', key: 'pricePerFlow' },
            { label: 'Per Addl. Schedule', key: 'pricePerSchedule' }
          ].map(item => (
            <div className="input-group" key={item.key} style={{ marginBottom: '12px' }}>
              <label>{item.label}</label>
              <input type="number" className="modern-input" value={(tier.costModel as any)[item.key]} onChange={e => updateTier({costModel: {...tier.costModel, [item.key]: Number(e.target.value)}})} />
            </div>
          ))}
        </section>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
        <button 
            type="button" 
            className="ghost-btn" 
            style={{ flex: 1, padding: '15px' }}
            onClick={handleClear}
        >
          {isDirty ? 'CLEAR CHANGES' : 'CANCEL'}
        </button>
        <button 
            className="system-btn" 
            onClick={handleSave} 
            disabled={isSaving}
            style={{ flex: 2, padding: '15px' }}
        >
          {isSaving ? 'DEPLOYING...' : 'DEPLOY TIER STRATEGY'}
        </button>
      </div>
    </div>
  );
};

export default TierManagement;