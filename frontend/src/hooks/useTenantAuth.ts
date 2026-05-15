/**
 * useTenantAuth.ts — Tenant Sentinel + Admin Auth
 *
 * Auth persistence strategy:
 *
 * The WRONG approach (previous):
 *   Store the custom token in localStorage → call signInWithCustomToken on refresh.
 *   Fails after 1 hour because custom tokens expire.
 *
 * The RIGHT approach (this file):
 *   1. On login: call signInWithCustomToken → Firebase issues an ID token + refresh token.
 *   2. Firebase SDK auto-refreshes the ID token every ~55 min using the refresh token.
 *   3. On page refresh: use onAuthStateChanged to rehydrate — Firebase restores the
 *      session from its own IndexedDB persistence automatically.
 *   4. Store only the user profile + session metadata (hubId, tenantId, role) in
 *      localStorage — NOT the custom token.
 *   5. If onAuthStateChanged fires with null (session truly expired/cleared),
 *      force re-login.
 *
 * This means the session survives page refreshes indefinitely as long as the
 * Firebase refresh token is valid (does not expire unless explicitly revoked).
 *
 * Race condition fix (why it broke):
 *   Visiting dev.floplug.xyz/demo (tenant) writes a Firebase IndexedDB session.
 *   Navigating to dev.floplug.xyz (admin) causes onAuthStateChanged to fire with
 *   the stale tenant identity before login completes. The !session guard then calls
 *   signOut() and boots the user mid-login.
 *
 *   Fix 1: Write localStorage BEFORE calling signInWithCustomToken so the
 *           onAuthStateChanged handler always finds a valid session.
 *   Fix 2: A ref flag (isLoggingIn) suppresses the signOut() boot during an
 *           active login attempt, preventing the race entirely.
 */

import { useState, useEffect, useCallback, useRef }           from 'react';
import { getFunctions, httpsCallable }                        from 'firebase/functions';
import { getAuth, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import type {
  TenantConfig, FloPlugEnv,
  TenantUser, AdminUser,
  TenantSession, AdminSession,
} from '../types/types';
import {toHubRole} from '@floplug/shared';

const TENANT_KEY = 'fp_tenant_session';
const ADMIN_KEY  = 'fp_admin_session';

// ── Storage helpers ───────────────────────────────────────────────────────────
function readStorage<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    console.error(`[FloPlug] localStorage write failed: ${key}`);
  }
}

function clearStorage(key: string): void {
  localStorage.removeItem(key);
}

// ── Safe user mappers ─────────────────────────────────────────────────────────
// Both mappers accept Partial<> so they handle stale localStorage entries and
// older Cloud Function responses that predate isActive / forcePasswordReset.

function mapTenantUser(
  raw: Partial<TenantUser>,
  fallback: { hubId?: string; tenantId?: string } = {},
): TenantUser {
  return {
    uid:                raw.uid                ?? '',
    email:              raw.email              ?? '',
    displayName:        raw.displayName,
    hubId:              raw.hubId              ?? fallback.hubId    ?? '',
    tenantId:           raw.tenantId           ?? fallback.tenantId ?? '',
    workspaceIds:       raw.workspaceIds       ?? [],
    role:               raw.role               ?? 'user',
    isActive:           raw.isActive           ?? true,
    forcePasswordReset: raw.forcePasswordReset ?? false,
  };
}

