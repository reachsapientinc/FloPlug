/**
 * hubActionHandler.ts
 *
 * Custom hook — usePlugManagerActions
 * Centralises all Cloud Function calls for PlugManager.
 *
 * Auth model:
 *  - requireAdmin() guards mutations client-side (defence-in-depth)
 *  - Cloud Functions are the authoritative enforcement point
 *  - isAdmin is a boolean derived from the signed Firebase token claim —
 *    this file never compares role strings
 */

import { useCallback }           from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { loadAuthProtocols, loadConnectors } from '../types/AuthConnectorTypes';
import type { TenantUser }       from '@floplug/shared';
import type {
  AuthProtocol, ConnectorDoc, PlugConfig,
}                                from '@floplug/shared';

// ── Types (re-exported so PlugManager can import from one place) ──────────────

export interface FloMeta {
  id:          string;
  name:        string;
  shortCode:   string;
  workspaceId: string;
}

export type PlugSummary = Omit<PlugConfig, 'credentials'>;

// ── Internal CF caller (scoped to this module) ────────────────────────────────

const cf = <Req, Res>(name: string) =>
  httpsCallable<Req, Res>(getFunctions(), name);

// ── Hook return shape ─────────────────────────────────────────────────────────

export interface PlugManagerActions {
  fetchAll:             () => Promise<void>;
  handleDeactivatePlug: (plug: PlugSummary) => Promise<void>;
  handleDeactivateUser: (u: TenantUser)     => Promise<void>;
  handleReactivateUser: (u: TenantUser)     => Promise<void>;
  handleUserInvited:    (u: TenantUser)     => void;
  handleUserSaved:      (u: TenantUser)     => void;
  handlePlugSaved:      (plug: PlugSummary) => void;
}

// ── Hook params ───────────────────────────────────────────────────────────────

export interface UsePlugManagerActionsParams {
  hubId:         string;
  tenantId:      string;
  isAdmin:       boolean;
  setPlugs:      React.Dispatch<React.SetStateAction<PlugSummary[]>>;
  setUsers:      React.Dispatch<React.SetStateAction<TenantUser[]>>;
  setFlos:      React.Dispatch<React.SetStateAction<FloMeta[]>>;
  setConnectors: React.Dispatch<React.SetStateAction<ConnectorDoc[]>>;
  setProtocols:  React.Dispatch<React.SetStateAction<AuthProtocol[]>>;
  setLoading:    React.Dispatch<React.SetStateAction<boolean>>;
  setLoadError:  React.Dispatch<React.SetStateAction<string>>;
}

// ═════════════════════════════════════════════════════════════════════════════
// usePlugManagerActions
// ═════════════════════════════════════════════════════════════════════════════

