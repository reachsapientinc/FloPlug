//import * as admin from 'firebase-admin';

/**
 * functions/src/types/types.ts
 * Backend types — Node.js / Firebase Functions only.
 * Never import this in frontend code.
 */
import type { FieldValue } from 'firebase-admin/firestore';
import { HubRole,FloPlugEnv,AdminRole,PortalMode } from '@floplug/shared';

// ── Enums ─────────────────────────────────────────────────────────────────────



export interface FloNode { id: string; type: string; data: Record<string, unknown>; }
export interface FloEdge { source: string; target: string; }

// ── Branding ──────────────────────────────────────────────────────────────────

export interface TenantBranding {
  logoBase64?:   string;
  accentColor?:  string;
  displayTitle?: string;
}

// ── Tenant ────────────────────────────────────────────────────────────────────

export interface TenantConfig {
  tenantId:   string;
  hubId:      string;
  tenantName: string;
  tenantType: FloPlugEnv;
  isActive:   boolean;
  slug:       string;
  env:        FloPlugEnv;
  branding?:  TenantBranding;
}

// ── Users ─────────────────────────────────────────────────────────────────────

export interface AdminUser {
  uid:                string;
  email:              string;
  displayName?:       string;
  role:               AdminRole;
  allowedEnvs:        FloPlugEnv[];
  isActive:           boolean;
  forcePasswordReset: boolean;
}

export interface TenantUser {
  uid:                string;
  email:              string;
  displayName?:       string;
  hubId:              string;
  tenantId:           string;
  workspaceIds:       string[];
  role:               HubRole;
  isActive:           boolean;
  forcePasswordReset: boolean;  // ✅ added for hub users
}

// ── Cloud Function payloads ───────────────────────────────────────────────────

export interface InviteAdminData {
  email:       string;
  displayName: string;
  role:        AdminRole;
  allowedEnvs: FloPlugEnv[];
  hubId:       string;
}

export interface InviteHubUserData {
  email:        string;
  displayName:  string;
  role:         HubRole;
  hubId:        string;
  tenantId:     string;
  workspaceIds: string[];
}

export interface UpdateAdminRoleData {
  targetUid:           string;
  role?:               AdminRole;
  allowedEnvs?:        FloPlugEnv[];
  isActive?:           boolean;
  forcePasswordReset?: boolean;
}

export interface UpdateHubUserRoleData {
  hubId:               string;
  tenantId:            string;
  targetUid:           string;
  role?:               HubRole;
  workspaceIds?:       string[];
  isActive?:           boolean;
  forcePasswordReset?: boolean;  // ✅ added for hub users
}

import type { FloKitEntitlementRef } from '@floplug/shared';

export interface EnergizeData {
  hubName:        string;
  hubSlug:        string;
  tierId:         string;
  authMethod:     string;
  contactEmailId: string;
  branding: {
    displayTitle: string;
    logoBase64:   string;
    accentColor:  string;
  };
  entitlements: {
    connectorIds: string[];
    floKits:        FloKitEntitlementRef[];
  };
}

export interface AppSettings {
  isInternal:   boolean;
  rootDomain:   string;
  supportEmail: string;
}

export interface FilterNodeData {
  field:    string;
  operator: string;
  value:    string;
}

// ── Audit ─────────────────────────────────────────────────────────────────────
// Uses FieldValue so Firestore can set server-side timestamps.
// Never use this interface on the frontend — use FloPlugAuditClient instead.

export interface FloPlugAudit {
  isActive:      boolean;
  effectiveDate: FieldValue;
  createdAt:     FieldValue;
  updatedAt:     FieldValue;
  createdBy:     string;
  updatedBy:     string;
  source:        string;
  shortCode:     string;
  integrationId: string;
}

// ── Resolver ──────────────────────────────────────────────────────────────────

export interface ResolveResult {
  mode:    PortalMode;
  env?:    FloPlugEnv;
  config?: TenantConfig;
}

export interface ValidateAdminData {
  email:    string;
  password: string;  // received but not verified server-side (see note below)
  env:      string;
}

export interface FlowContext {
  // cStream: The "Current Stream" moving through the nodes (replaces payload)
  cStream: any; 
  
  // global: Persists from the Start node to the End node, including sub-flos
  global: Record<string, any>;
  
  // local: Only exists within the current scope (a Loop or a Sub-flo)
  local: Record<string, any>;
  
  // internal log array for execution tracking
  logs: string[];
}