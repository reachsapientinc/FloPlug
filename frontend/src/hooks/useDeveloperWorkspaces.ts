/**
 * Developer-scoped workspaces — not admin-controlled.
 * Loads workspaces owned by the user (+ legacy workspaceIds on profile).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  addDoc, arrayUnion, collection, doc, getDoc, getDocs, query,
  serverTimestamp, setDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { COLLECTIONS, HUB_COLLECTIONS, type WorkspaceMeta } from '@floplug/shared';

const workspacesCol = (hubId: string, tenantId: string) =>
  collection(db, COLLECTIONS.HUBS, hubId, HUB_COLLECTIONS.TENANTS, tenantId, HUB_COLLECTIONS.WORKSPACES);

const tenantUserRef = (hubId: string, tenantId: string, userId: string) =>
  doc(db, COLLECTIONS.HUBS, hubId, HUB_COLLECTIONS.TENANTS, tenantId, HUB_COLLECTIONS.USERS, userId);

export interface DeveloperWorkspace extends WorkspaceMeta {
  ownerUid?: string;
  /** User's preferred workspace to open on login */
  isUserDefault?: boolean;
}

export function useDeveloperWorkspaces(
  hubId: string,
  tenantId: string,
  userId: string,
  legacyWorkspaceIds: string[] = [],
) {
  const [allWorkspaces, setAllWorkspaces]   = useState<DeveloperWorkspace[]>([]);
  const [activeWs, setActiveWs]             = useState<DeveloperWorkspace | null>(null);
  const [defaultWorkspaceId, setDefaultWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading]               = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [ownedSnap, userSnap] = await Promise.all([
        getDocs(query(workspacesCol(hubId, tenantId), where('ownerUid', '==', userId))),
        getDoc(tenantUserRef(hubId, tenantId, userId)),
      ]);

      const userDefaultId = (userSnap.data()?.defaultWorkspaceId as string | undefined) ?? null;
      setDefaultWorkspaceId(userDefaultId);

      const byId = new Map<string, DeveloperWorkspace>();
      for (const d of ownedSnap.docs) {
        const ws = { id: d.id, ...d.data() } as DeveloperWorkspace;
        byId.set(ws.id, { ...ws, isUserDefault: ws.id === userDefaultId });
      }

      // Legacy / shared assignments still on user profile
      for (const id of legacyWorkspaceIds) {
        if (byId.has(id)) continue;
        const d = await getDoc(doc(workspacesCol(hubId, tenantId), id));
        if (d.exists()) {
          const ws = { id: d.id, ...d.data() } as DeveloperWorkspace;
          byId.set(ws.id, { ...ws, isUserDefault: ws.id === userDefaultId });
        }
      }

      const list = Array.from(byId.values()).sort((a, b) =>
        a.workspaceName.localeCompare(b.workspaceName),
      );
      setAllWorkspaces(list);

      const keepCurrent = activeWs && list.some(w => w.id === activeWs.id) ? activeWs.id : null;
      const nextId = keepCurrent ?? userDefaultId ?? list[0]?.id ?? null;
      setActiveWs(list.find(w => w.id === nextId) ?? null);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubId, tenantId, userId, legacyWorkspaceIds.join(',')]);

  useEffect(() => { refresh(); }, [refresh]);

  const switchWorkspace = useCallback((ws: DeveloperWorkspace) => {
    setActiveWs(ws);
  }, []);

  const createWorkspace = useCallback(async (workspaceName: string): Promise<DeveloperWorkspace> => {
    const trimmed = workspaceName.trim();
    if (!trimmed) throw new Error('Workspace name is required.');

    const ref = await addDoc(workspacesCol(hubId, tenantId), {
      workspaceName: trimmed,
      ownerUid:      userId,
      isDefault:     false,
      defaultToLoad: false,
      isActive:      true,
      hubId,
      tenantId,
      createdAt:     serverTimestamp(),
      updatedAt:     serverTimestamp(),
    });
    await setDoc(ref, { id: ref.id }, { merge: true });

    await setDoc(tenantUserRef(hubId, tenantId, userId), {
      workspaceIds: arrayUnion(ref.id),
    }, { merge: true });

    const meta: DeveloperWorkspace = {
      id:            ref.id,
      workspaceName: trimmed,
      ownerUid:      userId,
      isDefault:     false,
      defaultToLoad: false,
      isUserDefault: allWorkspaces.length === 0,
    };

    if (allWorkspaces.length === 0) {
      await setDoc(tenantUserRef(hubId, tenantId, userId), {
        defaultWorkspaceId: ref.id,
      }, { merge: true });
      setDefaultWorkspaceId(ref.id);
      meta.isUserDefault = true;
    }

    setAllWorkspaces(prev => [...prev, meta]);
    setActiveWs(meta);
    return meta;
  }, [hubId, tenantId, userId, allWorkspaces.length]);

  const renameWorkspace = useCallback(async (workspaceId: string, workspaceName: string) => {
    const trimmed = workspaceName.trim();
    if (!trimmed) throw new Error('Workspace name is required.');

    await setDoc(
      doc(workspacesCol(hubId, tenantId), workspaceId),
      { workspaceName: trimmed, updatedAt: serverTimestamp() },
      { merge: true },
    );
    setAllWorkspaces(prev =>
      prev.map(w => (w.id === workspaceId ? { ...w, workspaceName: trimmed } : w)),
    );
    setActiveWs(prev =>
      prev?.id === workspaceId ? { ...prev, workspaceName: trimmed } : prev,
    );
  }, [hubId, tenantId]);

  const setDefaultWorkspace = useCallback(async (workspaceId: string) => {
    await setDoc(tenantUserRef(hubId, tenantId, userId), {
      defaultWorkspaceId: workspaceId,
    }, { merge: true });
    setDefaultWorkspaceId(workspaceId);
    setAllWorkspaces(prev =>
      prev.map(w => ({ ...w, isUserDefault: w.id === workspaceId })),
    );
    setActiveWs(prev => prev ? { ...prev, isUserDefault: prev.id === workspaceId } : prev);
  }, [hubId, tenantId, userId]);

  return {
    allWorkspaces,
    activeWs,
    defaultWorkspaceId,
    loading,
    refresh,
    switchWorkspace,
    createWorkspace,
    renameWorkspace,
    setDefaultWorkspace,
  };
}

