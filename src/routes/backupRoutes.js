const express = require("express");
const router = express.Router();
const multer = require("multer");
const { protect } = require("../middleware/authMiddleware");
const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");
const {
  createBackup,
  createSchoolBackup,
  restoreBackup,
} = require("../controller/backupController");

//In-memory upload for restore
const upload = multer({ storage: multer.memoryStorage() });

// Superadmin — full backup + restore
router.get("/full", protect, authorizeRoles("superadmin"), createBackup);
router.post("/restore", protect, authorizeRoles("superadmin"), upload.single("backup"), restoreBackup);

// Admin — school backup only
router.get("/school", protectAdmin, createSchoolBackup);

module.exports = router;