function mapAdminUser(raw: Partial<AdminUser>): AdminUser {
  return {
    uid:                raw.uid                ?? '',
    email:              raw.email              ?? '',
    displayName:        raw.displayName,
    role:               raw.role               ?? 'developer',
    allowedEnvs:        raw.allowedEnvs        ?? [],
    isActive:           raw.isActive           ?? true,
    forcePasswordReset: raw.forcePasswordReset ?? false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useTenantAuth — hub-scoped auth (used by TenantPortal)
// ─────────────────────────────────────────────────────────────────────────────

export interface TenantAuthState {
  user:    TenantUser | null;  
  permissions: string[];
  isHubAdmin:boolean;
  loading: boolean;
  error:   string;
}

export function useTenantAuth(tenant: TenantConfig | null) {
  const [state, setState] = useState<TenantAuthState>({ user: null, permissions:[],isHubAdmin:false,loading: true, error: '' });

  const slug     = tenant?.slug     ?? '';
  const env      = tenant?.env      ?? ('' as FloPlugEnv);
  const hubId    = tenant?.hubId    ?? '';
  const tenantId = tenant?.tenantId ?? '';

  // Guard: prevents onAuthStateChanged from signing the user out while a
  // login is actively in progress (fixes the stale-IndexedDB race condition).
  const isLoggingIn = useRef(false);

  // ── Restore session on mount ────────────────────────────────────────────────
  useEffect(() => {
    const auth = getAuth();

    const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
  if (isLoggingIn.current) return;
  if (!firebaseUser) {
    clearStorage(TENANT_KEY);
    setState({ user: null, permissions:[],isHubAdmin:false,loading: false, error: '' });
    return;
  }
  const session = readStorage<TenantSession>(TENANT_KEY);
  if (!session || session.slug !== slug || session.env !== env) {
    clearStorage(TENANT_KEY);
    setState({ user: null, permissions:[],isHubAdmin:false,loading: false, error: '' });
    return;
  }
  try {
    const idTokenResult = await firebaseUser.getIdTokenResult();

    const claims = idTokenResult.claims as {
  hubId:        string;
  tenantId:     string;
  role:         string;
  permissions:  string[];
  isHubAdmin:   boolean;
  allowedFlos: string[];
};

    // const claimsRole    = (idTokenResult.claims.role as string)
    //                       ?? (session.user as any)?.role ?? 'user';
    // const user = mapTenantUser(
    //   { ...(session.user as Partial<TenantUser>), role: claimsRole },
    //   { hubId, tenantId }
    // );
    //setState({ user, loading: false, error: '' });
    setState({
        user: mapTenantUser({ ...session.user, role: toHubRole(claims.role) }, { hubId, tenantId }),
        permissions: claims.permissions ?? [],
        isHubAdmin:  claims.isHubAdmin  ?? false,
        loading:     false,
        error:       '',
      });
  } catch {
    const user = mapTenantUser(session.user as Partial<TenantUser>, { hubId, tenantId });
    setState({ user, permissions:[],isHubAdmin:false,loading: false, error: '' });
  }
});

    return () => unsubscribe();
  }, [slug, env, hubId, tenantId]);

  // ── Cross-tab sentinel ──────────────────────────────────────────────────────
  // ── Cross-tab sentinel ──────────────────────────────────────────────────────
useEffect(() => {
  const handler = async (e: StorageEvent) => {
    if (e.key !== TENANT_KEY) return;

    if (!e.newValue) {
      setState({ user: null, permissions: [], isHubAdmin: false, loading: false, error: '' });
      return;
    }

    try {
      const s = JSON.parse(e.newValue) as TenantSession;
      if (s.slug !== slug || s.env !== env) {
        clearStorage(TENANT_KEY);
        setState({ user: null, permissions: [], isHubAdmin: false, loading: false, error: '' });
        return;
      }

      const mappedUser = mapTenantUser(s.user as Partial<TenantUser>, { hubId, tenantId });

      const firebaseUser = getAuth().currentUser;
      if (firebaseUser) {
        const idTokenResult = await firebaseUser.getIdTokenResult();
        const claims = idTokenResult.claims as { permissions: string[]; isHubAdmin: boolean };
        setState({
          user:        mappedUser,
          permissions: claims.permissions ?? [],
          isHubAdmin:  claims.isHubAdmin  ?? false,
          loading:     false,
          error:       '',
        });
      } else {
        setState({ user: mappedUser, permissions: [], isHubAdmin: false, loading: false, error: '' });
      }
    } catch {
      clearStorage(TENANT_KEY);
      setState({ user: null, permissions: [], isHubAdmin: false, loading: false, error: '' });
    }
  };

  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}, [slug, env, hubId, tenantId]);


  // ── Login ───────────────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    if (!tenant) return false;
    setState(prev => ({ ...prev, loading: true, error: '' }));
    isLoggingIn.current = true;

    try {
      const fn = httpsCallable<
        { slug: string; env: string; email: string; password: string },
        { token: string; user: Partial<TenantUser> }
      >(getFunctions(), 'validateTenantUser');

      const { data } = await fn({ slug, env, email, password });

      let user = mapTenantUser(data.user, { hubId, tenantId });

      // Write storage BEFORE signInWithCustomToken so that when onAuthStateChanged
      // fires (triggered by the sign-in below), it finds a valid session and does
      // not boot the user. This eliminates the stale-IndexedDB race condition.
      writeStorage(TENANT_KEY, { type: 'tenant', slug, env, user } satisfies Omit<TenantSession, 'token'>);

      // Sign into Firebase — SDK manages ID token refresh automatically.
      // We do NOT store the custom token; Firebase persists its own session.
      const credential    = await signInWithCustomToken(getAuth(), data.token);
      const idTokenResult = await credential.user.getIdTokenResult();
      const rawRole   = (idTokenResult.claims.role as string) ?? data.user.role ?? 'user';
      const claimsRole = toHubRole(rawRole);  // converts string → HubRole safely
      user       = mapTenantUser({ ...data.user, role: claimsRole }, { hubId, tenantId });
      const claims = idTokenResult.claims as {
        permissions:  string[];
        isHubAdmin:   boolean;
      };

      setState({
          user,
          permissions: claims.permissions ?? [],
          isHubAdmin:  claims.isHubAdmin  ?? false,
          loading:     false,
          error:       '',
        });
      return true;
    } catch (err: any) {
      // Clean up the pre-written session if sign-in actually failed
      clearStorage(TENANT_KEY);
      const msg = err?.details?.message ?? err?.message ?? 'Invalid credentials';
      setState({ user: null,  permissions:[],isHubAdmin:false,loading: false, error: msg });
      return false;
    } finally {
      isLoggingIn.current = false;
    }
  }, [tenant, slug, env, hubId, tenantId]);

  // ── Logout ──────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    clearStorage(TENANT_KEY);
    await getAuth().signOut(); // also clears Firebase's own IndexedDB session
    setState({ user: null,  permissions:[],isHubAdmin:false,loading: false, error: '' });
  }, []);

  const clearError = useCallback(() => setState(p => ({ ...p, error: '' })), []);

  return { ...state, login, logout, clearError };
}

