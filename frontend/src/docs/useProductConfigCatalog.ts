import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import type { ActionDoc, ConnectorDoc, FloKitDoc } from '@floplug/shared';
import { COLLECTIONS, SUB_COLLECTIONS } from '@floplug/shared';
import { loadConnectors } from '../types/AuthConnectorTypes';
import { db } from '../firebaseConfig';

export interface ProductConfigCatalog {
  connectors:       ConnectorDoc[];
  floKitsByConn:    Record<string, FloKitDoc[]>;
  actionsByKitKey:  Record<string, Pick<ActionDoc, 'id' | 'label' | 'description' | 'method'>[]>;
  loadedAt:         Date;
}

function kitKey(connectorId: string, floKitId: string) {
  return `${connectorId}/${floKitId}`;
}

export function useProductConfigCatalog(enabled: boolean) {
  const [catalog, setCatalog] = useState<ProductConfigCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const connectors = (await loadConnectors()).filter(c => c.isActive !== false);
      const floKitsByConn: Record<string, FloKitDoc[]> = {};
      const actionsByKitKey: ProductConfigCatalog['actionsByKitKey'] = {};

      for (const conn of connectors) {
        const kitSnap = await getDocs(
          collection(db, COLLECTIONS.FLOPLUGCONNECTORS, conn.id, SUB_COLLECTIONS.FLOKITS),
        );
        const kits = kitSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as FloKitDoc))
          .filter(k => k.isActive !== false);
        floKitsByConn[conn.id] = kits;

        for (const kit of kits) {
          const key = kitKey(conn.id, kit.id);
          const ids = kit.actionIds ?? [];
          if (ids.length === 0) {
            actionsByKitKey[key] = [];
            continue;
          }
          const actionSnap = await getDocs(
            collection(
              db, COLLECTIONS.FLOPLUGCONNECTORS, conn.id,
              SUB_COLLECTIONS.FLOKITS, kit.id, SUB_COLLECTIONS.FLOKITACTIONS,
            ),
          );
          actionsByKitKey[key] = actionSnap.docs
            .map(d => {
              const a = d.data() as ActionDoc;
              return { id: d.id, label: a.label, description: a.description, method: a.method };
            })
            .filter(a => a.label);
        }
      }

      setCatalog({
        connectors,
        floKitsByConn,
        actionsByKitKey,
        loadedAt: new Date(),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { load(); }, [load]);

  return { catalog, loading, error, reload: load };
}
