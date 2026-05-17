import type { HubEntitlements } from './hubEntitlements.js';
export interface HubBranding {
    displayTitle?: string;
    logoBase64?: string;
    accentColor?: string;
}
export interface HubTenant {
    tenantId: string;
    tenantName: string;
    tenantType: string;
    isActive: boolean;
    slug: string;
}
export interface HubDoc {
    id: string;
    hubName: string;
    hubSlug: string;
    tierId: string;
    contactEmailId: string;
    isActive: boolean;
    branding?: HubBranding;
    tenants?: HubTenant[];
    /** Connectors + FloKits this hub may use (set at provision) */
    entitlements?: HubEntitlements;
    createdAt?: any;
    updatedAt?: any;
}
export type { HubEntitlements, FloKitEntitlementRef, TenantEntitlementsDoc } from './hubEntitlements.js';
export interface FloInvokePermissions {
    allowedUids: string[];
    allowedRoles: string[];
    canRunInDesigner: boolean;
}
