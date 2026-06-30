const express = require("express");
const router = express.Router();

const {
  getProfile,
  updateProfile,
  toggle2FA,
  changePassword,
} = require("../controller/superAdminSettingController"); // adjust path if different



const {  authorizeRoles } = require("../middleware/roleMiddleware"); // adjust to your actual auth middleware

const { protect} = require("../middleware/authMiddleware"); // adjust to your actual auth middleware

// All routes below require login + superadmin role
router.use(protect, authorizeRoles("superadmin"));

// ── PROFILE ──────────────────────────────────────────────
router.get("/profile", getProfile);
router.patch("/profile", updateProfile);
router.post("/2fa", toggle2FA);
router.post("/change-password", changePassword);

// ── DASHBOARD ────────────────────────────────────────────


module.exports = router;