// ─────────────────────────────────────────────────────────────────────────────
// useAdminAuth — global product admin auth (used by AdminDashboard)
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminAuthState {
  user:               AdminUser | null;
  loading:            boolean;
  error:              string;
  forcePasswordReset: boolean;
}

export function useAdminAuth(env?: FloPlugEnv) {
  const [state, setState] = useState<AdminAuthState>({
    user:               null,
    loading:            true,
    error:              '',
    forcePasswordReset: false,
  });

  // Guard: prevents onAuthStateChanged from signing the user out while a
  // login is actively in progress (fixes the stale-IndexedDB race condition).
  const isLoggingIn = useRef(false);

  // ── Restore session on mount ────────────────────────────────────────────────
  useEffect(() => {
    const auth = getAuth();

    const unsubscribe = onAuthStateChanged(auth, firebaseUser => {
      // Never interrupt an in-progress login — the login callback will set
      // state directly once signInWithCustomToken resolves.
      if (isLoggingIn.current) return;

      if (!firebaseUser) {
        clearStorage(ADMIN_KEY);
        setState({ user: null, loading: false, error: '', forcePasswordReset: false });
        return;
      }

      const session = readStorage<AdminSession>(ADMIN_KEY);
      if (!session) {
        // Firebase knows who they are but we lost the profile — force re-login.
        // Do NOT call signOut() here: if the user is mid-login in another tab
        // or the write just hasn't landed yet, signing out would break them.
        // The next natural expiry or explicit logout will clean up Firebase state.
        clearStorage(ADMIN_KEY);
        setState({ user: null, loading: false, error: '', forcePasswordReset: false });
        return;
      }

      if (env && session.env !== env) {
        clearStorage(ADMIN_KEY);
        getAuth().signOut();
        setState({ user: null, loading: false, error: '', forcePasswordReset: false });
        return;
      }

      const user = mapAdminUser(session.user as Partial<AdminUser>);
      setState({ user, loading: false, error: '', forcePasswordReset: user.forcePasswordReset });
    });

    return () => unsubscribe();
  }, [env]);

  // ── Login ───────────────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setState(prev => ({ ...prev, loading: true, error: '' }));
    isLoggingIn.current = true;

    try {
      const fn = httpsCallable<
        { email: string; password: string; env: string },
        { token: string; user: Partial<AdminUser> }
      >(getFunctions(), 'validateAdminUser');

      const { data } = await fn({ email, password, env: env ?? 'dev' });

      const user = mapAdminUser(data.user);

      // Write storage BEFORE signInWithCustomToken so that when onAuthStateChanged
      // fires (triggered by the sign-in below), it finds a valid session and does
      // not boot the user. This eliminates the stale-IndexedDB race condition.
      writeStorage(ADMIN_KEY, { type: 'admin', env: env ?? 'dev', user } satisfies Omit<AdminSession, 'token'>);

      // Then sign into Firebase — onAuthStateChanged will now find the session above.
      await signInWithCustomToken(getAuth(), data.token);

      setState({ user, loading: false, error: '', forcePasswordReset: user.forcePasswordReset });
      return true;
    } catch (err: any) {
      // Clean up the pre-written session if sign-in actually failed
      clearStorage(ADMIN_KEY);
      const msg = err?.details?.message ?? err?.message ?? 'Invalid credentials';
      setState({ user: null, loading: false, error: msg, forcePasswordReset: false });
      return false;
    } finally {
      isLoggingIn.current = false;
    }
  }, [env]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const clearForcePasswordReset = useCallback(() => {
    const session = readStorage<AdminSession>(ADMIN_KEY);
    if (!session) return;
    const updatedUser = mapAdminUser({ ...session.user, forcePasswordReset: false });
    writeStorage(ADMIN_KEY, { ...session, user: updatedUser });
    setState(prev => ({ ...prev, forcePasswordReset: false, user: updatedUser }));
  }, []);

  const logout = useCallback(async () => {
    clearStorage(ADMIN_KEY);
    await getAuth().signOut(); // also clears Firebase's own IndexedDB session
    setState({ user: null, loading: false, error: '', forcePasswordReset: false });
  }, []);

  const clearError = useCallback(() => setState(p => ({ ...p, error: '' })), []);

  return { ...state, login, logout, clearError, clearForcePasswordReset };
}
