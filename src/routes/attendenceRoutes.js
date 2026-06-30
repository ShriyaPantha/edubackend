// src/routes/attendenceRoutes.js  ← note: your file is spelled "attendence" not "attendance"
const express = require("express");
const router = express.Router();

const { protect }      = require("../middleware/authMiddleware");
const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const {
  markAttendance,
  markBulkAttendance,
  updateAttendance,
  getDailyAttendance,
  getStudentAttendance,
  getAllAttendance,
  getMyChildAttendance,   // ← was missing from import
} = require("../controller/attendanceController");

// ── Teacher routes ────────────────────────────────────────────────────────────
router.post("/",     protect, markAttendance);
router.post("/bulk", protect, markBulkAttendance);
router.patch("/:date", protect, updateAttendance);
router.get("/daily", protect, getDailyAttendance);

// ── Parent convenience route ──────────────────────────────────────────────────
// MUST be defined BEFORE /student/:studentId
// otherwise Express matches "my-child" as the :studentId param
router.get("/my-child", protect, getMyChildAttendance);   // ← was missing entirely

// ── Student / Parent — explicit studentId ─────────────────────────────────────
router.get("/student/:studentId", protect, getStudentAttendance);

// ── Admin routes ──────────────────────────────────────────────────────────────
router.get("/admin/all",   protectAdmin, getAllAttendance);
router.get("/admin/daily", protectAdmin, getDailyAttendance);

module.exports = router;