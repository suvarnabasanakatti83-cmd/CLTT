// ==============================
// CLTT Firebase Core Setup File
// ==============================

// Import only the Firebase features that this file is responsible for.
// This is the Firebase v9+ modular style. It keeps code smaller and cleaner.
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// This configuration object connects the CLTT frontend to your Firebase project.
// Firebase config values are public on purpose. Security is handled by Firebase
// Authentication, Firestore rules, and Storage rules, not by hiding this object.
const firebaseConfig = {
  apiKey: "AIzaSyA9LyZW84c735sKSEJM96So9bjIFSDN_0M",
  authDomain: "cltt-e6421.firebaseapp.com",
  projectId: "cltt-e6421",
  storageBucket: "cltt-e6421.firebasestorage.app",
  messagingSenderId: "98528032033",
  appId: "1:98528032033:web:9c9bdbbf663fb137123a60",
  measurementId: "G-B70JZJMBQH"
};

// initializeApp creates the main Firebase app instance for this project.
// Think of it as the "entry point" that turns the config into a live connection.
const app = initializeApp(firebaseConfig);

// Create the Authentication service instance.
// We export it so other files can use the same shared auth connection.
const auth = getAuth(app);

// Create the Firestore database service instance.
// This gives the project access to your cloud document database.
const db = getFirestore(app);

// Create the Firebase Storage service instance.
// This is used for uploading files like PDFs and images.
const storage = getStorage(app);

// Helpful console message for beginners during development.
console.log("CLTT Firebase core services initialized successfully.");

// Export every shared Firebase object so the rest of the app can reuse them.
export { app, auth, db, storage, firebaseConfig };
