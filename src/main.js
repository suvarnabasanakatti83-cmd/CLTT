// ============================
// CLTT Main Frontend App Logic
// ============================

// Import the Firebase auth instance so we can check whether a user is logged in.
import { auth } from "./firebase.js";

// Import all Authentication helper functions.
import {
  loginWithEmail,
  logoutUser,
  signInWithGoogle,
  signUpWithEmail,
  watchAuthState
} from "./auth.js";

// Import all Firestore CRUD helper functions.
import {
  addLabTest,
  deleteLabTest,
  getLabTests,
  updateLabTest
} from "./firestore.js";

// Import the Storage upload helpers.
import { uploadImageFile, uploadPdfFile } from "./storage.js";

// Import the Analytics helpers.
import { initializeAnalyticsSafely, logAnalyticsEvent } from "./analytics.js";

// This variable will always hold the current logged-in user.
let currentUser = null;

// =======================
// Small UI Helper Methods
// =======================

function showStatus(element, message, type = "info") {
  element.textContent = message;
  element.className = `status-message ${type}`;
}

function clearStatus(element) {
  element.textContent = "";
  element.className = "status-message";
}

function formatTimestamp(timestamp) {
  try {
    if (!timestamp || typeof timestamp.toDate !== "function") {
      return "Time not available yet";
    }

    return timestamp.toDate().toLocaleString();
  } catch (error) {
    console.error("CLTT timestamp formatting error:", error);
    return "Time formatting failed";
  }
}

function resetLabTestForm(elements) {
  elements.labTestForm.reset();
  elements.testId.value = "";
  elements.saveTestButton.textContent = "Save Lab Test";
  elements.cancelEditButton.hidden = true;
}

function createInfoParagraph(label, value) {
  const paragraph = document.createElement("p");
  const strongLabel = document.createElement("strong");

  strongLabel.textContent = `${label}: `;
  paragraph.appendChild(strongLabel);
  paragraph.append(document.createTextNode(value));

  return paragraph;
}

function updateAuthDisplay(elements) {
  if (currentUser) {
    elements.currentUser.textContent = `${currentUser.email || "Google user"} is currently signed in.`;
    elements.logoutButton.disabled = false;
  } else {
    elements.currentUser.textContent = "No user is currently signed in.";
    elements.logoutButton.disabled = true;
  }
}

function ensureAuthenticated(elements, actionName) {
  if (!auth.currentUser) {
    showStatus(
      elements.authStatus,
      `Please log in before trying to ${actionName}.`,
      "error"
    );

    return false;
  }

  return true;
}

// =======================
// Firestore List Renderer
// =======================

async function renderLabTests(elements) {
  try {
    elements.labTestList.innerHTML = "";

    if (!auth.currentUser) {
      showStatus(
        elements.firestoreStatus,
        "Please log in to load Firestore lab test records.",
        "info"
      );
      return;
    }

    showStatus(elements.firestoreStatus, "Loading Firestore records...", "info");

    const result = await getLabTests();

    if (!result.success) {
      showStatus(elements.firestoreStatus, result.error, "error");
      return;
    }

    if (result.data.length === 0) {
      elements.labTestList.innerHTML = `
        <div class="empty-state">
          <p>No lab test records were found yet.</p>
        </div>
      `;

      showStatus(elements.firestoreStatus, "No records found yet.", "info");
      return;
    }

    result.data.forEach((labTest) => {
      const card = document.createElement("article");
      card.className = "data-card";

      // Build the card with DOM methods so user-entered content stays safely escaped.
      const header = document.createElement("div");
      header.className = "data-card-header";

      const title = document.createElement("h3");
      title.textContent = labTest.title || "Untitled Test";

      const sampleChip = document.createElement("span");
      sampleChip.className = "data-chip";
      sampleChip.textContent = labTest.sampleType || "Unknown Sample";

      header.appendChild(title);
      header.appendChild(sampleChip);

      const resultParagraph = createInfoParagraph(
        "Result",
        labTest.result || "No result provided"
      );
      const notesParagraph = createInfoParagraph(
        "Notes",
        labTest.notes || "No notes provided"
      );
      const createdByParagraph = createInfoParagraph(
        "Created By",
        labTest.createdByEmail || "Unknown user"
      );
      const createdAtParagraph = createInfoParagraph(
        "Created At",
        formatTimestamp(labTest.createdAt)
      );

      const actions = document.createElement("div");
      actions.className = "card-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "secondary-button edit-button";
      editButton.textContent = "Edit";
      editButton.dataset.id = labTest.id;
      editButton.dataset.title = labTest.title || "";
      editButton.dataset.sampleType = labTest.sampleType || "";
      editButton.dataset.result = labTest.result || "";
      editButton.dataset.notes = labTest.notes || "";

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "danger-button delete-button";
      deleteButton.textContent = "Delete";
      deleteButton.dataset.id = labTest.id;

      actions.appendChild(editButton);
      actions.appendChild(deleteButton);

      card.appendChild(header);
      card.appendChild(resultParagraph);
      card.appendChild(notesParagraph);
      card.appendChild(createdByParagraph);
      card.appendChild(createdAtParagraph);
      card.appendChild(actions);

      elements.labTestList.appendChild(card);
    });

    showStatus(
      elements.firestoreStatus,
      `Firestore records loaded successfully. Total records: ${result.data.length}.`,
      "success"
    );
  } catch (error) {
    console.error("CLTT renderLabTests error:", error);
    showStatus(elements.firestoreStatus, "Failed to render Firestore data.", "error");
  }
}

