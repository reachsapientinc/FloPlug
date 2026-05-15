// functions/src/handlers/createHubUser.ts
import { onCall } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const createHubUser = onCall(async (request) => {
  // Only hub_admin can create users
  const callerClaims = request.auth?.token?.floPlugHubs ?? {};
  const { hubId, tenantId, email, displayName, role } = request.data;

  if (callerClaims[hubId] !== 'hub_admin') {
    throw new Error('Only hub admins can create users');
  }

  // 1. Create or get Firebase Auth user
  let uid: string;
  try {
    const existing = await getAuth().getUserByEmail(email);
    uid = existing.uid;
  } catch {
    const created = await getAuth().createUser({ email, displayName,
      password: Math.random().toString(36).slice(-10), // temp password
      emailVerified: false,
    });
    uid = created.uid;
    // Send password reset so user sets their own
    await getAuth().generatePasswordResetLink(email);
  }

  // 2. Merge hub access into custom claims
  const existing = await getAuth().getUser(uid);
  const existingClaims = existing.customClaims ?? {};
  const existingHubs   = (existingClaims as any).floPlugHubs ?? {};

  await getAuth().setCustomUserClaims(uid, {
    ...existingClaims,
    floPlugHubs: { ...existingHubs, [hubId]: role },
  });

  // 3. Store user profile in Firestore for display
  await getFirestore()
    .collection('FloPlugHubs').doc(hubId)
    .collection('Tenants').doc(tenantId)
    .collection('Users').doc(uid)
    .set({
      uid, email, displayName, role,
      hubId, tenantId,
      isActive:  true,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

  return { uid, email, role };
});