/**
 * frontend/src/types/types.ts
 * Frontend types — browser only.
 * Never import firebase-admin or Node.js packages here.
 */

// ── Enums ─────────────────────────────────────────────────────────────────────

export type FloPlugEnv = 'dev' | 'stage' | 'sb' | 'prod';
export type PortalMode = 'admin' | 'tenant' | 'marketing';
export type AdminRole  = 'product_admin' | 'developer' | 'admin_sales';
export type HubRole    = 'hub_admin' | 'user';

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
// These mirror the backend interfaces exactly — keep them in sync manually
// or via a code review checklist when either side changes.

export interface InviteAdminData {
  email:       string;
  displayName: string;
  role:        AdminRole;
  allowedEnvs: FloPlugEnv[];
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
// Frontend version uses Date instead of FieldValue.
// When reading from Firestore on the client, Firestore SDK converts
// Timestamps to JS Date automatically.

export interface FloPlugAuditClient {
  isActive:      boolean;
  effectiveDate: Date;
  createdAt:     Date;
  updatedAt:     Date;
  createdBy:     string;
  updatedBy:     string;
  source:        string;
  shortCode:     string;
  integrationId: string;
}

// ── Session shapes ────────────────────────────────────────────────────────────

export interface TenantSession {
  type:  'tenant';
  slug:  string;
  env:   FloPlugEnv;
  token?: string;
  user:  TenantUser;
}

export interface AdminSession {
  type:  'admin';
  env:   FloPlugEnv;
  token: string;
  user:  AdminUser;
}

// ── Resolver ──────────────────────────────────────────────────────────────────

export interface ResolveResult {
  mode:    PortalMode;
  env?:    FloPlugEnv;
  config?: TenantConfig;
}

export interface FloContext {
  // cStream: The "Current Stream" moving through the nodes (replaces payload)
  cStream: any; 
  
  // global: Persists from the Start node to the End node, including sub-flos
  global: Record<string, any>;
  
  // local: Only exists within the current scope (a Loop or a Sub-flow)
  local: Record<string, any>;
  
  // internal log array for execution tracking
  logs: string[];
}