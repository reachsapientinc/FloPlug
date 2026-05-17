import type { PlugCredentialValues } from './plug.js';
/**
 * FloConnection — hub-scoped credentials + endpoint context for a connector.
 * Path: FloPlugHubs/{hubId}/Tenants/{tenantId}/FloConnections/{connectionId}
 *
 * Plugs reference a connection via PlugConfig.connectionId instead of embedding credentials.
 */
export interface FloConnectionDoc {
    id: string;
    hubId: string;
    tenantId: string;
    connectorId: string;
    connectorLabel?: string;
    name: string;
    authProtocol: string;
    /** Human label, e.g. "Production", "Sandbox" */
    environmentLabel?: string;
    hostname?: string;
    /** Target-system tenant / company id */
    tenantKey?: string;
    credentials: PlugCredentialValues;
    isActive: boolean;
    createdBy?: string;
    updatedBy?: string;
    createdAt?: unknown;
    updatedAt?: unknown;
}
