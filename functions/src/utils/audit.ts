//import * as admin from 'firebase-admin';
import { FloPlugAudit } from '../types/types.js';
import { SYSTEM_SOURCE } from '../constants.js';
import { FieldValue } from 'firebase-admin/firestore'; // Modular import

export const createAudit = (
  userId: string, 
  shortCode: string, 
  intId: string, 
  hubId: string,
  extra: object
): FloPlugAudit & any => ({
  ...extra,
  shortCode,
  hubId,
  integrationId: intId,
  isActive: true,
  effectiveDate: FieldValue.serverTimestamp(),
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  createdBy: userId,
  updatedBy: userId,
  source: SYSTEM_SOURCE,
});