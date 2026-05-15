import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app'; // Add this
import { getFirestore } from 'firebase-admin/firestore';
import serviceAccount from './floplug-dev-serviceAccountKey.json' with { type: 'json' };

initializeApp({
  credential: cert(serviceAccount as ServiceAccount) // 
});

const db = getFirestore();

async function migrateFlowsToFlos(hubId:string, tenantId:string) {
  const workspacesSnap = await db
    .collection('FloPlugHubs').doc(hubId)
    .collection('Tenants').doc(tenantId)
    .collection('Workspaces')
    .get();

  for (const wsDoc of workspacesSnap.docs) {
    const flowsSnap = await wsDoc.ref.collection('Flows').get();

    for (const flowDoc of flowsSnap.docs) {
      // Write to new Flos collection
      await wsDoc.ref.collection('Flos').doc(flowDoc.id).set(flowDoc.data());
      // Delete from old Flows collection
      //await flowDoc.ref.delete();
      console.log(`Migrated ${wsDoc.id}/Flows/${flowDoc.id} → Flos`);
    }
  }
}

migrateFlowsToFlos('demo','dev').catch(console.error);