import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set, remove } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyD_mEgfFs7KBY20rK-rWhSAlzYl3DwPgdk",
  authDomain: "rental-cars-manager.firebaseapp.com",
  databaseURL: "https://rental-cars-manager-default-rtdb.firebaseio.com",
  projectId: "rental-cars-manager",
  storageBucket: "rental-cars-manager.firebasestorage.app",
  messagingSenderId: "1045564155586",
  appId: "1:1045564155586:web:0b639d74378cdcabda3d5b",
};

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);

export async function connectFirebase() {
  return db;
}

export async function readCollection(path) {
  const snapshot = await get(ref(db, path));
  return snapshot.exists() ? snapshot.val() : {};
}

export async function writeItem(path, id, value) {
  await set(ref(db, `${path}/${id}`), value);
}

export async function deleteItem(path, id) {
  await remove(ref(db, `${path}/${id}`));
}