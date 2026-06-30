// routes/assignmentRoutes.js

const express = require("express");
const router = express.Router();

const {
  createAssignment,
  getAllAssignments,
  getAssignmentsByClass,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
  submitAssignment,
  getAssignmentSubmissions,
  gradeSubmission,
  getMySubmissions,
} = require("../controller/assignmentController");

// Adjust these imports to match your actual auth middleware file/exports.
// `protect` should populate req.user (student/teacher) and set req.admin
// when the token belongs to an admin — matches how the controller checks
// `req.admin` vs `req.user` vs Teacher.findOne(...).
const { protect } = require("../middleware/authMiddleware");

// ─── Create ─────────────────────────────────────────────────────────────────
// Teacher only (controller checks Teacher.findOne)
router.post("/", protect, createAssignment);

// ─── Read ───────────────────────────────────────────────────────────────────
// Role-aware: admin sees all in school, teacher sees own, parent sees
// children's classes, student sees own class (controller handles all cases)
router.get("/", protect, getAllAssignments);

// Student-specific: assignments for a given class/section
router.get("/class/:class/section/:section", protect, getAssignmentsByClass);

// Student-specific: my own submissions (must come before /:id to avoid
// Express matching "my-submissions" as an :id param)
router.get("/my-submissions", protect, getMySubmissions);

// Single assignment
router.get("/:id", protect, getAssignmentById);

// ─── Update / Delete ────────────────────────────────────────────────────────
router.patch("/:id", protect, updateAssignment);
router.delete("/:id", protect, deleteAssignment);

// ─── Submissions ────────────────────────────────────────────────────────────
// Student submits their work
router.post("/submit", protect, submitAssignment);

// Teacher views all submissions for one of their assignments
router.get("/:assignmentId/submissions", protect, getAssignmentSubmissions);

// Teacher grades a specific submission
router.patch("/submissions/:submissionId/grade", protect, gradeSubmission);

module.exports = router;