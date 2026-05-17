import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { HubDoc, FloKitDoc } from '@floplug/shared';
import {
  floKitKey, countTierControlledConnectors,
  kitSelectionsToConnectorEntitlements, countSelectedActions,
  type KitActionSelectionMap,
} from '@floplug/shared';
import { EntitlementsSection, useEntitlementCatalog, connIdsKey } from './hubEntitlementsUi';
import { hubMgmtStyles as s, ACCENT_PRESETS } from './hubManagementStyles';

interface Props {
  onProvisioned: (hub: HubDoc) => void;
}

const ProvisionHubForm: React.FC<Props> = ({ onProvisioned }) => {
  const [form, setForm] = useState({
    name: '', slug: '', tier: 'gold_tier',
    authMethod: 'usernameCredentials', contactEmailId: '',
  });
  const [branding, setBranding] = useState({
    displayTitle: '', logoBase64: '', logoFileName: '', accentColor: '',
  });
  const [selectedConnIds, setSelectedConnIds] = useState<string[]>([]);
  const [kitSelections, setKitSelections] = useState<KitActionSelectionMap>({});
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: string; msg: string }>({ type: '', msg: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  const catalog = useEntitlementCatalog(form.tier);
  const tierInitRef = useRef<string | null>(null);
  const selectedConnKey = useMemo(() => connIdsKey(selectedConnIds), [selectedConnIds]);

  const handleLoadKitActions = useCallback(
    (connectorId: string, kit: FloKitDoc) => catalog.loadKitActions(connectorId, kit),
    [catalog.loadKitActions],
  );

  useEffect(() => {
    if (catalog.catalogLoading) return;
    if (tierInitRef.current === form.tier) return;
    tierInitRef.current = form.tier;
    setSelectedConnIds(catalog.standardIds());
    setKitSelections({});
  }, [form.tier, catalog.catalogLoading, catalog.connectors]);

  useEffect(() => {
    if (catalog.catalogLoading) return;
    setSelectedConnIds(prev => {
      const next = catalog.normalizeIds(prev);
      return connIdsKey(prev) === connIdsKey(next) ? prev : next;
    });
  }, [form.tier, catalog.catalogLoading, catalog.connectors]);

  useEffect(() => {
    if (catalog.catalogLoading) return;
    catalog.loadFloKitsForConnectors(selectedConnIds);
  }, [selectedConnKey, catalog.catalogLoading, catalog.loadFloKitsForConnectors]);

  useEffect(() => {
    if (catalog.kitsLoading) return;
    const allowedKeys = new Set(
      selectedConnIds.flatMap(connId =>
        (catalog.floKitsByConn[connId] ?? []).map(k => floKitKey(connId, k.id)),
      ),
    );
    setKitSelections(prev => {
      const next: KitActionSelectionMap = {};
      for (const [key, ids] of Object.entries(prev)) {
        if (allowedKeys.has(key)) next[key] = ids;
      }
      return next;
    });
  }, [selectedConnKey, catalog.floKitsByConn, catalog.kitsLoading]);

  const toggleConnector = (connId: string) => {
    const c = catalog.connectorsById.get(connId);
    if (!c?.tierControlled) return;
    setSelectedConnIds(prev =>
      prev.includes(connId) ? prev.filter(id => id !== connId) : [...prev, connId],
    );
  };

  const handleNameChange = (val: string) => {
    const slug = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setForm(p => ({ ...p, name: val, slug }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.slug) { setStatus({ type: 'error', msg: 'Hub name and slug are required.' }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmailId)) {
      setStatus({ type: 'error', msg: 'Valid email required.' }); return;
    }
    const connIds = catalog.normalizeIds(selectedConnIds);
    const connectors = kitSelectionsToConnectorEntitlements(kitSelections, connIds);
    if (countSelectedActions(kitSelections) === 0) {
      setStatus({ type: 'error', msg: 'Select at least one action (via FloKit or individually).' }); return;
    }
    const tierControlled = countTierControlledConnectors(connIds, catalog.connectorsById);
    if (catalog.maxTierControlled > 0 && tierControlled > catalog.maxTierControlled) {
      setStatus({ type: 'error', msg: `This tier allows at most ${catalog.maxTierControlled} tier-controlled connector(s).` });
      return;
    }
    setLoading(true);
    setStatus({ type: 'info', msg: 'Provisioning…' });
    try {
      const fn = httpsCallable(getFunctions(), 'energizeHub');
      const result = await fn({
        hubName: form.name, hubSlug: form.slug,
        tierId: form.tier, authMethod: form.authMethod,
        contactEmailId: form.contactEmailId,
        branding: {
          displayTitle: branding.displayTitle || form.name,
          logoBase64:   branding.logoBase64   || null,
          accentColor:  branding.accentColor  || null,
        },
        entitlements: { connectors },
      }) as { data?: { hubId?: string; entitlements?: HubDoc['entitlements'] } };

      setStatus({ type: 'success', msg: `Hub "${form.name}" provisioned!` });
      onProvisioned({
        id: result.data?.hubId ?? form.slug,
        hubName: form.name, hubSlug: form.slug,
        tierId: form.tier, contactEmailId: form.contactEmailId,
        isActive: true,
        entitlements: result.data?.entitlements,
        branding: {
          displayTitle: branding.displayTitle || form.name,
          accentColor: branding.accentColor || undefined,
          logoBase64:  branding.logoBase64   || undefined,
        },
      });
      setForm({ name: '', slug: '', tier: 'gold_tier', authMethod: 'usernameCredentials', contactEmailId: '' });
      setBranding({ displayTitle: '', logoBase64: '', logoFileName: '', accentColor: '' });
      setSelectedConnIds(catalog.standardIds());
      setKitSelections({});
    } catch (err: unknown) {
      setStatus({ type: 'error', msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.section}>
      <div style={s.secTitle}>Provision New Hub</div>
      <p style={{ fontSize: 11, color: '#6b6b80', marginBottom: 16, lineHeight: 1.5 }}>
        Creates the hub, tenants, default workspace, and entitlements. Slug and tier are fixed after creation.
      </p>
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
            <label style={s.fl}>Slug *</label>
            <input style={{ ...s.input, fontFamily: 'monospace' }} value={form.slug}
              onChange={e => setForm(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
              required />
          </div>
          <div style={s.fg}>
            <label style={s.fl}>Contact Email *</label>
            <input style={s.input} type="email" value={form.contactEmailId} required
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
          <EntitlementsSection
            eligibleConnectors={catalog.eligibleConnectors}
            connectorsById={catalog.connectorsById}
            catalogLoading={catalog.catalogLoading}
            kitsLoading={catalog.kitsLoading}
            floKitsByConn={catalog.floKitsByConn}
            kitActionsByKey={catalog.kitActionsByKey}
            kitActionsLoading={catalog.kitActionsLoading}
            selectedConnIds={selectedConnIds}
            kitSelections={kitSelections}
            onKitSelectionsChange={setKitSelections}
            maxTierControlled={catalog.maxTierControlled}
            onToggleConnector={toggleConnector}
            onLoadKitActions={handleLoadKitActions}
            styles={s}
          />
          <div style={{ ...s.fg, gridColumn: '1/-1' }}>
            <label style={s.fl}>Display Title (optional)</label>
            <input style={s.input} value={branding.displayTitle}
              placeholder={form.name}
              onChange={e => setBranding(p => ({ ...p, displayTitle: e.target.value }))} />
          </div>
          <div style={{ ...s.fg, gridColumn: '1/-1' }}>
            <label style={s.fl}>Accent Color</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="color" value={branding.accentColor || '#4f8ef7'}
                onChange={e => setBranding(p => ({ ...p, accentColor: e.target.value }))}
                style={{ width: 32, height: 32, border: 'none', cursor: 'pointer' }} />
              {ACCENT_PRESETS.map(c => (
                <button key={c} type="button" onClick={() => setBranding(p => ({ ...p, accentColor: c }))}
                  style={{ width: 22, height: 22, borderRadius: 4, background: c, padding: 0, border: 'none', cursor: 'pointer' }} />
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button type="submit" style={s.primaryBtn} disabled={loading}>
            {loading ? 'Provisioning…' : '⚡ Energize Hub'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProvisionHubForm;
