/**
 * hubActionHandler.ts
 *
 * Custom hook — usePlugManagerActions
 * Centralises all Cloud Function calls for PlugManager and FloConnectionManager.
 *
 * Auth model:
 *  - requireAdmin() guards mutations client-side (defence-in-depth)
 *  - Cloud Functions are the authoritative enforcement point
 *  - isAdmin is a boolean derived from the signed Firebase token claim
 */

import { useCallback }               from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { loadAuthProtocols, loadConnectors } from '../types/AuthConnectorTypes';
import type { TenantUser }           from '@floplug/shared';
import type {
  AuthProtocol,
  ConnectorDoc,
  PlugConfig,
  FloConnectionSafe,
}                                    from '@floplug/shared';
import type { AddActionNodeParams,HubActionNodeDoc }  from '@floplug/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FloMeta {
  id:          string;
  name:        string;
  shortCode:   string;
  workspaceId: string;
}

export type PlugSummary = Omit<PlugConfig, 'credentials'>;

// ── Internal CF caller ────────────────────────────────────────────────────────

const cf = <Req, Res>(name: string) =>
  httpsCallable<Req, Res>(getFunctions(), name);

// ── Hook return shape ─────────────────────────────────────────────────────────

export interface PlugManagerActions {
  // ── existing ──────────────────────────────────────────────────────────────
  fetchAll:                    () => Promise<void>;
  handleDeactivatePlug:        (plug: PlugSummary) => Promise<void>;
  handleDeactivateUser:        (u: TenantUser)     => Promise<void>;
  handleReactivateUser:        (u: TenantUser)     => Promise<void>;
  handleUserInvited:           (u: TenantUser)     => void;
  handleUserSaved:             (u: TenantUser)     => void;
  handlePlugSaved:             (plug: PlugSummary) => void;

  // ── FloConnection ─────────────────────────────────────────────────────────
  handleSaveFloConnection:     (conn: SaveFloConnectionPayload) => Promise<FloConnectionSafe>;
  handleDeactivateFloConnection: (connectionId: string) => Promise<void>;
  handleSaveActionNode:        (params: AddActionNodeParams) => Promise<string>;
}

// ── Hook params ───────────────────────────────────────────────────────────────

export interface UsePlugManagerActionsParams {
  hubId:            string;
  tenantId:         string;
  isAdmin:          boolean;
  userId:           string;                 // needed for audit fields on CF calls
  setPlugs:         React.Dispatch<React.SetStateAction<PlugSummary[]>>;
  setUsers:         React.Dispatch<React.SetStateAction<TenantUser[]>>;
  setFlos:          React.Dispatch<React.SetStateAction<FloMeta[]>>;
  setConnectors:    React.Dispatch<React.SetStateAction<ConnectorDoc[]>>;
  setProtocols:     React.Dispatch<React.SetStateAction<AuthProtocol[]>>;
  setFloConnections: React.Dispatch<React.SetStateAction<FloConnectionSafe[]>>;
  setActionNodes:   React.Dispatch<React.SetStateAction<HubActionNodeDoc[]>>;
  setLoading:       React.Dispatch<React.SetStateAction<boolean>>;
  setLoadError:     React.Dispatch<React.SetStateAction<string>>;
}

// ── SaveFloConnectionPayload (what the form sends to the handler) ──────────────

