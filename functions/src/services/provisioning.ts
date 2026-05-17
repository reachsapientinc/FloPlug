import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  buildHubEntitlements,
  countEntitledFloKits,
  entitledConnectorIds,
  floKitKey,
  normalizeConnectorEntitlements,
  normalizeConnectorIds,
  normalizeProvisionEntitlementsInput,
  validateProvisionEntitlements,
  type ConnectorDoc,
  type FloKitDoc,
  type FloPlugTierDoc,
  HUB_ENTITLEMENTS_DOC_ID,
  HUB_COLLECTIONS,
  COLLECTIONS,
  SUB_COLLECTIONS,
} from '@floplug/shared';
import { EnergizeData, AppSettings } from '../types/types.js';
import { createAudit } from '../utils/audit.js';
import { guardUniqueId } from '../utils/uniqueGuard.js';
import { getGlobalSetting } from '../helpers/settingsHelper.js';
import { sendEmail } from '../services/emailService.js';

// ── Default Start + End nodes placed in every new flow ────────────────────────
const DEFAULT_FLOW_NODES = [
  {
    id:       'start-node',
    type:     'startNode',
    position: { x: 80,  y: 180 },
    data:     { label: 'Start' },
  },
  {
    id:       'end-node',
    type:     'endNode',
    position: { x: 560, y: 180 },
    data:     { label: 'End', output: null },
  },
];

async function loadProductCatalog(db: ReturnType<typeof getFirestore>) {
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
    [...connectorsById.keys()].map(async connectorId => {
      const kitSnap = await db
        .collection(COLLECTIONS.CONNECTORS)
        .doc(connectorId)
        .collection(SUB_COLLECTIONS.FLOKITS)
        .get();
      for (const kitDoc of kitSnap.docs) {
        const kit = { id: kitDoc.id, ...kitDoc.data() } as FloKitDoc;
        floKitsByKey.set(floKitKey(connectorId, kit.id), kit);
      }
    }),
  );

  return { connectors, connectorsById, floKitsByKey };
}

