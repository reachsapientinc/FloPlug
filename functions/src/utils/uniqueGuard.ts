import {  WriteBatch, FieldValue, DocumentReference } from 'firebase-admin/firestore';

export type RegistryObjectType = 'hub' | 'tenant' | 'connection' | 'workspace' | 'flo';

/**
 * @param scopeRef DocumentReference to the scope (Global, Hub, or Tenant)
 */
export const guardUniqueId = async (
  batch: WriteBatch,
  scopeRef: DocumentReference, 
  type: RegistryObjectType,
  field: 'shortCode' | 'integrationId',
  value: string
): Promise<void> => {
  // Use a subcollection named 'Registry' under the provided scope document
  const valueLower=`${value.toLowerCase().trim()}`;
  let registryQuery = scopeRef.collection('Registry')
                       .where("value","==",valueLower)
                       .where("field","==",field);

  
  
  const registrySnap = await registryQuery.get();
  
  if (registrySnap.size > 0) {
    throw new Error(`${type} with ${field} '${value}' already exists in this scope.`);
  }
  const registryRef = scopeRef
    .collection('Registry')
    .doc(`${field}__${valueLower}`);
    
  batch.set(registryRef, {
    objectType: type,
    field,
    valueLower,
    claimedAt: FieldValue.serverTimestamp()
  });
};