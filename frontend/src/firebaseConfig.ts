import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getAuth }        from "firebase/auth"; 
import {getStorage} from 'firebase/storage';


// Vite requires environment variables to start with "VITE_"
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// console.log("🚀 Final Firebase Config Prepared:", {
//   ...firebaseConfig,
//   apiKey: "REDACTED_FOR_SECURITY" // Log everything except the sensitive key
// });
// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export services
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const auth      = getAuth(app);      // ← added
export const storage = getStorage(app);
export default app;