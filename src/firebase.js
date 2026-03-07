import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCOXmiQxe_DsiyMDOqNS8Paf23W2VrH2dI",
  authDomain: "social-betting-app-2df86.firebaseapp.com",
  projectId: "social-betting-app-2df86",
  storageBucket: "social-betting-app-2df86.firebasestorage.app",
  messagingSenderId: "957549938000",
  appId: "1:957549938000:web:8f7b0d88da98be2bcc9855"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);