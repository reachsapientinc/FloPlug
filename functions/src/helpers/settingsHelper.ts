import { db } from '../utils/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import type {
  PermissionDoc,
  HubRoleDoc,
  FloPlugRoleDoc,
  ResolvedHubRole,
  PermissionCategory
} from '@floplug/shared';

import type { HubPermission } from '@floplug/shared';

//import {HubPermission} from '@floplug/shared';

// ── Path constants ────────────────────────────────────────────────────────────

const GLOBAL  = 'FloPlugGlobalSettings';
const LOOKUPS = 'GlobalLookups';

const col = {
  permissions:  () => db.collection(GLOBAL).doc(LOOKUPS).collection('Permissions'),
  hubRoles:     () => db.collection(GLOBAL).doc(LOOKUPS).collection('HubRoles'),
  floPlugRoles: () => db.collection(GLOBAL).doc(LOOKUPS).collection('FloPlugRoles'),
};

// ═════════════════════════════════════════════════════════════════════════════
// EXISTING — Global Settings
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A versatile helper to fetch FloPlugGlobalSettings.
 * Supports getting the whole doc, a specific sub-doc, or a specific field.
 */
export const getGlobalSetting = async <T = any>(
  docId: string = 'Settings',
  field?: string,
): Promise<T | null> => {
  try {
    const docRef  = db.collection(GLOBAL).doc(docId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) return null;

    const data = docSnap.data();
    if (field && data) return data[field] ?? null;
    return data as T;
  } catch (error) {
    console.error(`Error fetching global setting [${docId}]:`, error);
    return null;
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// PERMISSIONS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Get all active permissions, sorted by sortOrder.
 * Returns a Record keyed by permission ID for fast lookup.
 */
export const getPermissions = async (): Promise<Record<string, PermissionDoc>> => {
  try {
    const snap = await col.permissions().orderBy('sortOrder').get();
    return Object.fromEntries(
      snap.docs
        .filter(d => d.data().isActive)
        .map(d => [d.id, d.data() as PermissionDoc])
    );
  } catch (error) {
    console.error('Error fetching permissions:', error);
    return {};
  }
};

/**
 * Get a single permission by ID.
 */
export const getPermission = async (
  permissionId: string,
): Promise<PermissionDoc | null> => {
  try {
    const snap = await col.permissions().doc(permissionId).get();
    return snap.exists ? (snap.data() as PermissionDoc) : null;
  } catch (error) {
    console.error(`Error fetching permission [${permissionId}]:`, error);
    return null;
  }
};

/**
 * Get all permissions for a category (e.g. 'flos', 'users').
 */
export const getPermissionsByCategory = async (
  category: PermissionCategory,
): Promise<Record<string, PermissionDoc>> => {
  try {
    const snap = await col.permissions()
      .where('category', '==', category)
      .where('isActive', '==', true)
      .orderBy('sortOrder')
      .get();
    return Object.fromEntries(snap.docs.map(d => [d.id, d.data() as PermissionDoc]));
  } catch (error) {
    console.error(`Error fetching permissions for category [${category}]:`, error);
    return {};
  }
};

/**
 * Add a new permission.
 * permissionId should match the HubPermission type string e.g. 'manage:plugs'.
 */
export const addPermission = async (
  permissionId: string,
  data: Omit<PermissionDoc, 'isActive'>,
): Promise<boolean> => {
  try {
    await col.permissions().doc(permissionId).set({
      ...data,
      isActive:  true,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error(`Error adding permission [${permissionId}]:`, error);
    return false;
  }
};

/**
 * Update an existing permission's metadata (label, description, category, sortOrder).
 * Does not touch permissionId or isActive — use deactivatePermission for soft delete.
 */
export const updatePermission = async (
  permissionId: string,
  updates: Partial<Omit<PermissionDoc, 'isActive'>>,
): Promise<boolean> => {
  try {
    await col.permissions().doc(permissionId).update({
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error(`Error updating permission [${permissionId}]:`, error);
    return false;
  }
};

/**
 * Soft-delete a permission.
 * Also removes it from any HubRole that references it.
 */
export const deactivatePermission = async (
  permissionId: string,
): Promise<boolean> => {
  try {
    const batch = db.batch();

    // Soft-delete the permission doc
    batch.update(col.permissions().doc(permissionId), {
      isActive:      false,
      deactivatedAt: FieldValue.serverTimestamp(),
    });

    // Remove from any HubRole that references it
    const rolesSnap = await col.hubRoles().get();
    for (const roleDoc of rolesSnap.docs) {
      const role = roleDoc.data() as HubRoleDoc;
      if (role.permissionIds?.includes(permissionId as HubPermission)) {
        batch.update(col.hubRoles().doc(roleDoc.id), {
          permissionIds: role.permissionIds.filter(p => p !== permissionId),
          updatedAt:     FieldValue.serverTimestamp(),
        });
      }
    }

    await batch.commit();
    return true;
  } catch (error) {
    console.error(`Error deactivating permission [${permissionId}]:`, error);
    return false;
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// HUB ROLES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Get all active HubRoles (raw — permissionIds only, not joined).
 */
export const getHubRoles = async (): Promise<Record<string, HubRoleDoc>> => {
  try {
    const snap = await col.hubRoles().orderBy('sortOrder').get();
    return Object.fromEntries(
      snap.docs
        .filter(d => d.data().isActive)
        .map(d => [d.id, d.data() as HubRoleDoc])
    );
  } catch (error) {
    console.error('Error fetching hub roles:', error);
    return {};
  }
};

/**
 * Get all HubRoles with their permission docs fully joined.
 * Use this in the RoleManagement UI.
 */
export const getResolvedHubRoles = async (): Promise<ResolvedHubRole[]> => {
  try {
    const [rolesSnap, permissions] = await Promise.all([
      col.hubRoles().orderBy('sortOrder').get(),
      getPermissions(),
    ]);

    return rolesSnap.docs
      .filter(d => d.data().isActive)
      .map(d => {
        const role = d.data() as HubRoleDoc;
        return {
          id: d.id,
          ...role,
          permissions: (role.permissionIds ?? [])
            .map(pid => permissions[pid])
            .filter(Boolean),
        } as ResolvedHubRole;
      });
  } catch (error) {
    console.error('Error fetching resolved hub roles:', error);
    return [];
  }
};

/**
 * Get the resolved permission IDs for a single role.
 * Used by hubFunctions when setting custom token claims.
 */
export const getPermissionsForRole = async (
  roleId: string,
): Promise<HubPermission[]> => {
  try {
    const snap = await col.hubRoles().doc(roleId).get();
    if (!snap.exists) return [];
    return (snap.data() as HubRoleDoc).permissionIds ?? [];
  } catch (error) {
    console.error(`Error fetching permissions for role [${roleId}]:`, error);
    return [];
  }
};

/**
 * Add a new HubRole.
 */
export const addHubRole = async (
  roleId: string,
  data: Omit<HubRoleDoc, 'isActive' | 'permissionIds'>,
  permissionIds: HubPermission[] = [],
): Promise<boolean> => {
  try {
    await col.hubRoles().doc(roleId).set({
      ...data,
      permissionIds,
      isActive:  true,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error(`Error adding hub role [${roleId}]:`, error);
    return false;
  }
};

/**
 * Update a HubRole's metadata (label, sortOrder).
 * Does not touch permissionIds — use assignPermissionsToRole for that.
 */
export const updateHubRole = async (
  roleId: string,
  updates: Partial<Pick<HubRoleDoc, 'label' | 'sortOrder'>>,
): Promise<boolean> => {
  try {
    await col.hubRoles().doc(roleId).update({
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error(`Error updating hub role [${roleId}]:`, error);
    return false;
  }
};

/**
 * Deactivate a HubRole (soft delete).
 */
export const deactivateHubRole = async (roleId: string): Promise<boolean> => {
  try {
    await col.hubRoles().doc(roleId).update({
      isActive:      false,
      deactivatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error(`Error deactivating hub role [${roleId}]:`, error);
    return false;
  }
};

/**
 * Replace the full permission assignment for a role.
 * This is the primary call from the RoleManagement UI save action.
 */
export const assignPermissionsToRole = async (
  roleId:        string,
  permissionIds: HubPermission[],
): Promise<boolean> => {
  try {
    await col.hubRoles().doc(roleId).update({
      permissionIds,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error(`Error assigning permissions to role [${roleId}]:`, error);
    return false;
  }
};

/**
 * Add a single permission to a role without replacing the full list.
 * Safe for concurrent updates — uses arrayUnion.
 */
export const addPermissionToRole = async (
  roleId:       string,
  permissionId: HubPermission,
): Promise<boolean> => {
  try {
    await col.hubRoles().doc(roleId).update({
      permissionIds: FieldValue.arrayUnion(permissionId),
      updatedAt:     FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error(`Error adding permission [${permissionId}] to role [${roleId}]:`, error);
    return false;
  }
};

/**
 * Remove a single permission from a role without replacing the full list.
 * Safe for concurrent updates — uses arrayRemove.
 */
export const removePermissionFromRole = async (
  roleId:       string,
  permissionId: HubPermission,
): Promise<boolean> => {
  try {
    await col.hubRoles().doc(roleId).update({
      permissionIds: FieldValue.arrayRemove(permissionId),
      updatedAt:     FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error(`Error removing permission [${permissionId}] from role [${roleId}]:`, error);
    return false;
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// FLOPLUG ROLES (platform/admin roles — no permissions)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Get all active FloPlugRoles.
 */
export const getFloPlugRoles = async (): Promise<Record<string, FloPlugRoleDoc>> => {
  try {
    const snap = await col.floPlugRoles().orderBy('sortOrder').get();
    return Object.fromEntries(
      snap.docs
        .filter(d => d.data().isActive)
        .map(d => [d.id, d.data() as FloPlugRoleDoc])
    );
  } catch (error) {
    console.error('Error fetching FloPlug roles:', error);
    return {};
  }
};

/**
 * Add a new FloPlugRole.
 */
export const addFloPlugRole = async (
  roleId: string,
  data:   Omit<FloPlugRoleDoc, 'isActive'>,
): Promise<boolean> => {
  try {
    await col.floPlugRoles().doc(roleId).set({
      ...data,
      isActive:  true,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error(`Error adding FloPlug role [${roleId}]:`, error);
    return false;
  }
};

/**
 * Update a FloPlugRole's label or sortOrder.
 */
export const updateFloPlugRole = async (
  roleId:  string,
  updates: Partial<Omit<FloPlugRoleDoc, 'isActive'>>,
): Promise<boolean> => {
  try {
    await col.floPlugRoles().doc(roleId).update({
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error(`Error updating FloPlug role [${roleId}]:`, error);
    return false;
  }
};

/**
 * Deactivate a FloPlugRole (soft delete).
 */
export const deactivateFloPlugRole = async (roleId: string): Promise<boolean> => {
  try {
    await col.floPlugRoles().doc(roleId).update({
      isActive:      false,
      deactivatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error(`Error deactivating FloPlug role [${roleId}]:`, error);
    return false;
  }
};