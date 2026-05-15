/**
 * guards.ts — Firestore data narrowing helpers
 *
 * Firestore returns all fields as `any`. These helpers safely cast
 * values to our strict union types, falling back to defaults if the
 * stored value is unexpected.
 */
const VALID_ADMIN_ROLES = new Set(['product_admin', 'developer', 'admin_sales']);
const VALID_HUB_ROLES = new Set(['hub_admin', 'user']);
const VALID_ENVS = new Set(['dev', 'stage', 'sb', 'prod']);
export function toAdminRole(value, fallback = 'product_admin') {
    return VALID_ADMIN_ROLES.has(value)
        ? value
        : fallback;
}
export function toHubRole(value, fallback = 'user') {
    return VALID_HUB_ROLES.has(value)
        ? value
        : fallback;
}
export function toFloPlugEnv(value, fallback = 'dev') {
    return VALID_ENVS.has(value)
        ? value
        : fallback;
}
export function toFloPlugEnvArray(value, fallback = ['dev']) {
    if (!Array.isArray(value))
        return fallback;
    const filtered = value
        .filter((v) => VALID_ENVS.has(v));
    return filtered.length > 0 ? filtered : fallback;
}
