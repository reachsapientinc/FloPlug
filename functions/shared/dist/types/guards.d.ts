/**
 * guards.ts — Firestore data narrowing helpers
 *
 * Firestore returns all fields as `any`. These helpers safely cast
 * values to our strict union types, falling back to defaults if the
 * stored value is unexpected.
 */
import type { AdminRole, HubRole, FloPlugEnv } from './types.js';
export declare function toAdminRole(value: unknown, fallback?: AdminRole): AdminRole;
export declare function toHubRole(value: unknown, fallback?: HubRole): HubRole;
export declare function toFloPlugEnv(value: unknown, fallback?: FloPlugEnv): FloPlugEnv;
export declare function toFloPlugEnvArray(value: unknown, fallback?: FloPlugEnv[]): FloPlugEnv[];
