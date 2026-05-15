/**
 * src/types/AuthConnectorTypes.ts
 *
 * Single source of truth for auth protocol + connector types
 * shared across AuthManagement, ConnectorManagement, PlugManager, Designer.
 *
 * These types mirror exactly what is stored in Firestore:
 *   FloPlugGlobalSettings/AuthenticationTypes  →  authProtocols[]
 *   FloPlugConnectors/{id}                     →  ConnectorDoc
 *   FloPlugHubs/{h}/Tenants/{t}/Plugs/{p}      →  PlugConfig
 */

// ── Auth Protocol (seeded via seedAuthProtocols.ts) ───────────────────────────
//import * as admin from 'firebase-admin';
import {AuthProtocol,ConnectorDoc } from "@floplug/shared";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";



if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

export async function loadAuthProtocols(): Promise<AuthProtocol[]> {
  // admin uses .doc().get() instead of getDoc(doc())
  const snap = await db.doc('FloPlugGlobalSettings/AuthenticationTypes').get();
  
  if (!snap.exists) return [];
  const data = snap.data();
  
  if (!data) return [];

  return ((data.authProtocols ?? data.authTypes ?? []) as AuthProtocol[])
    .filter((p: AuthProtocol) => p.isActive)
    .sort((a: AuthProtocol, b: AuthProtocol) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export async function loadConnectors(): Promise<ConnectorDoc[]> {
  // admin uses .collection().get() instead of getDocs(collection())
  const snap = await db.collection('FloPlugConnectors').get();
  
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as ConnectorDoc))
    .filter(c => c.isActive)
    .sort((a, b) => a.label.localeCompare(b.label));
}
 
