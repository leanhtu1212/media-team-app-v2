import { initializeApp, getApp, getApps, deleteApp } from 'firebase/app';
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, updatePassword, type User,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
// CRITICAL: custom database id — getFirestore(app) alone points at empty (default) DB
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);

/** Create a Firebase Auth user via a secondary app so the admin stays logged in. */
export async function createNewUser(email: string, pass: string): Promise<User> {
  const secondaryApp = initializeApp(firebaseConfig, `Secondary_${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    await signOut(secondaryAuth);
    await deleteApp(secondaryApp);
    return cred.user;
  } catch (err) {
    try { await deleteApp(secondaryApp); } catch { /* ignore */ }
    throw err;
  }
}

export { signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword };
export type { User };
