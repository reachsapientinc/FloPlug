import { FLC_REGISTRY_PREFIX } from '../constants/constants.js';
/**
 * Build the Registry document key for a FloConnection.
 * Always use this helper instead of constructing the key ad-hoc.
 *
 * @example floConnectionRegistryKey('abc123') → 'flc_abc123'
 */
export const floConnectionRegistryKey = (connectionId) => `${FLC_REGISTRY_PREFIX}${connectionId}`;
/**
 * Extract the bare connectionId from a Registry key.
 * Returns null if the key doesn't carry the flc_ prefix.
 */
export const connectionIdFromRegistryKey = (key) => key.startsWith(FLC_REGISTRY_PREFIX)
    ? key.slice(FLC_REGISTRY_PREFIX.length)
    : null;
