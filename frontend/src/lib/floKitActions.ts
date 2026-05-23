/**
 * FloKit-scoped actions — FloPlugConnectors/{connectorId}/FloKits/{floKitId}/FloKitActions/{actionId}
 */

import { collection, doc, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { ActionDoc } from '@floplug/shared';
import { COLLECTIONS, SUB_COLLECTIONS } from '@floplug/shared';

export type KitScopedAction = ActionDoc & {
  floKitName?: string;
};

export function floKitActionDocRef(
  connectorId: string,
  floKitId:    string,
  actionId?:   string,
) {
  const col = collection(
    db,
    COLLECTIONS.FLOPLUGCONNECTORS,
    connectorId,
    SUB_COLLECTIONS.FLOKITS,
    floKitId,
    SUB_COLLECTIONS.FLOKITACTIONS,
  );
  return actionId ? doc(col, actionId) : doc(col);
}

/** Load all FloKitActions for every kit on this connector. */
export async function loadFloKitActionsForConnector(
  connectorId: string,
): Promise<KitScopedAction[]> {
  const kitsSnap = await getDocs(
    collection(db, COLLECTIONS.FLOPLUGCONNECTORS, connectorId, SUB_COLLECTIONS.FLOKITS),
  );

  const kits = kitsSnap.docs.map(d => ({
    id:   d.id,
    name: (d.data().name as string) ?? d.id,
  }));

  const all: KitScopedAction[] = [];

  await Promise.all(
    kits.map(async kit => {
      try {
        const snap = await getDocs(
          collection(
            db,
            COLLECTIONS.FLOPLUGCONNECTORS,
            connectorId,
            SUB_COLLECTIONS.FLOKITS,
            kit.id,
            SUB_COLLECTIONS.FLOKITACTIONS,
          ),
        );
        for (const d of snap.docs) {
          all.push({
            id: d.id,
            ...d.data(),
            connectorId,
            floKitId: kit.id,
            floKitName: kit.name,
          } as KitScopedAction);
        }
      } catch (err) {
        console.warn(`[loadFloKitActionsForConnector] kit ${kit.id}:`, err);
      }
    }),
  );

  return all.sort((a, b) => {
    const kitCmp = (a.floKitName ?? a.floKitId ?? '').localeCompare(b.floKitName ?? b.floKitId ?? '');
    if (kitCmp !== 0) return kitCmp;
    return (a.label ?? '').localeCompare(b.label ?? '');
  });
}
