import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  buildHubEntitlements,
  floKitKey,
  normalizeConnectorEntitlements,
  normalizeConnectorIds,
  normalizeProvisionEntitlementsInput,
  validateProvisionEntitlements,
  type ConnectorDoc,
  type FloKitDoc,
  type FloPlugTierDoc,
  type ProvisionEntitlementsInput,
  type ProvisionEntitlementsInputLegacy,
  COLLECTIONS,
  SUB_COLLECTIONS,
  HUB_COLLECTIONS,
  HUB_ENTITLEMENTS_DOC_ID,
} from '@floplug/shared';

const db = getFirestore();

export interface UpdateHubDetailsData {
  hubId: string;
  hubName: string;
  contactEmailId: string;
  branding: {
    displayTitle: string;
    logoBase64:   string | null;
    accentColor:  string | null;
  };
  entitlements: ProvisionEntitlementsInput | ProvisionEntitlementsInputLegacy;
}

async function requireProductAdmin(uid: string): Promise<void> {
  const snap = await db
    .collection(COLLECTIONS.FLOPLUGUSERS)
    .where('uid', '==', uid)
    .where('isActive', '==', true)
    .limit(1)
    .get();
  if (snap.empty) {
    throw new HttpsError('permission-denied', 'Not authorized');
  }
  const role = snap.docs[0].data().role as string;
  if (!['product_admin', 'developer'].includes(role)) {
    throw new HttpsError('permission-denied', 'Only product admins can update hubs');
  }
}

async function loadProductCatalog() {
  const connectorSnap = await db.collection(COLLECTIONS.CONNECTORS).get();
  const connectorsById = new Map<string, ConnectorDoc>();
  const connectors: ConnectorDoc[] = [];
  for (const docSnap of connectorSnap.docs) {
    const c = { id: docSnap.id, ...docSnap.data() } as ConnectorDoc;
    connectorsById.set(docSnap.id, c);
    connectors.push(c);
  }

  const floKitsByKey = new Map<string, FloKitDoc>();
  await Promise.all(
    connectors.map(async c => {
      const kitSnap = await db
        .collection(COLLECTIONS.CONNECTORS)
        .doc(c.id)
        .collection(SUB_COLLECTIONS.FLOKITS)
        .get();
      for (const kitDoc of kitSnap.docs) {
        const kit = { id: kitDoc.id, ...kitDoc.data() } as FloKitDoc;
        floKitsByKey.set(floKitKey(c.id, kit.id), kit);
      }
    }),
  );

  return { connectors, connectorsById, floKitsByKey };
}

export const updateHubDetails = onCall<UpdateHubDetailsData>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in');
  }
  await requireProductAdmin(request.auth.uid);

  const { hubId, hubName, contactEmailId, branding, entitlements } = request.data;
  if (!hubId?.trim()) throw new HttpsError('invalid-argument', 'hubId is required');
  if (!hubName?.trim()) throw new HttpsError('invalid-argument', 'hubName is required');
  if (!contactEmailId?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmailId)) {
    throw new HttpsError('invalid-argument', 'Valid contactEmailId is required');
  }
  const connectorsInput = normalizeProvisionEntitlementsInput(entitlements);
  const inputConnectorIds = Object.keys(connectorsInput);
  const inputKitCount = Object.values(connectorsInput).reduce((n, c) => n + c.floKits.length, 0);
  if (inputConnectorIds.length === 0 || inputKitCount === 0) {
    throw new HttpsError('invalid-argument', 'Connectors and at least one FloKit are required');
  }

  const hubRef = db.collection(COLLECTIONS.HUBS).doc(hubId);
  const hubSnap = await hubRef.get();
  if (!hubSnap.exists) throw new HttpsError('not-found', `Hub "${hubId}" not found`);

  const tierId = (hubSnap.data()?.tierId as string) ?? '';
  if (!tierId) throw new HttpsError('failed-precondition', 'Hub has no tierId');

  const tierSnap = await db.collection(COLLECTIONS.FLOPLUGTIERS).doc(tierId).get();
  const tier = (tierSnap.data() ?? {}) as FloPlugTierDoc;
  const maxTierControlledConnectors = tier.inclConnectors ?? 0;

  const { connectors, connectorsById, floKitsByKey } = await loadProductCatalog();
  const connectorIds = normalizeConnectorIds(
    inputConnectorIds,
    connectors,
    tierId,
  );
  const connectorsEnt = normalizeConnectorEntitlements(connectorsInput, connectorIds);

  const validationError = validateProvisionEntitlements({
    tierId,
    connectorIds,
    connectors: connectorsEnt,
    connectorsById,
    floKitsByKey,
    maxTierControlledConnectors,
  });
  if (validationError) throw new HttpsError('invalid-argument', validationError);

  const hubEntitlements = buildHubEntitlements(
    tierId,
    connectorIds,
    connectorsEnt,
    floKitsByKey,
  );

  const brandingPayload = {
    displayTitle: branding.displayTitle?.trim() || hubName.trim(),
    accentColor:  branding.accentColor  ?? '#4f8ef7',
    ...(branding.logoBase64 ? { logoBase64: branding.logoBase64 } : {}),
  };

  const batch = db.batch();
  batch.update(hubRef, {
    hubName:        hubName.trim(),
    contactEmailId: contactEmailId.trim().toLowerCase(),
    branding:       brandingPayload,
    entitlements:   hubEntitlements,
    updatedAt:      FieldValue.serverTimestamp(),
    updatedBy:      request.auth.uid,
  });

  const tenantsSnap = await hubRef.collection(HUB_COLLECTIONS.TENANTS).get();
  for (const tenantDoc of tenantsSnap.docs) {
    batch.update(tenantDoc.ref, {
      'branding.displayTitle': brandingPayload.displayTitle,
      'branding.accentColor':  brandingPayload.accentColor,
      ...(brandingPayload.logoBase64
        ? { 'branding.logoBase64': brandingPayload.logoBase64 }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const entRef = tenantDoc.ref
      .collection(HUB_COLLECTIONS.ENTITLEMENTS)
      .doc(HUB_ENTITLEMENTS_DOC_ID);
    batch.set(entRef, {
      ...hubEntitlements,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    }, { merge: true });
  }

  await batch.commit();

  return {
    status: 'success',
    hubId,
    entitlements: hubEntitlements,
    branding: brandingPayload,
  };
});
