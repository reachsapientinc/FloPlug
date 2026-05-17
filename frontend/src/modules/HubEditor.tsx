/**
 * Edit existing hub — details, branding, entitlements (slug + tier locked).
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { HubDoc, HubBranding, FloKitDoc } from '@floplug/shared';
import {
  countTierControlledConnectors, floKitKey,
  entitlementsToKitSelections, kitSelectionsToConnectorEntitlements, countSelectedActions,
  normalizeHubEntitlements, entitledConnectorIds,
  type KitActionSelectionMap,
} from '@floplug/shared';
import { EntitlementsSection, useEntitlementCatalog, connIdsKey } from './hubEntitlementsUi';
import { hubMgmtStyles as s, TIER_LABELS, ACCENT_PRESETS } from './hubManagementStyles';

interface HubEditorProps {
  hub:     HubDoc;
  onSaved: (updated: HubDoc) => void;
}

const HubEditor: React.FC<HubEditorProps> = ({ hub, onSaved }) => {
  const [hubName, setHubName] = useState(hub.hubName);
  const [contactEmailId, setContactEmailId] = useState(hub.contactEmailId ?? '');
  const [displayTitle, setDisplayTitle] = useState(hub.branding?.displayTitle ?? hub.hubName);
  const [accentColor, setAccentColor] = useState(hub.branding?.accentColor ?? '#4f8ef7');
  const [logoBase64, setLogoBase64] = useState(hub.branding?.logoBase64 ?? '');
  const [logoFileName, setLogoFileName] = useState('');
  const [selectedConnIds, setSelectedConnIds] = useState<string[]>([]);
  const [kitSelections, setKitSelections] = useState<KitActionSelectionMap>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const catalog = useEntitlementCatalog(hub.tierId);
  const hubInitRef = useRef<string | null>(null);
  const selectedConnKey = useMemo(() => connIdsKey(selectedConnIds), [selectedConnIds]);

  const handleLoadKitActions = useCallback(
    (connectorId: string, kit: FloKitDoc) => catalog.loadKitActions(connectorId, kit),
    [catalog.loadKitActions],
  );

  useEffect(() => {
    setHubName(hub.hubName);
    setContactEmailId(hub.contactEmailId ?? '');
    setDisplayTitle(hub.branding?.displayTitle ?? hub.hubName);
    setAccentColor(hub.branding?.accentColor ?? '#4f8ef7');
    setLogoBase64(hub.branding?.logoBase64 ?? '');
    setLogoFileName('');
    setError('');
    setSuccess('');
  }, [hub.id, hub.hubName, hub.contactEmailId, hub.branding]);

  useEffect(() => {
    if (catalog.catalogLoading) return;
    if (hubInitRef.current === hub.id) return;
    hubInitRef.current = hub.id;
    const normalized = normalizeHubEntitlements(hub.entitlements);
    const storedConnIds = entitledConnectorIds(normalized);
    const connIds = storedConnIds.length
      ? catalog.normalizeIds(storedConnIds)
      : catalog.standardIds();
    setSelectedConnIds(connIds);
    setKitSelections(entitlementsToKitSelections(normalized, catalog.floKitsByKey));
  }, [hub.id, hub.entitlements, catalog.catalogLoading, catalog.floKitsByKey]);

  useEffect(() => {
    if (catalog.catalogLoading) return;
    setSelectedConnIds(prev => {
      const next = catalog.normalizeIds(prev);
      return connIdsKey(prev) === connIdsKey(next) ? prev : next;
    });
  }, [hub.tierId, catalog.catalogLoading, catalog.connectors]);

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

  const handleLogoUpload = (file: File) => {
    if (file.size > 256 * 1024) { setError('Logo must be under 256 KB.'); return; }
    const allowed = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'];
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
    if (!hubName.trim()) { setError('Hub name is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmailId)) {
      setError('Valid contact email is required.');
      return;
    }
    const connIds = catalog.normalizeIds(selectedConnIds);
    const connectors = kitSelectionsToConnectorEntitlements(kitSelections, connIds);
    if (countSelectedActions(kitSelections) === 0) {
      setError('Select at least one action (check a FloKit or expand and pick actions).');
      return;
    }
    const tierControlled = countTierControlledConnectors(connIds, catalog.connectorsById);
    if (catalog.maxTierControlled > 0 && tierControlled > catalog.maxTierControlled) {
      setError(`This tier allows at most ${catalog.maxTierControlled} tier-controlled connector(s).`);
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const fn = httpsCallable(getFunctions(), 'updateHubDetails');
      const result = await fn({
        hubId: hub.id,
        hubName: hubName.trim(),
        contactEmailId: contactEmailId.trim().toLowerCase(),
        branding: {
          displayTitle: displayTitle.trim() || hubName.trim(),
          logoBase64:   logoBase64 || null,
          accentColor:  accentColor || null,
        },
        entitlements: { connectors },
      }) as { data?: { entitlements?: HubDoc['entitlements'] } };

      const branding: HubBranding = {
        displayTitle: displayTitle.trim() || hubName.trim(),
        accentColor,
        logoBase64: logoBase64 || undefined,
      };
      setSuccess('Hub updated.');
      onSaved({
        ...hub,
        hubName: hubName.trim(),
        contactEmailId: contactEmailId.trim().toLowerCase(),
        branding,
        entitlements: result.data?.entitlements ?? {
          tierId: hub.tierId,
          connectors,
          actionIds: hub.entitlements?.actionIds ?? [],
        },
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.brandingPanel}>
      <div style={s.section}>
        <div style={s.secTitle}>Hub Details</div>
        {error && <div style={s.errBanner}>{error}</div>}
        {success && <div style={s.okBanner}>{success}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={s.fg}>
            <label style={s.fl}>Hub Name *</label>
            <input style={s.input} value={hubName} onChange={e => setHubName(e.target.value)} />
          </div>
          <div style={s.fg}>
            <label style={s.fl}>Slug <span style={s.immutableBadge}>locked</span></label>
            <div style={s.roValue}>{hub.hubSlug}</div>
          </div>
          <div style={s.fg}>
            <label style={s.fl}>Contact Email *</label>
            <input style={s.input} type="email" value={contactEmailId}
              onChange={e => setContactEmailId(e.target.value.toLowerCase())} />
          </div>
          <div style={s.fg}>
            <label style={s.fl}>Tier <span style={s.immutableBadge}>locked</span></label>
            <div style={s.roValue}>{TIER_LABELS[hub.tierId] ?? hub.tierId}</div>
          </div>
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
      </div>

      <div style={s.section}>
        <div style={s.secTitle}>Branding</div>
        <div style={s.fg}>
          <label style={s.fl}>Display Title</label>
          <input style={s.input} value={displayTitle} placeholder={hubName}
            onChange={e => setDisplayTitle(e.target.value)} />
        </div>
        <div style={{ ...s.fg, marginTop: 12 }}>
          <label style={s.fl}>Accent Color</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="color" value={accentColor}
              onChange={e => setAccentColor(e.target.value)}
              style={{ width: 36, height: 36, borderRadius: 6, border: 'none', cursor: 'pointer', padding: 0, background: 'none' }} />
            <input style={{ ...s.input, fontFamily: 'monospace', width: 120 }} value={accentColor}
              onChange={e => setAccentColor(e.target.value)} />
            <div style={{ width: 28, height: 28, borderRadius: 6, background: accentColor }} />
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {ACCENT_PRESETS.map(c => (
              <button key={c} type="button" onClick={() => setAccentColor(c)}
                style={{ width: 22, height: 22, borderRadius: 4, background: c,
                  border: accentColor === c ? '2px solid #fff' : '2px solid transparent',
                  cursor: 'pointer', padding: 0 }} />
            ))}
          </div>
        </div>
        <div style={{ ...s.fg, marginTop: 12 }}>
          <label style={s.fl}>Hub Logo (max 256 KB)</label>
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
                <img src={logoBase64} alt="logo"
                  style={{ height: 36, maxWidth: 120, objectFit: 'contain', borderRadius: 4 }} />
                <div>
                  <div style={{ fontSize: 12, color: '#c0c0cc' }}>{logoFileName || 'Current logo'}</div>
                  <div style={{ fontSize: 10, color: '#45455a' }}>
                    ~{Math.round(logoBase64.length / 1024)} KB
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#45455a', fontSize: 12 }}>
                Drop logo or click to browse
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" onClick={handleSave} style={s.primaryBtn} disabled={saving}>
            {saving ? 'Saving…' : 'Save Hub'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HubEditor;