export const provisionHubAndTenants = async (userId: string, data: EnergizeData) => {
  const db    = getFirestore();
  const auth  = getAuth();
  const batch = db.batch();

  const settings   = await getGlobalSetting<AppSettings>('Settings');
  const hSlug      = data.hubSlug.toLowerCase().trim();
  const hShortCode = `HUB-${hSlug.toUpperCase()}`;
  const hIntId     = `int-hub-${hSlug}`;
  const adminEmail = `admin@${hSlug}.floplug.xyz`;

  const connectorsInput = normalizeProvisionEntitlementsInput(data.entitlements);
  const inputConnectorIds = Object.keys(connectorsInput);
  const inputKitCount = Object.values(connectorsInput).reduce((n, c) => n + c.floKits.length, 0);
  if (inputConnectorIds.length === 0 || inputKitCount === 0) {
    throw new Error('Hub entitlements (connectors and at least one FloKit) are required.');
  }

  try {
    // 1. Fetch Tier & Global Lookups
    const tierSnap = await db.collection(COLLECTIONS.FLOPLUGTIERS).doc(data.tierId).get();
    if (!tierSnap.exists) throw new Error(`Tier '${data.tierId}' not found.`);

    const tier = tierSnap.data() as FloPlugTierDoc;
    const maxTierControlledConnectors = tier.inclConnectors ?? 0;

    const { connectors, connectorsById, floKitsByKey } = await loadProductCatalog(db);
    const connectorIds = normalizeConnectorIds(
      inputConnectorIds,
      connectors,
      data.tierId,
    );
    const connectorsEnt = normalizeConnectorEntitlements(connectorsInput, connectorIds);

    const validationError = validateProvisionEntitlements({
      tierId: data.tierId,
      connectorIds,
      connectors: connectorsEnt,
      connectorsById,
      floKitsByKey,
      maxTierControlledConnectors,
    });
    if (validationError) throw new Error(validationError);

    const hubEntitlements = buildHubEntitlements(
      data.tierId,
      connectorIds,
      connectorsEnt,
      floKitsByKey,
    );

    const globalTenantsSnap = await db
      .collection(COLLECTIONS.GLOBAL_SETTINGS)
      .doc('GlobalLookUps')
      .collection('TenantTypes')
      .where('isActive', '==', true)
      .get();

    const eligibleEnvs = globalTenantsSnap.docs
      .map(doc => ({ key: doc.data().key, label: doc.data().value }))
      .filter(env => (tierSnap.data()?.eligibleTenantTypes || []).includes(env.key));

    // 2. Global Registry uniqueness guard
    const globalRef = db.collection('FloPlugRegistry').doc('GlobalConfig');
    await guardUniqueId(batch, globalRef, 'hub', 'shortCode',     hShortCode);
    await guardUniqueId(batch, globalRef, 'hub', 'integrationId', hIntId);

    // 3. Create Hub Admin Firebase Auth user
    const userRecord = await auth.createUser({
      email:       adminEmail,
      password:    'TempPassword123!',
      displayName: `${data.hubName} Admin`,
    });
    const adminUid = userRecord.uid;

    const hubRef      = db.collection(COLLECTIONS.HUBS).doc(hSlug);
    const tenantUrls: Record<string, string> = {};

    // 4. Provision each environment (Tenant)
    for (const env of eligibleEnvs) {
      const envLower   = env.key.toLowerCase();
      const isProd     = envLower === 'prod';
      const tSlug      = envLower;
      const tShortCode = `TEN-${tSlug.toUpperCase()}`;
      const tIntId     = `int-ten-${tSlug}-${hSlug}`;
      const root       = settings?.rootDomain;
      const tUrl       = `https://${root}/${hSlug}/`;
      tenantUrls[env.key] = tUrl;

      const tenantRef = hubRef.collection(HUB_COLLECTIONS.TENANTS).doc(tSlug);

      // Guard both shortCode and integrationId for tenant
      await guardUniqueId(batch, hubRef, 'tenant', 'shortCode',     tShortCode);
      await guardUniqueId(batch, hubRef, 'tenant', 'integrationId', tIntId);

      batch.set(tenantRef, createAudit(userId, tShortCode, tIntId, hSlug, {
        tenantName: env.label,
        envType:    envLower,
        tenantType: envLower,
        slug:       hSlug,
        url:        tUrl,
        isActive:   !isProd,
      }));

      const entitlementsRef = tenantRef
        .collection(HUB_COLLECTIONS.ENTITLEMENTS)
        .doc(HUB_ENTITLEMENTS_DOC_ID);
      batch.set(entitlementsRef, createAudit(userId, `ENT-${tSlug.toUpperCase()}`, `int-ent-${tSlug}-${hSlug}`, hSlug, {
        ...hubEntitlements,
      }));

      // ── Default Workspace ───────────────────────────────────────────────────
      const wsShortCode = `WS-${tSlug.toUpperCase()}-DEFAULT-${adminUid}`;
      const wsIntId     = `int-${wsShortCode.toLowerCase()}`;

      await guardUniqueId(batch, tenantRef, 'workspace', 'shortCode',     wsShortCode);
      await guardUniqueId(batch, tenantRef, 'workspace', 'integrationId', wsIntId);

      const wsRef = tenantRef.collection(HUB_COLLECTIONS.WORKSPACES).doc();
      const wsId  = wsRef.id;

      batch.set(wsRef, createAudit(userId, wsShortCode, wsIntId, hSlug, {
        id:            wsId,
        workspaceName: `Default ${env.label} Workspace`,
        shortCode:     wsShortCode,
        integrationId: wsIntId,
        isDefault:     true,
        defaultToLoad: true,
        isActive:      !isProd,
        ownerUid:      adminUid,
      }));

      // ── Default Flow ────────────────────────────────────────────────────────
      const flShortCode = `FL-${tSlug.toUpperCase()}-DEFAULT-${adminUid}`;
      const flIntId     = `int-${flShortCode.toLowerCase()}`;

      await guardUniqueId(batch, tenantRef, 'flo', 'shortCode',     flShortCode);
      await guardUniqueId(batch, tenantRef, 'flo', 'integrationId', flIntId);

      const flowRef = wsRef.collection(HUB_COLLECTIONS.FLOS).doc();
      const flowId  = flowRef.id;

      batch.set(flowRef, createAudit(userId, flShortCode, flIntId, hSlug, {
        id:            flowId,
        name:          'Default Flow',
        shortCode:     flShortCode,
        integrationId: flIntId,
        ownerUid:      adminUid,
        workspaceId:   wsId,
        hubId:         hSlug,
        tenantId:      tSlug,
        nodes:         DEFAULT_FLOW_NODES,
        edges:         [],
        status:        'idle',
        isDefault:     true,
        defaultToLoad: true,
      }));

      // ── User Profile ────────────────────────────────────────────────────────
      const userProfileRef = tenantRef.collection(HUB_COLLECTIONS.USERS).doc(adminUid);
      batch.set(userProfileRef, createAudit(userId, `USR-${tSlug.toUpperCase()}`, `int-usr-${tSlug}`, hSlug, {
        email:        adminEmail,
        uid:          adminUid,
        role:         'hub_admin',
        isActive:     !isProd,
        workspaceIds: [wsId],
      }));
    }

    // 5. Save Hub Document
    batch.set(hubRef, createAudit(userId, hShortCode, hIntId, hSlug, {
      hubName:         data.hubName,
      hubSlug:         hSlug,
      tierId:          data.tierId,
      branding:        data.branding,
      entitlements:    hubEntitlements,
      adminEmail,
      contactEmailId:  data.contactEmailId ?? null,
      tenantEndpoints: tenantUrls,
      isActive:        true,
      emailNotificationsEnabled:    false,
      overrideNotificationsEmailId: null,
    }));

    await batch.commit();

    // 6. Send hub admin invite email
    const resetLink = await auth.generatePasswordResetLink(adminEmail);

    await sendEmail({
      hubId:     hSlug,
      toAddress: adminEmail,
      purpose:   'HUB_ADMIN_INVITE',
      subject:   `Your FloPlug Hub Admin account for ${data.hubName} is ready`,
      emailBody: [
        `Hello ${data.hubName} Admin,`,
        '',
        `Your hub "${data.hubName}" has been provisioned on FloPlug.`,
        '',
        'Your login credentials:',
        `  Email:    ${adminEmail}`,
        `  Password: TempPassword123! (please reset immediately)`,
        '',
        'Set your permanent password using the link below:',
        resetLink,
        '',
        'Hub environments provisioned:',
        ...Object.entries(tenantUrls).map(([env, url]) => `  ${env}: ${url}`),
        '',
        `Entitled connectors: ${entitledConnectorIds(hubEntitlements).length}`,
        `Entitled FloKits: ${countEntitledFloKits(hubEntitlements)}`,
        '',
        'This is an automated message from FloPlug.',
      ].join('\n'),
    });

    return {
      status: 'success',
      hubId: hSlug,
      endpoints: tenantUrls,
      entitlements: hubEntitlements,
    };

  } catch (error: any) {
    console.error('Provisioning Error:', error);
    throw error;
  }
};
