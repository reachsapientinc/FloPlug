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
    createdAt?: any;
    updatedAt?: any;
}
export interface FloInvokePermissions {
    allowedUids: string[];
    allowedRoles: string[];
    canRunInDesigner: boolean;
}
