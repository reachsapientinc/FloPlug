import type { FloInvokePermissions } from './hubTypes.js';
export interface DesignerProps {
    hubId: string;
    tenantId: string;
    tenantType: string;
    userId: string;
    userRole: string;
    workspaceIds: string[];
    floId?: string;
    isAdmin?: boolean;
}
export interface WorkspaceMeta {
    id: string;
    workspaceName: string;
    isDefault: boolean;
    defaultToLoad: boolean;
}
export interface FloMeta {
    id: string;
    name: string;
    shortCode: string;
    integrationId: string;
    workspaceId: string;
    status: string;
    isDefault?: boolean;
    defaultToLoad?: boolean;
    invokePermissions?: FloInvokePermissions;
}
export interface NewFloForm {
    name: string;
    shortCode: string;
    integrationId: string;
}
