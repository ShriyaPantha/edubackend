// authRoutes.js — full updated file

const express = require("express");
const router  = express.Router();

const {
  register,
  verifyOTP,
  resendOTP,
  login,
  getUserByEmail,
   updateProfile, changePassword
} = require("../controller/authController");

// ── NEW: import settings handlers ─────────────────────────────────────────────
// Option A: if you added them to authController.js directly
// const { updateProfile, changePassword } = require("../controller/authController");

// Option B: separate file (recommended — keeps authController clean)

const { protect } = require("../middleware/authMiddleware");

// ── Auth ──────────────────────────────────────────────────────────────────────
router.post("/register",    register);
router.post("/verify-otp",  verifyOTP);
router.post("/resend-otp",  resendOTP);
router.post("/login",       login);
router.get("/by-email",     protect, getUserByEmail);

// ── Settings (requires User JWT) ──────────────────────────────────────────────
router.put("/update-profile",  protect, updateProfile);
router.put("/change-password", protect, changePassword);

module.exports = router;