// ===================
// Main App Bootstrap
// ===================

document.addEventListener("DOMContentLoaded", async () => {
  console.log("CLTT frontend loaded.");

  // Cache every important HTML element in one place for easy access.
  const elements = {
    appStatus: document.getElementById("app-status"),
    authStatus: document.getElementById("auth-status"),
    firestoreStatus: document.getElementById("firestore-status"),
    storageStatus: document.getElementById("storage-status"),
    currentUser: document.getElementById("current-user"),
    signupForm: document.getElementById("signup-form"),
    signupEmail: document.getElementById("signup-email"),
    signupPassword: document.getElementById("signup-password"),
    loginForm: document.getElementById("login-form"),
    loginEmail: document.getElementById("login-email"),
    loginPassword: document.getElementById("login-password"),
    googleSignInButton: document.getElementById("google-sign-in-button"),
    logoutButton: document.getElementById("logout-button"),
    labTestForm: document.getElementById("lab-test-form"),
    testId: document.getElementById("test-id"),
    testTitle: document.getElementById("test-title"),
    sampleType: document.getElementById("sample-type"),
    testResult: document.getElementById("test-result"),
    testNotes: document.getElementById("test-notes"),
    saveTestButton: document.getElementById("save-test-button"),
    cancelEditButton: document.getElementById("cancel-edit-button"),
    refreshTestsButton: document.getElementById("refresh-tests-button"),
    labTestList: document.getElementById("lab-test-list"),
    pdfUploadForm: document.getElementById("pdf-upload-form"),
    pdfFile: document.getElementById("pdf-file"),
    pdfUploadResult: document.getElementById("pdf-upload-result"),
    imageUploadForm: document.getElementById("image-upload-form"),
    imageFile: document.getElementById("image-file"),
    imageUploadResult: document.getElementById("image-upload-result")
  };

  try {
    showStatus(elements.appStatus, "Initializing CLTT Firebase app...", "info");

    // Initialize Analytics safely without breaking localhost development.
    await initializeAnalyticsSafely();
    await logAnalyticsEvent("cltt_app_loaded", {
      source: "main_page"
    });

    // Listen for login/logout state changes.
    watchAuthState(async (user, error) => {
      if (error) {
        showStatus(elements.authStatus, "Auth listener failed to start.", "error");
        return;
      }

      currentUser = user;
      updateAuthDisplay(elements);

      if (user) {
        showStatus(elements.authStatus, "User authenticated successfully.", "success");
        await renderLabTests(elements);
      } else {
        showStatus(elements.authStatus, "Please sign in to use CLTT Firebase features.", "info");
        elements.labTestList.innerHTML = `
          <div class="empty-state">
            <p>Log in to load Firestore records.</p>
          </div>
        `;
        showStatus(elements.firestoreStatus, "Firestore data is waiting for login.", "info");
      }
    });

    showStatus(elements.appStatus, "CLTT Firebase app is ready.", "success");
  } catch (error) {
    console.error("CLTT app initialization error:", error);
    showStatus(elements.appStatus, "CLTT app failed to initialize.", "error");
  }

  // ====================
  // Signup Form Handling
  // ====================

  elements.signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      clearStatus(elements.authStatus);

      const email = elements.signupEmail.value.trim();
      const password = elements.signupPassword.value.trim();

      const result = await signUpWithEmail(email, password);

      if (result.success) {
        showStatus(elements.authStatus, result.message, "success");
        elements.signupForm.reset();

        await logAnalyticsEvent("cltt_signup_success", {
          method: "email_password"
        });
      } else {
        showStatus(elements.authStatus, result.error, "error");
      }
    } catch (error) {
      console.error("CLTT signup form error:", error);
      showStatus(elements.authStatus, "Signup failed unexpectedly.", "error");
    }
  });

  // ===================
  // Login Form Handling
  // ===================

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      clearStatus(elements.authStatus);

      const email = elements.loginEmail.value.trim();
      const password = elements.loginPassword.value.trim();

      const result = await loginWithEmail(email, password);

      if (result.success) {
        showStatus(elements.authStatus, result.message, "success");
        elements.loginForm.reset();

        await logAnalyticsEvent("cltt_login_success", {
          method: "email_password"
        });
      } else {
        showStatus(elements.authStatus, result.error, "error");
      }
    } catch (error) {
      console.error("CLTT login form error:", error);
      showStatus(elements.authStatus, "Login failed unexpectedly.", "error");
    }
  });

  // =======================
  // Google Sign-In Handling
  // =======================

  elements.googleSignInButton.addEventListener("click", async () => {
    try {
      clearStatus(elements.authStatus);

      const result = await signInWithGoogle();

      if (result.success) {
        showStatus(elements.authStatus, result.message, "success");

        await logAnalyticsEvent("cltt_login_success", {
          method: "google"
        });
      } else {
        showStatus(elements.authStatus, result.error, "error");
      }
    } catch (error) {
      console.error("CLTT Google sign-in button error:", error);
      showStatus(elements.authStatus, "Google sign-in failed unexpectedly.", "error");
    }
  });

  // ===============
  // Logout Handling
  // ===============

  elements.logoutButton.addEventListener("click", async () => {
    try {
      clearStatus(elements.authStatus);

      const result = await logoutUser();

      if (result.success) {
        showStatus(elements.authStatus, result.message, "success");
        resetLabTestForm(elements);

        await logAnalyticsEvent("cltt_logout_success", {
          source: "logout_button"
        });
      } else {
        showStatus(elements.authStatus, result.error, "error");
      }
    } catch (error) {
      console.error("CLTT logout button error:", error);
      showStatus(elements.authStatus, "Logout failed unexpectedly.", "error");
    }
  });

  // ===========================
  // Firestore Create and Update
  // ===========================

  elements.labTestForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      if (!ensureAuthenticated(elements, "save lab test data")) {
        return;
      }

      clearStatus(elements.firestoreStatus);

      const testId = elements.testId.value.trim();
      const formData = {
        title: elements.testTitle.value.trim(),
        sampleType: elements.sampleType.value.trim(),
        result: elements.testResult.value.trim(),
        notes: elements.testNotes.value.trim(),
        createdByUserId: currentUser.uid,
        createdByEmail: currentUser.email || "Google user"
      };

      let result = null;

      if (testId) {
        result = await updateLabTest(testId, formData);
      } else {
        result = await addLabTest(formData);
      }

      if (result.success) {
        showStatus(elements.firestoreStatus, result.message, "success");
        resetLabTestForm(elements);
        await renderLabTests(elements);

        await logAnalyticsEvent("cltt_firestore_save_success", {
          mode: testId ? "update" : "create"
        });
      } else {
        showStatus(elements.firestoreStatus, result.error, "error");
      }
    } catch (error) {
      console.error("CLTT Firestore save form error:", error);
      showStatus(elements.firestoreStatus, "Saving Firestore data failed unexpectedly.", "error");
    }
  });

  // =================
  // Cancel Edit State
  // =================

  elements.cancelEditButton.addEventListener("click", () => {
    resetLabTestForm(elements);
    showStatus(elements.firestoreStatus, "Edit mode cancelled.", "info");
  });

  // ========================
  // Manual Refresh for Data
  // ========================

  elements.refreshTestsButton.addEventListener("click", async () => {
    try {
      if (!ensureAuthenticated(elements, "refresh Firestore data")) {
        return;
      }

      await renderLabTests(elements);
    } catch (error) {
      console.error("CLTT Firestore refresh error:", error);
      showStatus(elements.firestoreStatus, "Refresh failed unexpectedly.", "error");
    }
  });

  // ==========================
  // Edit and Delete Buttons UI
  // ==========================

  elements.labTestList.addEventListener("click", async (event) => {
    try {
      const clickedElement = event.target;

      if (clickedElement.classList.contains("edit-button")) {
        elements.testId.value = clickedElement.dataset.id || "";
        elements.testTitle.value = clickedElement.dataset.title || "";
        elements.sampleType.value = clickedElement.dataset.sampleType || "";
        elements.testResult.value = clickedElement.dataset.result || "";
        elements.testNotes.value = clickedElement.dataset.notes || "";
        elements.saveTestButton.textContent = "Update Lab Test";
        elements.cancelEditButton.hidden = false;

        showStatus(elements.firestoreStatus, "Edit mode loaded for the selected record.", "info");
      }

      if (clickedElement.classList.contains("delete-button")) {
        if (!ensureAuthenticated(elements, "delete lab test data")) {
          return;
        }

        const selectedTestId = clickedElement.dataset.id;
        const confirmDelete = window.confirm("Do you want to permanently delete this lab test record?");

        if (!confirmDelete) {
          return;
        }

        const result = await deleteLabTest(selectedTestId);

        if (result.success) {
          showStatus(elements.firestoreStatus, result.message, "success");
          await renderLabTests(elements);

          await logAnalyticsEvent("cltt_firestore_delete_success", {
            source: "delete_button"
          });
        } else {
          showStatus(elements.firestoreStatus, result.error, "error");
        }
      }
    } catch (error) {
      console.error("CLTT Firestore card action error:", error);
      showStatus(elements.firestoreStatus, "Record action failed unexpectedly.", "error");
    }
  });

  // ==================
  // PDF Upload Handling
  // ==================

  elements.pdfUploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      if (!ensureAuthenticated(elements, "upload a PDF")) {
        return;
      }

      clearStatus(elements.storageStatus);
      elements.pdfUploadResult.innerHTML = "";

      const selectedPdfFile = elements.pdfFile.files[0];
      const result = await uploadPdfFile(selectedPdfFile);

      if (result.success) {
        showStatus(elements.storageStatus, result.message, "success");
        elements.pdfUploadResult.innerHTML = `
          <p><strong>PDF Download URL:</strong></p>
          <a href="${result.downloadURL}" target="_blank" rel="noopener noreferrer">${result.downloadURL}</a>
        `;
        elements.pdfUploadForm.reset();

        await logAnalyticsEvent("cltt_pdf_upload_success", {
          file_type: "pdf"
        });
      } else {
        showStatus(elements.storageStatus, result.error, "error");
      }
    } catch (error) {
      console.error("CLTT PDF upload error:", error);
      showStatus(elements.storageStatus, "PDF upload failed unexpectedly.", "error");
    }
  });

  // ====================
  // Image Upload Handling
  // ====================

  elements.imageUploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      if (!ensureAuthenticated(elements, "upload an image")) {
        return;
      }

      clearStatus(elements.storageStatus);
      elements.imageUploadResult.innerHTML = "";

      const selectedImageFile = elements.imageFile.files[0];
      const result = await uploadImageFile(selectedImageFile);

      if (result.success) {
        showStatus(elements.storageStatus, result.message, "success");
        elements.imageUploadResult.innerHTML = `
          <p><strong>Image Download URL:</strong></p>
          <a href="${result.downloadURL}" target="_blank" rel="noopener noreferrer">${result.downloadURL}</a>
          <img src="${result.downloadURL}" alt="Uploaded CLTT preview" class="upload-preview" />
        `;
        elements.imageUploadForm.reset();

        await logAnalyticsEvent("cltt_image_upload_success", {
          file_type: "image"
        });
      } else {
        showStatus(elements.storageStatus, result.error, "error");
      }
    } catch (error) {
      console.error("CLTT image upload error:", error);
      showStatus(elements.storageStatus, "Image upload failed unexpectedly.", "error");
    }
  });
});
