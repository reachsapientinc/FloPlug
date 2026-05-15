import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

let app: App;

// Check if the app is already initialized to avoid "duplicate app" errors
const projectId = process.env.GCLOUD_PROJECT;
console.log(`[firebase.ts] Project ID: ${projectId}`);
console.log(`[firebase.ts] Before Initializing: ${getApps().length}`);
if (getApps().length === 0) {
  //const projectId = process.env.GCLOUD_PROJECT;
  
  app = initializeApp({
    serviceAccountId: projectId ? `${projectId}@appspot.gserviceaccount.com` : undefined
  });
} else {
  app = getApps()[0];
}
console.log(`[firebase.ts] After Initializing : ${getApps().length}`);
console.log(`[firebase.ts] serviceAccountId being used: ${projectId}@appspot.gserviceaccount.com`);
export const db = getFirestore(app);
export const storage = getStorage(app);