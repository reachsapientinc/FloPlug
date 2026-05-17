/**
 * types.ts — Single source of truth for all FloPlug shared types.
 * Used by: frontend hooks, Cloud Functions, admin scripts.
 *
 * Import in functions with .js extension:
 *   import type { AdminUser } from './types/types.js';
 */
import type { PlugConfig } from './plug.js';
export type FloPlugEnv = 'dev' | 'stage' | 'sb' | 'prod';
export type PortalMode = 'admin' | 'tenant' | 'marketing';
export type AdminRole = 'product_admin' | 'developer' | 'admin_sales';
export type HubRole = 'hub_admin' | 'user';
export interface TenantBranding {
    logoBase64?: string;
    accentColor?: string;
    displayTitle?: string;
}
export interface TenantConfig {
    tenantId: string;
    hubId: string;
    tenantName: string;
    tenantType: FloPlugEnv;
    isActive: boolean;
    slug: string;
    env: FloPlugEnv;
    branding?: TenantBranding;
}
export interface AdminUser {
    uid: string;
    email: string;
    displayName?: string;
    role: AdminRole;
    allowedEnvs: FloPlugEnv[];
    forcePasswordReset: boolean;
}
export interface TenantUser {
    uid: string;
    email: string;
    displayName?: string;
    hubId: string;
    tenantId: string;
    workspaceIds: string[];
    role: HubRole;
    permissions: string[];
    isHubAdmin: boolean;
    isActive: boolean;
    forcePasswordReset: boolean;
}
export interface InviteAdminData {
    email: string;
    displayName: string;
    role: AdminRole;
    allowedEnvs: FloPlugEnv[];
}
export interface InviteHubUserData {
    email: string;
    displayName: string;
    role: HubRole;
    hubId: string;
    tenantId: string;
    workspaceIds: string[];
}
export interface UpdateAdminRoleData {
    targetUid: string;
    role?: AdminRole;
    allowedEnvs?: FloPlugEnv[];
    isActive?: boolean;
    forcePasswordReset?: boolean;
}
export interface UpdateHubUserRoleData {
    hubId: string;
    tenantId: string;
    targetUid: string;
    role?: HubRole;
    workspaceIds?: string[];
    isActive?: boolean;
}
import type { ProvisionEntitlementsInput, ProvisionEntitlementsInputLegacy } from './hubEntitlements.js';
export interface EnergizeData {
    hubName: string;
    hubSlug: string;
    tierId: string;
    authMethod: string;
    contactEmailId: string;
    branding: {
        displayTitle: string;
        logoBase64: string;
        accentColor: string;
    };
    entitlements: ProvisionEntitlementsInput | ProvisionEntitlementsInputLegacy;
}
/** Tier document fields used during hub provision */
export interface FloPlugTierDoc {
    tierName?: string;
    tierShortCode?: string;
    eligibleTenantTypes?: string[];
    /** Max tier-controlled connectors per hub (0 = unlimited) */
    inclConnectors?: number;
}
export interface AppSettings {
    isInternal: boolean;
    rootDomain: string;
    supportEmail: string;
}
export interface FilterNodeData {
    field: string;
    operator: string;
    value: string;
}
export interface TenantSession {
    type: 'tenant';
    slug: string;
    env: FloPlugEnv;
    token: string;
    user: TenantUser;
}
export interface AdminSession {
    type: 'admin';
    env: FloPlugEnv;
    token: string;
    user: AdminUser;
}
export interface ResolveResult {
    mode: PortalMode;
    env?: FloPlugEnv;
    config?: TenantConfig;
}
export interface FloPlugAudit {
    isActive: boolean;
    effectiveDate: Date;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    updatedBy: string;
    source: string;
    shortCode: string;
    integrationId: string;
}
export type PlugSummary = Omit<PlugConfig, 'credentials'>;
export interface ActionHandlers {
    fetchAll: () => Promise<void>;
    handleDeactivatePlug: (plug: PlugSummary) => Promise<void>;
    handleDeactivateUser: (u: TenantUser) => Promise<void>;
    handleReactivateUser: (u: TenantUser) => Promise<void>;
    handleUserInvited: (u: TenantUser) => void;
    handleUserSaved: (u: TenantUser) => void;
    handlePlugSaved: (plug: PlugSummary) => void;
}
