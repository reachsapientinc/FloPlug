/**
 * provisionUsers.ts — User Provisioning Cloud Functions
 *
 * All outbound email goes through emailService.sendEmail() which handles:
 *   - Hub-level override (redirect all emails to overrideNotificationsEmailId)
 *   - Suppression (emailNotificationsEnabled: false → logged as 'suppressed')
 *   - EmailLog writing (FloPlugHubs/{hubId}/EmailLog) for every email attempt
 */

import { onCall, HttpsError }            from 'firebase-functions/v2/https';
import { getAuth }                        from 'firebase-admin/auth';
import { getFirestore, FieldValue }       from 'firebase-admin/firestore';
import {
  InviteAdminData,
  InviteHubUserData,
  UpdateAdminRoleData,
  UpdateHubUserRoleData,
} from '../types/types.js';
import { sendEmail } from '../services/emailService.js';

const db = getFirestore();

// ── Helper: get or create a Firebase Auth user by email ──────────────────────
async function getOrCreateAuthUser(
  email: string,
  displayName: string
): Promise<{ uid: string; isNew: boolean }> {
  try {
    const existing = await getAuth().getUserByEmail(email);
    return { uid: existing.uid, isNew: false };
  } catch {
    const tempPassword = `Fp${Math.random().toString(36).slice(2, 10)}Tmp!`;
    const newUser = await getAuth().createUser({
      email,
      displayName,
      password:      tempPassword,
      emailVerified: false,
    });
    return { uid: newUser.uid, isNew: true };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. inviteAdminUser — invite a FloPlug product admin or developer
// ─────────────────────────────────────────────────────────────────────────────
export const inviteAdminUser = onCall<InviteAdminData>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in');
  }

  // Only product_admins can invite other admin users
  const callerSnap = await db
    .collection('FloPlugUsers')
    .where('uid',      '==', request.auth.uid)
    .where('role',     '==', 'product_admin')
    .where('isActive', '==', true)
    .limit(1).get();

  if (callerSnap.empty) {
    throw new HttpsError('permission-denied', 'Only product admins can invite other admin users');
  }

  const { email, displayName, role, allowedEnvs, hubId } = request.data;

  if (!email || !displayName || !role) {
    throw new HttpsError('invalid-argument', 'email, displayName and role are required');
  }
  if (!['product_admin', 'developer'].includes(role)) {
    throw new HttpsError('invalid-argument', `Invalid role "${role}"`);
  }
  if (!hubId) {
    throw new HttpsError('invalid-argument', 'hubId is required for email logging');
  }

  // Step 1: Get or create Firebase Auth user
  const { uid, isNew } = await getOrCreateAuthUser(email, displayName);

  // Step 2: Prevent duplicate invite
  const existingProfile = await db.doc(`FloPlugUsers/${uid}`).get();
  if (existingProfile.exists) {
    throw new HttpsError('already-exists', `${email} is already a FloPlug admin user`);
  }

  // Step 3: Write the admin profile document
  await db.doc(`FloPlugUsers/${uid}`).set({
    uid,
    email,
    displayName,
    role,
    allowedEnvs: allowedEnvs ?? ['dev'],
    isActive:    true,
    forcePasswordReset: false,
    invitedBy:   request.auth.uid,
    invitedAt:   FieldValue.serverTimestamp(),
    createdAt:   FieldValue.serverTimestamp(),
  });

  // Step 4: Generate invite link and send email
  const resetLink = await getAuth().generatePasswordResetLink(email, {
    url: 'https://prod.floplug.xyz',
  });

  await sendEmail({
    hubId,
    toAddress: email,
    purpose:   'ADMIN_USER_INVITE',
    subject:   `You've been invited as a FloPlug ${role}`,
    emailBody: [
      `Hello ${displayName},`,
      '',
      `You have been invited to FloPlug as a ${role}.`,
      '',
      'Set your password using the link below to activate your account:',
      resetLink,
      '',
      `Allowed environments: ${(allowedEnvs ?? ['dev']).join(', ')}`,
      '',
      'This is an automated message from FloPlug.',
    ].join('\n'),
  });

  console.info(`[inviteAdminUser] Invite sent to ${email} (uid: ${uid}, isNew: ${isNew})`);

  return {
    success:    true,
    uid,
    isNew,
    message:    `Invite sent to ${email}`,
    inviteLink: resetLink,
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. inviteHubUser — invite a user into a hub + tenant
// ─────────────────────────────────────────────────────────────────────────────
export const inviteHubUser = onCall<InviteHubUserData>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in');
  }

  const { email, displayName, role, hubId, tenantId, workspaceIds } = request.data;

  if (!email || !displayName || !role || !hubId || !tenantId) {
    throw new HttpsError('invalid-argument', 'email, displayName, role, hubId and tenantId are required');
  }
  if (!['hub_admin', 'user'].includes(role)) {
    throw new HttpsError('invalid-argument', `Invalid role "${role}"`);
  }

  // Verify caller is a hub_admin for this tenant or a product_admin
  const callerSnap = await db
    .collection(`FloPlugHubs/${hubId}/Tenants/${tenantId}/Users`)
    .where('uid',      '==', request.auth.uid)
    .where('role',     '==', 'hub_admin')
    .where('isActive', '==', true)
    .limit(1).get();

  let callerIsAuthorised = !callerSnap.empty;
  if (!callerIsAuthorised) {
    const adminSnap = await db
      .collection('FloPlugUsers')
      .where('uid',      '==', request.auth.uid)
      .where('isActive', '==', true)
      .limit(1).get();
    callerIsAuthorised = !adminSnap.empty;
  }

  if (!callerIsAuthorised) {
    throw new HttpsError('permission-denied', 'Only hub admins or product admins can invite hub users');
  }

  // Verify the hub + tenant exists
  const tenantDoc = await db.doc(`FloPlugHubs/${hubId}/Tenants/${tenantId}`).get();
  if (!tenantDoc.exists) {
    throw new HttpsError('not-found', `Tenant ${tenantId} not found in hub ${hubId}`);
  }
  const tenantData = tenantDoc.data()!;

  // Step 1: Get or create Firebase Auth user
  const { uid, isNew } = await getOrCreateAuthUser(email, displayName);

  // Step 2: Prevent duplicate membership
  const existingMember = await db
    .doc(`FloPlugHubs/${hubId}/Tenants/${tenantId}/Users/${uid}`).get();
  if (existingMember.exists) {
    throw new HttpsError('already-exists', `${email} is already a member of this tenant`);
  }

  // Step 3: Write the hub user profile
  await db.doc(`FloPlugHubs/${hubId}/Tenants/${tenantId}/Users/${uid}`).set({
    uid,
    email,
    displayName,
    role,
    workspaceIds: workspaceIds ?? [],
    isActive:     true,
    hubId,
    tenantId,
    invitedBy:    request.auth.uid,
    invitedAt:    FieldValue.serverTimestamp(),
    createdAt:    FieldValue.serverTimestamp(),
    forcePasswordReset: true,
  });

  // Step 4: Generate invite link and send email
  const slug     = tenantData.slug     as string ?? hubId;
  const env      = tenantData.tenantType as string ?? 'dev';
  const loginUrl = `https://${env}.floplug.xyz/${slug}`;

  const resetLink = await getAuth().generatePasswordResetLink(email, {
    url: loginUrl,
  });

  await sendEmail({
    hubId,
    toAddress: email,
    purpose:   'HUB_USER_INVITE',
    subject:   `You've been invited to ${tenantData.tenantName ?? hubId}`,
    emailBody: [
      `Hello ${displayName},`,
      '',
      `You have been invited to join ${tenantData.tenantName ?? hubId} on FloPlug`,
      `as a ${role} in the ${env} environment.`,
      '',
      'Set your password using the link below to activate your account:',
      resetLink,
      '',
      `After setting your password, log in at:`,
      loginUrl,
      '',
      'This is an automated message from FloPlug.',
    ].join('\n'),
  });

  console.info(
    `[inviteHubUser] Invite sent to ${email} → ${hubId}/${tenantId} (uid: ${uid}, isNew: ${isNew})`
  );

  return {
    success:    true,
    uid,
    isNew,
    message:    `Invite sent to ${email} for ${hubId}/${tenantId}`,
    inviteLink: resetLink,
    loginUrl,
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. updateAdminRole — change a product admin's role or access
// ─────────────────────────────────────────────────────────────────────────────
export const updateAdminRole = onCall<UpdateAdminRoleData>(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');

  const callerSnap = await db
    .collection('FloPlugUsers')
    .where('uid',      '==', request.auth.uid)
    .where('role',     '==', 'product_admin')
    .where('isActive', '==', true)
    .limit(1).get();
  if (callerSnap.empty) {
    throw new HttpsError('permission-denied', 'Only product admins can update roles');
  }

  const { targetUid, role, allowedEnvs, isActive } = request.data;
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (role        !== undefined) updates.role        = role;
  if (allowedEnvs !== undefined) updates.allowedEnvs = allowedEnvs;
  if (isActive    !== undefined) updates.isActive    = isActive;

  await db.doc(`FloPlugUsers/${targetUid}`).update(updates);
  return { success: true };
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. updateHubUserRole — change a hub user's role or workspace access
// ─────────────────────────────────────────────────────────────────────────────
export const updateHubUserRole = onCall<UpdateHubUserRoleData>(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be signed in');

  const { hubId, tenantId, targetUid, role, workspaceIds, isActive } = request.data;

  const hubAdminSnap = await db
    .collection(`FloPlugHubs/${hubId}/Tenants/${tenantId}/Users`)
    .where('uid',      '==', request.auth.uid)
    .where('role',     '==', 'hub_admin')
    .where('isActive', '==', true)
    .limit(1).get();

  if (hubAdminSnap.empty) {
    const adminSnap = await db
      .collection('FloPlugUsers')
      .where('uid',      '==', request.auth.uid)
      .where('isActive', '==', true)
      .limit(1).get();
    if (adminSnap.empty) throw new HttpsError('permission-denied', 'Not authorised');
  }

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (role         !== undefined) updates.role         = role;
  if (workspaceIds !== undefined) updates.workspaceIds = workspaceIds;
  if (isActive     !== undefined) updates.isActive     = isActive;

  await db.doc(`FloPlugHubs/${hubId}/Tenants/${tenantId}/Users/${targetUid}`).update(updates);
  return { success: true };
});