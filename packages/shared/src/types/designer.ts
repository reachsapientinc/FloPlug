import type { FloInvokePermissions } from './hubTypes.js';
export interface DesignerProps {
  hubId:        string;
  tenantId:     string;
  tenantType:   string;
  userId:       string;
  userRole:     string;
  workspaceIds: string[];
  floId?:       string;
  isAdmin?:     boolean;
  permissions?: string[];
  onSignOut?:   () => void;
  onActiveFloChange?: (flo: FloMeta | null) => void;
}

export interface WorkspaceMeta {
  id:            string;
  workspaceName: string;
  isDefault:     boolean;
  defaultToLoad: boolean;
}

export type FloCanvasStatus = 'idle' | 'draft' | 'active' | 'invalid';

export interface FloMeta {
  id:             string;
  name:           string;
  shortCode:      string;
  integrationId:  string;
  workspaceId:    string;
  status:         string;
  /** draft | published — set when user publishes */
  publishState?:  'draft' | 'published';
  validationStatus?: 'valid' | 'invalid' | 'warnings' | 'unknown';
  validationErrorCount?: number;
  validationWarningCount?: number;
  lastValidatedAt?: string;
  /** @deprecated use defaultToLoad — workspace default flo */
  isDefault?:     boolean;
  /** Opens automatically when entering this workspace */
  defaultToLoad?: boolean;
  publishedVersion?: number;
  hasUnpublishedChanges?: boolean;
  invokePermissions?: FloInvokePermissions;
}

export interface NewFloForm {
  name:          string;
  shortCode:     string;
  integrationId: string;
}

