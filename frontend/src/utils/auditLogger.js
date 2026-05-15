import { serverTimestamp } from 'firebase/firestore';

export const createAuditObject = (userId, source = 'web-app', extraFields = {}) => {
  return {
    ...extraFields,
    isActive: true,
    effectiveDate: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: userId,
    updatedBy: userId,
    source: source,
    // shortCode and integrationId must be passed in extraFields to ensure uniqueness check
  };
};