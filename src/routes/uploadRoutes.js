const express = require("express");
const router = express.Router();
const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const { protect } = require("../middleware/authMiddleware");
const { photoUpload, documentUpload } = require("../config/cloudinaryConfig");
const {
  uploadDocument,
  uploadPhoto,
  uploadMyPhoto,
  getDocuments,
  deleteDocument,
} = require("../controller/uploadController");

//  Admin uploads document for anyone
router.post("/document", protectAdmin, documentUpload.single("file"), uploadDocument);

// Admin uploads photo for student/teacher/parent/admin
router.post("/photo/:type/:id", protectAdmin, photoUpload.single("photo"), uploadPhoto);

//Self photo upload (student/teacher/parent)
router.post("/my-photo", protect, photoUpload.single("photo"), uploadMyPhoto);

// Get & delete documents
router.get("/documents", protectAdmin, getDocuments);
router.delete("/documents/:id", protectAdmin, deleteDocument);

module.exports = router;