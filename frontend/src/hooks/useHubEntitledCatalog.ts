/**
 * Loads hub entitlements and resolves entitled FloKits + ActionDocs for FloActionManager.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { COLLECTIONS, HUB_COLLECTIONS, SUB_COLLECTIONS } from '@floplug/shared';
import type { HubEntitlements, ConnectorDoc, ActionDoc } from '@floplug/shared';
import {
  entitledConnectorIds,
  normalizeHubEntitlements,
  flattenFloKitEntitlements,
  resolveEntitledActionIds,
  floKitKey,
} from '@floplug/shared';
import { useEntitlementCatalog } from '../modules/hubEntitlementsUi';
import type { FloKitMeta } from '../components/FloActionManager';

export function useHubEntitledCatalog(hubId: string, tenantId: string) {
  const [entitlements, setEntitlements] = useState<HubEntitlements | undefined>();
  const [hubLoading, setHubLoading]     = useState(true);
   console.log(`[useHubEntitledCatalog] hubId : ${hubId}, tenantId: ${tenantId}`);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setHubLoading(true);
      try {
        const snap = await getDoc(
          doc(db, COLLECTIONS.HUBS, hubId, HUB_COLLECTIONS.TENANTS, tenantId, HUB_COLLECTIONS.ENTITLEMENTS, 'hub')
        );
        if (!cancelled && snap.exists()) {
          const data = snap.data();
          setEntitlements(normalizeHubEntitlements(data as HubEntitlements));
        }
      } catch (err) {
        console.error("Error fetching hub entitlements:", err);
      } finally {
        if (!cancelled) setHubLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hubId, tenantId]);

  // Use a temporary loading placeholder string if the actual tierId hasn't resolved from Firestore yet
  const tierId = entitlements?.tierId || 'loading_placeholder';
  console.log(`[useHubEntitledCatalog] tierId : ${tierId}`);
  const catalog = useEntitlementCatalog(tierId);

  const connIds = useMemo(
    () => entitledConnectorIds(entitlements),
    [entitlements],
  );

  const connKey = connIds.join('|');

  console.log(`[useHubEntitledCatalog] connKey : ${connKey}`);

  useEffect(() => {
    if (!tierId || tierId === 'loading_placeholder' || catalog.catalogLoading || connIds.length === 0) return;
    catalog.loadFloKitsForConnectors(connIds);
  }, [tierId, connKey, catalog.catalogLoading, catalog.loadFloKitsForConnectors, connIds]);

  // Load actions for each entitled kit securely
  useEffect(() => {
    if (!entitlements || tierId === 'loading_placeholder' || catalog.kitsLoading) return;
    const refs = flattenFloKitEntitlements(entitlements);
    for (const ref of refs) {
      const kit = catalog.floKitsByKey.get(floKitKey(ref.connectorId, ref.floKitId));
      if (kit) {
        void catalog.loadKitActions(ref.connectorId, kit);
      }
    }
  }, [entitlements, tierId, catalog.kitsLoading, catalog.floKitsByKey, catalog.loadKitActions]);

  const entitledConnectors = useMemo((): ConnectorDoc[] => {
    return connIds
      .map(id => catalog.connectorsById.get(id))
      .filter((c): c is ConnectorDoc => !!c);
  }, [connIds, catalog.connectorsById]);

  const floKitsByConnectorId = useMemo((): Record<string, FloKitMeta[]> => {
    const out: Record<string, FloKitMeta[]> = {};
    if (!entitlements) return out;

    for (const ref of flattenFloKitEntitlements(entitlements)) {
      const kit = catalog.floKitsByKey.get(floKitKey(ref.connectorId, ref.floKitId));
      if (!kit) continue;
      const entitledIds = resolveEntitledActionIds(ref, kit);
      if (!entitledIds.length) continue;

      const meta: FloKitMeta = {
        id:          kit.id,
        connectorId: ref.connectorId,
        label:       kit.name ?? kit.id,
        description: kit.description,
        actionIds:   entitledIds,
        serviceModule:  kit.serviceModule,
        serviceVersion: kit.serviceVersion,
      };
      if (!out[ref.connectorId]) out[ref.connectorId] = [];
      out[ref.connectorId].push(meta);
    }
    return out;
  }, [entitlements, catalog.floKitsByKey]);

  const actionsByFloKitId = useMemo((): Record<string, ActionDoc[]> => {
    const out: Record<string, ActionDoc[]> = {};
    for (const kits of Object.values(floKitsByConnectorId)) {
      for (const kit of kits) {
        const key = floKitKey(kit.connectorId, kit.id);
        const all = catalog.kitActionsByKey[key] ?? [];
        const allowed = new Set(kit.actionIds);
        out[kit.id] = all.filter(a => allowed.has(a.id));
      }
    }
    return out;
  }, [floKitsByConnectorId, catalog.kitActionsByKey]);

  // Prevent catalogLoading and kitsLoading flags from freezing your dashboard when tierId is still empty or a loading placeholder
  const loading = hubLoading || 
                  (tierId !== 'loading_placeholder' && (catalog.catalogLoading || catalog.kitsLoading));

  const refresh = useCallback(() => {
    if (connIds.length) catalog.loadFloKitsForConnectors(connIds);
  }, [connIds, catalog.loadFloKitsForConnectors]);

  return {
    entitledConnectors,
    floKitsByConnectorId,
    actionsByFloKitId,
    loading,
    refresh,
  };
}