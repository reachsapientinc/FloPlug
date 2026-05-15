import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * Validates and registers a unique ID within a tenant
 * @param {string} tenantId - The slug of the tenant
 * @param {string} type - 'shortCode' or 'integrationId'
 * @param {string} value - The value to check
 * @param {WriteBatch} batch - The active firestore batch
 */
export const registerUniqueId = async (tenantId, type, value, batch) => {
  const registryId = `${tenantId}_${type}_${value.toLowerCase().trim()}`;
  const registryRef = doc(db, "FloPlugRegistry", registryId);
  
  const snap = await getDoc(registryRef);
  if (snap.exists()) {
    throw new Error(`The ${type} '${value}' is already in use within this tenant.`);
  }

  // Add to batch so it's "claimed" when the main object is saved
  batch.set(registryRef, {
    tenantId,
    type,
    value,
    claimedAt: new Date()
  });
};