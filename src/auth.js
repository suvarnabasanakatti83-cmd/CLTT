// ============================
// CLTT Firebase Auth Functions
// ============================

// Import the shared Authentication instance from our Firebase setup file.
import { auth } from "./firebase.js";

// Import only the modular Authentication functions we actually use.
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "firebase/auth";

// Create one reusable Google provider object.
// This tells Firebase that we want Google login support.
const googleProvider = new GoogleAuthProvider();

// This line asks Google to always let the user choose an account.
// It gives a better user experience when multiple Google accounts exist.
googleProvider.setCustomParameters({
  prompt: "select_account"
});

// This helper converts Firebase error codes into beginner-friendly messages.
function getAuthErrorMessage(error) {
  if (!error || !error.code) {
    return "Something went wrong during authentication.";
  }

  switch (error.code) {
    case "auth/email-already-in-use":
      return "This email is already registered. Try logging in instead.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Please use a stronger password with at least 6 characters.";
    case "auth/user-not-found":
      return "No account was found with this email address.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "The email or password is incorrect.";
    case "auth/popup-closed-by-user":
      return "The Google sign-in popup was closed before login finished.";
    default:
      return error.message || "Authentication failed.";
  }
}

// =========================
// Email and Password Signup
// =========================

export async function signUpWithEmail(email, password) {
  try {
    console.log("CLTT signup started for:", email);

    // Create a brand new Firebase Authentication user.
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);

    console.log("CLTT signup successful:", userCredential.user);

    return {
      success: true,
      user: userCredential.user,
      message: "Signup completed successfully."
    };
  } catch (error) {
    console.error("CLTT signup error:", error);

    return {
      success: false,
      error: getAuthErrorMessage(error)
    };
  }
}

// ======================
// Email and Password Login
// ======================

export async function loginWithEmail(email, password) {
  try {
    console.log("CLTT email login started for:", email);

    // Sign the user into Firebase Authentication.
    const userCredential = await signInWithEmailAndPassword(auth, email, password);

    console.log("CLTT email login successful:", userCredential.user);

    return {
      success: true,
      user: userCredential.user,
      message: "Login completed successfully."
    };
  } catch (error) {
    console.error("CLTT email login error:", error);

    return {
      success: false,
      error: getAuthErrorMessage(error)
    };
  }
}

// ===================
// Google Sign In Flow
// ===================

export async function signInWithGoogle() {
  try {
    console.log("CLTT Google sign-in started.");

    // Open the Google popup and let the user choose an account.
    const userCredential = await signInWithPopup(auth, googleProvider);

    console.log("CLTT Google sign-in successful:", userCredential.user);

    return {
      success: true,
      user: userCredential.user,
      message: "Google sign-in completed successfully."
    };
  } catch (error) {
    console.error("CLTT Google sign-in error:", error);

    return {
      success: false,
      error: getAuthErrorMessage(error)
    };
  }
}

// ==========
// Logout Flow
// ==========

export async function logoutUser() {
  try {
    console.log("CLTT logout started.");

    // Sign the current user out from Firebase Authentication.
    await signOut(auth);

    console.log("CLTT logout successful.");

    return {
      success: true,
      message: "Logout completed successfully."
    };
  } catch (error) {
    console.error("CLTT logout error:", error);

    return {
      success: false,
      error: getAuthErrorMessage(error)
    };
  }
}

// ============================
// Authentication State Listener
// ============================

export function watchAuthState(callback) {
  try {
    // onAuthStateChanged listens for login and logout changes automatically.
    // Firebase calls this whenever the current user changes.
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        console.log("CLTT auth state changed:", user);
        callback(user, null);
      },
      (error) => {
        console.error("CLTT auth state listener error:", error);
        callback(null, error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error("CLTT auth listener setup error:", error);
    callback(null, error);

    // Return an empty function so the caller can still safely call it later.
    return () => {};
  }
}