export interface SaveFloConnectionPayload {
  connectionId?:    string;   // omit on create — handler will generate one
  connectorId:      string;
  connectorLabel?:  string;
  authProtocol:     string;
  name:             string;
  environmentLabel?: string;
  hostname?:        string;
  tenantKey?:       string;
  credentials:      Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// usePlugManagerActions
// ─────────────────────────────────────────────────────────────────────────────

export function usePlugManagerActions({
  hubId,
  tenantId,
  isAdmin,
  userId,
  setPlugs,
  setUsers,
  setFlos,
  setConnectors,
  setProtocols,
  setFloConnections,
  setActionNodes,
  setLoading,
  setLoadError,
}: UsePlugManagerActionsParams): PlugManagerActions {

  // ── Client-side auth guard ────────────────────────────────────────────────
  const requireAdmin = useCallback((action: string) => {
    if (!isAdmin) {
      throw new Error(`Unauthorised: '${action}' requires hub_admin role.`);
    }
  }, [isAdmin]);

  // ── fetchAll ──────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!isAdmin) {
      setLoadError('Unauthorised: only hub admins can load Hub Manager data.');
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const [
        plugRes, userRes, flowRes,
        loadedConnectors, loadedProtocols,
        connRes, nodesRes,
      ] = await Promise.all([
        cf<{ hubId: string; tenantId: string }, { plugs: PlugSummary[] }>
          ('getHubPlugs')({ hubId, tenantId }),
        cf<{ hubId: string; tenantId: string }, { users: TenantUser[] }>
          ('getHubUsers')({ hubId, tenantId }),
        cf<{ hubId: string; tenantId: string }, { flos: FloMeta[] }>
          ('getHubFlos')({ hubId, tenantId }),
        loadConnectors(),
        loadAuthProtocols(),
        cf<{ hubId: string; tenantId: string }, { connections: FloConnectionSafe[] }>
          ('getFloConnections')({ hubId, tenantId }),
        cf<{ hubId: string; tenantId: string }, { nodes: HubActionNodeDoc[] }>
          ('getHubActionNodes')({ hubId, tenantId }),
      ]);

      setPlugs(plugRes.data.plugs              ?? []);
      setUsers(userRes.data.users              ?? []);
      setFlos(flowRes.data.flos                ?? []);
      setConnectors(loadedConnectors);
      setProtocols(loadedProtocols);
      setFloConnections(connRes.data.connections ?? []);
      setActionNodes(nodesRes.data.nodes       ?? []);
    } catch (e: any) {
      setLoadError(e?.message ?? 'Failed to load hub data');
    } finally {
      setLoading(false);
    }
  }, [
    hubId, tenantId, isAdmin,
    setPlugs, setUsers, setFlos,
    setConnectors, setProtocols,
    setFloConnections, setActionNodes,
    setLoading, setLoadError,
  ]);

  // ── deactivatePlug ────────────────────────────────────────────────────────
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

  // ── deactivateHubUser ─────────────────────────────────────────────────────
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

  // ── reactivateHubUser ─────────────────────────────────────────────────────
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

  // ── Modal state-sync callbacks ────────────────────────────────────────────
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

  // ── FloConnection: save (create or update) ────────────────────────────────
  const handleSaveFloConnection = useCallback(async (
    payload: SaveFloConnectionPayload,
  ): Promise<FloConnectionSafe> => {
    requireAdmin('saveFloConnection');

    // Generate a connectionId on the client when creating a new connection.
    // Uses slugified name + timestamp suffix to guarantee uniqueness.
    const connectionId = payload.connectionId
      ?? `${payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now()}`;

    await cf<Record<string, unknown>, { connectionId: string; created: boolean }>(
      'saveFloConnection',
    )({
      hubId,
      tenantId,
      userId,
      connectionId,
      ...payload,
    });

    // Re-fetch all connections to get the server-side timestamps and merged state
    const res = await cf<
      { hubId: string; tenantId: string },
      { connections: FloConnectionSafe[] }
    >('getFloConnections')({ hubId, tenantId });

    const updated = res.data.connections ?? [];
    setFloConnections(updated);

    const saved = updated.find(c => c.id === connectionId);
    if (!saved) throw new Error('Connection saved but not found in refresh — check Firestore.');
    return saved;
  }, [hubId, tenantId, userId, requireAdmin, setFloConnections]);

  // ── FloConnection: deactivate ─────────────────────────────────────────────
  const handleDeactivateFloConnection = useCallback(async (
    connectionId: string,
  ): Promise<void> => {
    try {
      requireAdmin('deactivateFloConnection');
      await cf<
        { hubId: string; tenantId: string; connectionId: string },
        { connectionId: string; deactivated: boolean }
      >('deactivateFloConnection')({ hubId, tenantId, connectionId });

      setFloConnections(prev =>
        prev.map(c => c.id === connectionId ? { ...c, isActive: false } : c),
      );
    } catch (e: any) {
      alert(e?.message ?? 'Failed to deactivate connection');
    }
  }, [hubId, tenantId, requireAdmin, setFloConnections]);

  // ── ActionNode: save hub-scoped instance ──────────────────────────────────
  const handleSaveActionNode = useCallback(async (
    params: AddActionNodeParams,
  ): Promise<string> => {
    requireAdmin('saveHubActionNode');
    const res = await cf<
      Record<string, unknown>,
      { instanceId: string; created: boolean }
    >('saveHubActionNode')({
      hubId,
      tenantId,
      floKitId:             params.floKitId,
      connectorId:          params.connectorId,
      actionIds:            params.actionIds,
      allowedConnectionIds: params.allowedConnectionIds,
      connectionId:         params.defaultConnectionId,
      outputTarget:         params.outputTarget,
      varName:              params.varName,
      floActionName:        params.floActionName,
      flaLabel:             params.flaLabel,
      description:          params.description,
    });

    const nodesRes = await cf<
      { hubId: string; tenantId: string },
      { nodes: HubActionNodeDoc[] }
    >('getHubActionNodes')({ hubId, tenantId });
    setActionNodes(nodesRes.data.nodes ?? []);

    return res.data.instanceId;
  }, [hubId, tenantId, requireAdmin, setActionNodes]);

  return {
    fetchAll,
    handleDeactivatePlug,
    handleDeactivateUser,
    handleReactivateUser,
    handleUserInvited,
    handleUserSaved,
    handlePlugSaved,
    handleSaveFloConnection,
    handleDeactivateFloConnection,
    handleSaveActionNode,
  };
}
