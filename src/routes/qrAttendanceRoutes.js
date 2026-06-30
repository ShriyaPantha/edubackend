const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  generateQR,
  scanQR,
  getQRAttendanceReport,
} = require("../controller/qrAttendanceController");

// Teacher generates QR
router.post("/generate", protect, generateQR);

// Student scans QR
router.post("/scan", protect, scanQR);

// Teacher views report
router.get("/report", protect, getQRAttendanceReport);

module.exports = router;