export function usePlugManagerActions({
  hubId,
  tenantId,
  isAdmin,
  setPlugs,
  setUsers,
  setFlos,
  setConnectors,
  setProtocols,
  setLoading,
  setLoadError,
}: UsePlugManagerActionsParams): PlugManagerActions {

  // ── Client-side auth guard ─────────────────────────────────────────────────
  // Throws before the network call so the CF never receives an unauthorised request.
  // The Cloud Function still enforces its own check — this is defence-in-depth.
  const requireAdmin = useCallback((action: string) => {
    if (!isAdmin) {
      throw new Error(`Unauthorised: '${action}' requires hub_admin role.`);
    }
  }, [isAdmin]);

  // ── fetchAll ───────────────────────────────────────────────────────────────
  // All three CFs strip sensitive fields server-side before returning.
  const fetchAll = useCallback(async () => {
    if (!isAdmin) {
      setLoadError('Unauthorised: only hub admins can load Hub Manager data.');
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const [plugRes, userRes, flowRes, loadedConnectors, loadedProtocols] = await Promise.all([
        cf<{ hubId: string; tenantId: string }, { plugs: PlugSummary[] }>('getHubPlugs')({ hubId, tenantId }),
        cf<{ hubId: string; tenantId: string }, { users: TenantUser[] }>('getHubUsers')({ hubId, tenantId }),
        cf<{ hubId: string; tenantId: string }, { flos: FloMeta[] }>('getHubFlos')({ hubId, tenantId }),
        loadConnectors(),
        loadAuthProtocols(),
      ]);
      setPlugs(plugRes.data.plugs     ?? []);
      setUsers(userRes.data.users     ?? []);
      setFlos(flowRes.data.flos     ?? []);
      setConnectors(loadedConnectors);
      setProtocols(loadedProtocols);
    } catch (e: any) {
      setLoadError(e?.message ?? 'Failed to load hub data');
    } finally {
      setLoading(false);
    }
  }, [hubId, tenantId, isAdmin, setPlugs, setUsers, setFlos, setConnectors, setProtocols, setLoading, setLoadError]);

  // ── deactivatePlug — admin-only ────────────────────────────────────────────
  const handleDeactivatePlug = useCallback(async (plug: PlugSummary) => {
    try {
      requireAdmin('deactivatePlug');
      await cf<{ hubId: string; tenantId: string; plugId: string }, void>
        ('deactivatePlug')({ hubId, tenantId, plugId: plug.id });
      setPlugs(prev => prev.map(p => p.id === plug.id ? { ...p, isActive: false } : p));
    } catch (e: any) {
      alert(e?.message ?? 'Failed to deactivate plug');
    }
  }, [hubId, tenantId, requireAdmin, setPlugs]);

  // ── deactivateHubUser — admin-only ─────────────────────────────────────────
  const handleDeactivateUser = useCallback(async (u: TenantUser) => {
    try {
      requireAdmin('deactivateHubUser');
      await cf<{ hubId: string; tenantId: string; targetUid: string }, void>
        ('deactivateHubUser')({ hubId, tenantId, targetUid: u.uid });
      setUsers(prev => prev.map(x => x.uid === u.uid ? { ...x, isActive: false } : x));
    } catch (e: any) {
      alert(e?.message ?? 'Failed to deactivate user');
    }
  }, [hubId, tenantId, requireAdmin, setUsers]);

  // ── reactivateHubUser — admin-only ─────────────────────────────────────────
  const handleReactivateUser = useCallback(async (u: TenantUser) => {
    try {
      requireAdmin('reactivateHubUser');
      await cf<{ hubId: string; tenantId: string; targetUid: string }, void>
        ('reactivateHubUser')({ hubId, tenantId, targetUid: u.uid });
      setUsers(prev => prev.map(x => x.uid === u.uid ? { ...x, isActive: true } : x));
    } catch (e: any) {
      alert(e?.message ?? 'Failed to reactivate user');
    }
  }, [hubId, tenantId, requireAdmin, setUsers]);

  // ── Modal state-sync callbacks ─────────────────────────────────────────────
  // inviteHubUser and updateHubUserRole are called inside InviteUserModal /
  // EditUserModal. The CFs enforce hub_admin there. These callbacks simply
  // sync the returned data back into the parent collection state.

  const handleUserInvited = useCallback((u: TenantUser) => {
    setUsers(prev => [...prev, u]);
  }, [setUsers]);

  const handleUserSaved = useCallback((updated: TenantUser) => {
    setUsers(prev => prev.map(u => u.uid === updated.uid ? updated : u));
  }, [setUsers]);

  const handlePlugSaved = useCallback((plug: PlugSummary) => {
    setPlugs(prev => {
      const idx = prev.findIndex(p => p.id === plug.id);
      return idx >= 0
        ? prev.map(p => p.id === plug.id ? plug : p)
        : [...prev, plug];
    });
  }, [setPlugs]);

  return {
    fetchAll,
    handleDeactivatePlug,
    handleDeactivateUser,
    handleReactivateUser,
    handleUserInvited,
    handleUserSaved,
    handlePlugSaved,
  };
}