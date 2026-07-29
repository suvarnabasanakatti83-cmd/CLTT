// ===============================
// CLTT Firebase Storage Functions
// ===============================

// Import the shared Firebase Storage instance.
import { storage } from "./firebase.js";

// Import only the modular Storage functions we need.
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

// This helper cleans file names so uploaded paths look safer and more readable.
function createSafeFileName(fileName) {
  return fileName.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9.\-_]/g, "");
}

// This helper handles the shared upload logic for both PDFs and images.
async function uploadFileAndGetUrl(file, folderName, validator) {
  try {
    if (!file) {
      throw new Error("Please select a file before uploading.");
    }

    if (!validator(file)) {
      throw new Error("The selected file type is not allowed for this upload.");
    }

    console.log("CLTT Storage upload started:", file.name);

    // Create a unique file path so uploads do not overwrite each other.
    const safeFileName = createSafeFileName(file.name);
    const filePath = `cltt-uploads/${folderName}/${Date.now()}-${safeFileName}`;

    // Create a Firebase Storage reference for the final upload path.
    const fileReference = ref(storage, filePath);

    // Upload the actual file bytes to Firebase Storage.
    const uploadResult = await uploadBytes(fileReference, file);

    // After upload finishes, ask Firebase Storage for the public download URL.
    const downloadURL = await getDownloadURL(uploadResult.ref);

    console.log("CLTT Storage upload successful:", downloadURL);

    return {
      success: true,
      filePath,
      downloadURL,
      message: "File uploaded successfully."
    };
  } catch (error) {
    console.error("CLTT Storage upload error:", error);

    return {
      success: false,
      error: error.message || "File upload failed."
    };
  }
}

// ==================
// Upload PDF to Storage
// ==================

export async function uploadPdfFile(file) {
  // A PDF must have the standard PDF MIME type.
  return uploadFileAndGetUrl(file, "pdfs", (selectedFile) => {
    return selectedFile.type === "application/pdf";
  });
}

// ====================
// Upload Image to Storage
// ====================

export async function uploadImageFile(file) {
  // For images, we allow any file type that starts with "image/".
  return uploadFileAndGetUrl(file, "images", (selectedFile) => {
    return selectedFile.type.startsWith("image/");
  });
}
