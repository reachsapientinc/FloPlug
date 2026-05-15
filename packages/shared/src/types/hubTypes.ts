// ── Hub doc (used by HubManagement) ───────────────────────────────────────────

// export type HubRole    = 'hub_admin' | 'user';
// export type FloPlugEnv = 'dev' | 'stage' | 'sb' | 'prod';
// export type PortalMode = 'admin' | 'tenant' | 'marketing';
// export type AdminRole  = 'product_admin' | 'developer' | 'admin_sales';

export interface HubBranding {
  displayTitle?: string;
  logoBase64?:   string;
  accentColor?:  string;
}

export interface HubTenant {
  tenantId:    string;
  tenantName:  string;
  tenantType:  string;   // 'dev' | 'stage' | 'sb' | 'prod'
  isActive:    boolean;
  slug:        string;
}

export interface HubDoc {
  id:             string;
  hubName:        string;
  hubSlug:        string;
  tierId:         string;
  contactEmailId: string;
  isActive:       boolean;
  branding?:      HubBranding;
  tenants?:       HubTenant[];
  createdAt?:     any;
  updatedAt?:     any;
}

export interface FloInvokePermissions {
  allowedUids:  string[];   // specific user UIDs, or ['*'] for all hub users
  allowedRoles: string[];   // 'hub_admin' | 'user' — empty means no one
  canRunInDesigner: boolean; // whether non-admins can hit Run button
}