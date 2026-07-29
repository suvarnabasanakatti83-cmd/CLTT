// ==============================
// CLTT Firebase Analytics Module
// ==============================

// Import the shared Firebase app instance.
import { app } from "./firebase.js";

// Import the modular Analytics functions.
import { getAnalytics, isSupported, logEvent } from "firebase/analytics";

// We keep the Analytics instance here after successful initialization.
let analyticsInstance = null;

// This flag prevents the app from trying to initialize Analytics repeatedly.
let hasTriedToInitializeAnalytics = false;

// This helper checks whether the app is running on localhost.
// Analytics often should be skipped in local development to avoid noisy errors.
function isRunningOnLocalhost() {
  const hostname = window.location.hostname;

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

// ===========================
// Safe Analytics Initialization
// ===========================

export async function initializeAnalyticsSafely() {
  try {
    // Return the existing Analytics instance if we already created it.
    if (analyticsInstance) {
      return analyticsInstance;
    }

    // If initialization already failed or was skipped once, do not repeat work.
    if (hasTriedToInitializeAnalytics) {
      return null;
    }

    hasTriedToInitializeAnalytics = true;

    // Analytics only works in the browser.
    if (typeof window === "undefined") {
      console.log("CLTT Analytics skipped because window is not available.");
      return null;
    }

    // Skip Analytics on localhost to avoid unnecessary development errors.
    if (isRunningOnLocalhost()) {
      console.log("CLTT Analytics skipped during localhost development.");
      return null;
    }

    // Ask Firebase whether Analytics is supported in this environment.
    const analyticsSupported = await isSupported();

    if (!analyticsSupported) {
      console.log("CLTT Analytics is not supported in this browser environment.");
      return null;
    }

    // Create the Analytics instance only when everything is safe.
    analyticsInstance = getAnalytics(app);

    console.log("CLTT Analytics initialized successfully.");

    return analyticsInstance;
  } catch (error) {
    console.error("CLTT Analytics initialization error:", error);
    return null;
  }
}

// =====================
// Analytics Event Logger
// =====================

export async function logAnalyticsEvent(eventName, eventParameters = {}) {
  try {
    const analytics = await initializeAnalyticsSafely();

    if (!analytics) {
      console.log("CLTT Analytics event skipped:", eventName);
      return false;
    }

    // Send a custom Analytics event to Firebase.
    logEvent(analytics, eventName, eventParameters);

    console.log("CLTT Analytics event logged:", eventName, eventParameters);

    return true;
  } catch (error) {
    console.error("CLTT Analytics event error:", error);
    return false;
  }
}
