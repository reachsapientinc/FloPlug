/**
 * guards.ts — Firestore data narrowing helpers
 * 
 * Firestore returns all fields as `any`. These helpers safely cast
 * values to our strict union types, falling back to defaults if the
 * stored value is unexpected.
 */

import type { AdminRole, HubRole, FloPlugEnv } from './types.js';


const VALID_ADMIN_ROLES  = new Set<AdminRole>(['product_admin', 'developer', 'admin_sales']);
const VALID_HUB_ROLES    = new Set<HubRole>(['hub_admin', 'user']);
const VALID_ENVS         = new Set<FloPlugEnv>(['dev', 'stage', 'sb', 'prod']);

export function toAdminRole(value: unknown, fallback: AdminRole = 'product_admin'): AdminRole {
  return VALID_ADMIN_ROLES.has(value as AdminRole)
    ? (value as AdminRole)
    : fallback;
}

export function toHubRole(value: unknown, fallback: HubRole = 'user'): HubRole {
  return VALID_HUB_ROLES.has(value as HubRole)
    ? (value as HubRole)
    : fallback;
}

export function toFloPlugEnv(value: unknown, fallback: FloPlugEnv = 'dev'): FloPlugEnv {
  return VALID_ENVS.has(value as FloPlugEnv)
    ? (value as FloPlugEnv)
    : fallback;
}

export function toFloPlugEnvArray(value: unknown, fallback: FloPlugEnv[] = ['dev']): FloPlugEnv[] {
  if (!Array.isArray(value)) return fallback;
  const filtered = value
    .filter((v): v is FloPlugEnv => VALID_ENVS.has(v as FloPlugEnv));
  return filtered.length > 0 ? filtered : fallback;
}