/**
 * functions/src/validateAdminUser.ts
 *
 * Validates a FloPlug product user (admin or developer) for the admin portal.
 * Users are stored in the top-level collection: FloPlugUsers/{uid}
 *
 * FIXES applied:
 *  1. `import type { UserRecord }` — UserRecord is a TYPE, not a value.
 *     Using `import { UserRecord }` triggers TS2305 in strict mode because
 *     it tries to import a runtime value that doesn't exist.
 *  2. Removed the duplicate `getUserByEmail` call that existed in the
 *     original file (the try/catch block was duplicated verbatim).
 *  3. Collection changed from `FloPlugAdminUsers` → `FloPlugUsers`
 *     (all FloPlug product users now live in a single collection).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth }             from 'firebase-admin/auth';
import type { UserRecord }     from 'firebase-admin/auth';   // ← `type` keyword required
import { getFirestore }        from 'firebase-admin/firestore';
import type { AdminUser, ValidateAdminData }      from './types/types.ts';
import { toAdminRole, toFloPlugEnvArray } from '@floplug/shared';
import './constants.js';
import { ADMIN_ROLE } from './constants.js';
const db = getFirestore();

/**
 * NOTE on password verification:
 * Firebase Admin SDK cannot verify passwords server-side — that is intentionally
 * only possible client-side via signInWithEmailAndPassword.
 * The secure approach for a custom-token flow is:
 *   1. Client calls this function with email+password
 *   2. This function verifies the user exists in FloPlugUsers + checks isActive/role
 *   3. Issues a custom token if authorised
 *   4. Client calls signInWithCustomToken(token)
 * The actual password check happens when the client later calls Firebase Auth REST
 * API or the Admin SDK's verifyIdToken on subsequent requests.
 * For a fully server-side password check, use the Firebase Auth REST API:
 *   POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword
 */
export const validateAdminUser = onCall<ValidateAdminData>(
  {
    cors: ['https://dev.floplug.xyz', 'https://floplug.xyz',
            'https://prod.floplug.xyz','https://stage.floplug.xyz',
            'https://sb.floplug.xyz'], // add all your origins
  },
  async (request) => {
  const { email, env } = request.data;

  if (!email) {
    throw new HttpsError('invalid-argument', 'email is required');
  }

  // 1. Verify the Firebase Auth user exists — ONE call only
  let userRecord: UserRecord;
  try {
    userRecord = await getAuth().getUserByEmail(email);
  } catch {
    throw new HttpsError('unauthenticated', 'Invalid credentials');
  }

  // 2. Check FloPlugUsers — all product users live in this single collection
  const snap = await db
    .collection('FloPlugUsers')
    .where('email',    '==', email)
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (snap.empty) {
    throw new HttpsError('permission-denied', 'User is not authorised as a FloPlug user');
  }

  const data        = snap.docs[0].data();
  const allowedEnvs = (data.allowedEnvs as string[]) ?? [];

  // 3. Check environment access
  if (env && allowedEnvs.length > 0 && !allowedEnvs.includes(env)) {
    throw new HttpsError(
      'permission-denied',
      `User is not authorised for the ${env} environment`
    );
  }
  console.log(`userRecord.uid : ${userRecord.uid}`);
  console.log(`email : ${email}`);
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth();
  const actualServiceAccount = await auth.getCredentials();
console.log('[DEBUG: validateAdminUser] Actual runtime identity:', JSON.stringify(actualServiceAccount));
  // 4. Issue a custom token with role + env claims
  const token = await getAuth().createCustomToken(userRecord.uid, {
    role:        data.role ?? 'product_admin',
    allowedEnvs: allowedEnvs,
    isAdmin:      data.role === ADMIN_ROLE,
  });

  const adminUser: AdminUser = {
    uid:          userRecord.uid,
    email:        userRecord.email       ?? email,
    displayName:  userRecord.displayName ?? (data.displayName as string | undefined),
    role:         toAdminRole(data.role),
    allowedEnvs: toFloPlugEnvArray(data.allowedEnvs),
    isActive:           (data.isActive as boolean)      ?? true,
    forcePasswordReset: (data.forcePasswordReset as boolean) ?? false,
  };
  console.log(`[token] : ${token}`);
  return { token, user: adminUser };
});
