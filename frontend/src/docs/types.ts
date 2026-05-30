/**
 * Product manual — structured doc types.
 *
 * Three documentation tiers:
 *  1. product            — FloPlug features & releases (static; eventually public/marketing)
 *  2. hub-config         — live hub/tenant catalog (Hub Admin portal saves)
 *  3. product-config     — live platform catalog (connectors, FloKits, actions — product team)
 *  4. platform-internal  — FloPlug staff how-to runbooks (not live config)
 */

export type DocCategory = 'product' | 'hub-config' | 'product-config' | 'platform-internal';

export type DocPortal = 'tenant' | 'platform';

export type DocAudience = 'all' | 'hub-admin' | 'platform-staff';

export interface DocCallout {
  type: 'info' | 'warning' | 'tip';
  text: string;
}

export interface DocSection {
  heading?:    string;
  paragraphs?: string[];
  bullets?:    string[];
  callout?:    DocCallout;
  code?:       string;
}

export interface DocPage {
  id:        string;
  slug:      string;
  title:     string;
  category:  DocCategory;
  audience:  DocAudience;
  summary:   string;
  updatedAt: string;
  sections:  DocSection[];
}

export interface DocCategoryMeta {
  id:          DocCategory;
  title:       string;
  description: string;
  icon:        string;
  /** Which portal shows this category */
  portal:      DocPortal;
  /** hub-config is generated from live data, not static pages */
  dynamic?:    boolean;
}

export type HubConfigSection = 'overview' | 'plugs' | 'connections' | 'floactions';

export type ProductConfigSection = 'overview' | 'connectors' | 'flo-kits' | 'actions';
