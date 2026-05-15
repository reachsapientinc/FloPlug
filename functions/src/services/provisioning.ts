import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { EnergizeData, AppSettings } from '../types/types.js';
import { createAudit } from '../utils/audit.js';
import { guardUniqueId } from '../utils/uniqueGuard.js';
import { getGlobalSetting } from '../helpers/settingsHelper.js';
import { sendEmail } from '../services/emailService.js';
//import {COLLECTIONS} from '../constants.js';

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

export const provisionHubAndTenants = async (userId: string, data: EnergizeData) => {
  const db    = getFirestore();
  const auth  = getAuth();
  const batch = db.batch();

  const settings   = await getGlobalSetting<AppSettings>('Settings');
  const hSlug      = data.hubSlug.toLowerCase().trim();
  const hShortCode = `HUB-${hSlug.toUpperCase()}`;
  const hIntId     = `int-hub-${hSlug}`;
  const adminEmail = `admin@${hSlug}.floplug.xyz`;

  try {
    // 1. Fetch Tier & Global Lookups
    const tierSnap = await db.collection('FloPlugTiers').doc(data.tierId).get();
    if (!tierSnap.exists) throw new Error(`Tier '${data.tierId}' not found.`);

    const globalTenantsSnap = await db
      .collection('FloPlugGlobalSettings')
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

    const hubRef      = db.collection('FloPlugHubs').doc(hSlug);
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

      const tenantRef = hubRef.collection('Tenants').doc(tSlug);

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

      // ── Default Workspace ───────────────────────────────────────────────────
      // Auto-ID doc — Firestore generates the ID; we store it back as `id`
      // so the frontend and all cross-references can use a single source of truth.
      const wsShortCode = `WS-${tSlug.toUpperCase()}-DEFAULT-${adminUid}`;
      const wsIntId     = `int-${wsShortCode.toLowerCase()}`;

      await guardUniqueId(batch, tenantRef, 'workspace', 'shortCode',     wsShortCode);
      await guardUniqueId(batch, tenantRef, 'workspace', 'integrationId', wsIntId);

      // Use a pre-allocated ref so we have the ID before batch.commit()
      const wsRef = tenantRef.collection('Workspaces').doc();   // ← auto-ID
      const wsId  = wsRef.id;                                   // stable from here on

      batch.set(wsRef, createAudit(userId, wsShortCode, wsIntId, hSlug, {
        id:            wsId,              // stored for easy cross-reference
        workspaceName: `Default ${env.label} Workspace`,
        shortCode:     wsShortCode,
        integrationId: wsIntId,
        isDefault:     true,             // protected flag — Designer hides delete
        defaultToLoad: true,             // Designer loads this workspace on mount
        isActive:      !isProd,
        ownerUid:      adminUid,
      }));

      // ── Default Flow ────────────────────────────────────────────────────────
      // Auto-ID doc inside the workspace's Flos subcollection.
      const flShortCode = `FL-${tSlug.toUpperCase()}-DEFAULT-${adminUid}`;
      const flIntId     = `int-${flShortCode.toLowerCase()}`;

      await guardUniqueId(batch, tenantRef, 'flo', 'shortCode',     flShortCode);
      await guardUniqueId(batch, tenantRef, 'flo', 'integrationId', flIntId);

      const flowRef = wsRef.collection('Flos').doc();          // ← auto-ID
      const flowId  = flowRef.id;

      batch.set(flowRef, createAudit(userId, flShortCode, flIntId, hSlug, {
        id:            flowId,            // stored for easy cross-reference
        name:          'Default Flow',
        shortCode:     flShortCode,
        integrationId: flIntId,
        ownerUid:      adminUid,
        workspaceId:   wsId,              // ← ref to the actual Firestore doc ID
        hubId:         hSlug,
        tenantId:      tSlug,
        nodes:         DEFAULT_FLOW_NODES,
        edges:         [],
        status:        'idle',
        isDefault:     true,
        defaultToLoad: true,              // Designer loads this flow on mount
      }));

      // ── User Profile ────────────────────────────────────────────────────────
      const userProfileRef = tenantRef.collection('Users').doc(adminUid);
      batch.set(userProfileRef, createAudit(userId, `USR-${tSlug.toUpperCase()}`, `int-usr-${tSlug}`, hSlug, {
        email:        adminEmail,
        uid:          adminUid,
        role:         'hub_admin',
        isActive:     !isProd,
        workspaceIds: [wsId],             // ← actual Firestore doc ID, not a slug
      }));
    }

    // 5. Save Hub Document
    batch.set(hubRef, createAudit(userId, hShortCode, hIntId, hSlug, {
      hubName:         data.hubName,
      hubSlug:         hSlug,
      tierId:          data.tierId,
      branding:        data.branding,
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
        'This is an automated message from FloPlug.',
      ].join('\n'),
    });

    return { status: 'success', hubId: hSlug, endpoints: tenantUrls };

  } catch (error: any) {
    console.error('Provisioning Error:', error);
    throw error;
  }
};