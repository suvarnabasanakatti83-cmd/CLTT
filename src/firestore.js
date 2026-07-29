// =================================
// CLTT Firestore CRUD Helper Module
// =================================

// Import the shared Firestore instance from firebase.js.
import { db } from "./firebase.js";

// Import only the modular Firestore functions we need.
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";

// This is the collection where CLTT lab test records will be stored.
// In Firestore, a collection is like a cloud folder for related documents.
const labTestsCollection = collection(db, "labTests");

// ======================
// Create New Lab Test Data
// ======================

export async function addLabTest(testData) {
  try {
    console.log("CLTT Firestore add started:", testData);

    // Add a new document into the labTests collection.
    // serverTimestamp() lets Firebase write the current server time for us.
    const documentReference = await addDoc(labTestsCollection, {
      ...testData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    console.log("CLTT Firestore add successful. Document ID:", documentReference.id);

    return {
      success: true,
      id: documentReference.id,
      message: "Lab test data added successfully."
    };
  } catch (error) {
    console.error("CLTT Firestore add error:", error);

    return {
      success: false,
      error: error.message || "Failed to add lab test data."
    };
  }
}

// ====================
// Read All Lab Test Data
// ====================

export async function getLabTests() {
  try {
    console.log("CLTT Firestore read started.");

    // Create a query so newer records appear first in the UI.
    const labTestsQuery = query(labTestsCollection, orderBy("createdAt", "desc"));

    // Get every document that matches the query.
    const querySnapshot = await getDocs(labTestsQuery);

    // Convert Firestore documents into a normal JavaScript array.
    const labTests = querySnapshot.docs.map((documentSnapshot) => {
      return {
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      };
    });

    console.log("CLTT Firestore read successful. Records found:", labTests.length);

    return {
      success: true,
      data: labTests
    };
  } catch (error) {
    console.error("CLTT Firestore read error:", error);

    return {
      success: false,
      error: error.message || "Failed to read lab test data.",
      data: []
    };
  }
}

// =====================
// Update Existing Record
// =====================

export async function updateLabTest(testId, updatedData) {
  try {
    console.log("CLTT Firestore update started for ID:", testId);

    // Create a reference to one specific Firestore document.
    const documentReference = doc(db, "labTests", testId);

    // Update only the fields we pass here.
    await updateDoc(documentReference, {
      ...updatedData,
      updatedAt: serverTimestamp()
    });

    console.log("CLTT Firestore update successful for ID:", testId);

    return {
      success: true,
      message: "Lab test data updated successfully."
    };
  } catch (error) {
    console.error("CLTT Firestore update error:", error);

    return {
      success: false,
      error: error.message || "Failed to update lab test data."
    };
  }
}

// =====================
// Delete Existing Record
// =====================

export async function deleteLabTest(testId) {
  try {
    console.log("CLTT Firestore delete started for ID:", testId);

    // Create a reference to the document we want to remove.
    const documentReference = doc(db, "labTests", testId);

    // Permanently delete the Firestore document.
    await deleteDoc(documentReference);

    console.log("CLTT Firestore delete successful for ID:", testId);

    return {
      success: true,
      message: "Lab test data deleted successfully."
    };
  } catch (error) {
    console.error("CLTT Firestore delete error:", error);

    return {
      success: false,
      error: error.message || "Failed to delete lab test data."
    };
  }
}
