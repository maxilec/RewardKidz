// --- Import Firebase depuis CDN (ESM) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- Config Firebase générée par ton workflow ---
import { firebaseConfig } from "./firebase.config.js";

// --- Initialisation ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// --- Login Google ---
async function login() {
  const result = await signInWithPopup(auth, provider);
  const user = result.user;

  console.log("Connecté :", user.email);

  // Créer le document user si inexistant
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      familyId: null,
      role: "none",
      createdAt: Date.now()
    });
  }
}

// --- Listener bouton ---
document.getElementById("login").addEventListener("click", login);

// --- Listener session ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("Session restaurée :", user.email);
  }
});
