import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { FloActionPaletteItem, FloConnectionSafe, PlugConfig } from '@floplug/shared';
import { toFloActionPaletteItem } from '@floplug/shared';
import type { HubActionNodeDoc } from '@floplug/shared';
import { db } from '../firebaseConfig';

export interface HubConfigCatalog {
  plugs:       PlugConfig[];
  connections: FloConnectionSafe[];
  floActions:  FloActionPaletteItem[];
  loadedAt:    Date;
}

export function useHubConfigCatalog(hubId: string, tenantId: string) {
  const [catalog, setCatalog] = useState<HubConfigCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hubId || !tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const functions = getFunctions();
      const [plugSnap, connRes, actionRes] = await Promise.all([
        getDocs(query(
          collection(db, 'FloPlugHubs', hubId, 'Tenants', tenantId, 'Plugs'),
          orderBy('createdAt', 'desc'),
        )),
        httpsCallable<
          { hubId: string; tenantId: string },
          { connections: FloConnectionSafe[] }
        >(functions, 'getFloConnections')({ hubId, tenantId }),
        httpsCallable<
          { hubId: string; tenantId: string },
          { nodes: HubActionNodeDoc[] }
        >(functions, 'getHubActionNodes')({ hubId, tenantId }),
      ]);

      const plugs = plugSnap.docs.map(d => ({ id: d.id, ...d.data() } as PlugConfig));
      const floActions = (actionRes.data.nodes ?? []).map(toFloActionPaletteItem);

      setCatalog({
        plugs,
        connections: connRes.data.connections ?? [],
        floActions,
        loadedAt: new Date(),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [hubId, tenantId]);

  useEffect(() => { load(); }, [load]);

  return { catalog, loading, error, reload: load };
}