/** Set which flo opens by default within a workspace */
export async function setDefaultFloForWorkspace(
  hubId: string,
  tenantId: string,
  workspaceId: string,
  floId: string,
): Promise<void> {
  const col = collection(
    db, COLLECTIONS.HUBS, hubId, HUB_COLLECTIONS.TENANTS, tenantId,
    HUB_COLLECTIONS.WORKSPACES, workspaceId, HUB_COLLECTIONS.FLOS,
  );
  const snap = await getDocs(col);
  const batch = writeBatch(db);
  for (const d of snap.docs) {
    batch.update(d.ref, { defaultToLoad: d.id === floId });
  }
  await batch.commit();
}

const floDocRef = (hubId: string, tenantId: string, wsId: string, floId: string) =>
  doc(db, COLLECTIONS.HUBS, hubId, HUB_COLLECTIONS.TENANTS, tenantId,
    HUB_COLLECTIONS.WORKSPACES, wsId, HUB_COLLECTIONS.FLOS, floId);

/** Move a flo document to another workspace (same flo id). */
export async function moveFloToWorkspace(
  hubId: string,
  tenantId: string,
  floId: string,
  fromWorkspaceId: string,
  toWorkspaceId: string,
): Promise<void> {
  if (fromWorkspaceId === toWorkspaceId) return;

  const srcRef = floDocRef(hubId, tenantId, fromWorkspaceId, floId);
  const snap   = await getDoc(srcRef);
  if (!snap.exists()) throw new Error('Flo not found in source workspace.');

  const data = snap.data();
  const wasDefault = data.defaultToLoad === true;

  const dstRef = floDocRef(hubId, tenantId, toWorkspaceId, floId);
  const batch  = writeBatch(db);
  batch.set(dstRef, {
    ...data,
    workspaceId:   toWorkspaceId,
    defaultToLoad: false,
    updatedAt:     serverTimestamp(),
  });
  batch.delete(srcRef);

  if (wasDefault) {
    const srcCol = collection(
      db, COLLECTIONS.HUBS, hubId, HUB_COLLECTIONS.TENANTS, tenantId,
      HUB_COLLECTIONS.WORKSPACES, fromWorkspaceId, HUB_COLLECTIONS.FLOS,
    );
    const remaining = await getDocs(srcCol);
    for (const d of remaining.docs) {
      if (d.id !== floId && d.data().defaultToLoad) {
        batch.update(d.ref, { defaultToLoad: false });
      }
    }
  }

  await batch.commit();
}
