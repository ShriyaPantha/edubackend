const express = require("express");
const router = express.Router();
const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const { protect } = require("../middleware/authMiddleware");
const {
  createTimetable,
  getTimetable,
  getMyTimetable,
  getTeacherTimetable,
  deleteTimetable,
} = require("../controller/timetableController");

// ── Specific routes FIRST — before /:id ──────────────────────────────────────
router.get("/my",      protect,      getMyTimetable);       // student
router.get("/teacher", protect,      getTeacherTimetable);  // teacher

// ── Admin routes ──────────────────────────────────────────────────────────────
router.post("/",       protectAdmin, createTimetable);
router.get("/",        protectAdmin, getTimetable);
router.delete("/:id",  protectAdmin, deleteTimetable);      // /:id LAST

module.exports = router;