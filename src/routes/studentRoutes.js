const express = require("express");
const router = express.Router();

const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const { protect }      = require("../middleware/authMiddleware");
const {
  createStudent,
  getAllStudents,
  getStudentById,
  getMyProfile,
  updateStudent,
  deleteStudent,
  getAvailableUsers,
  getStudentsForTeacher,  // ← add this
} = require("../controller/studentController");
const checkPlanLimit = require("../middleware/checkPlanLimit");

// ── Student self ──────────────────────────────────────────────────────────────
router.get("/me",              protect,      getMyProfile);

// ── Teacher view (read-only, uses regular user token) ────────────────────────
router.get("/school",          protect,      getStudentsForTeacher);   // ← NEW

// ── Admin only ────────────────────────────────────────────────────────────────
router.get("/available-users", protectAdmin, getAvailableUsers);
router.post("/",               protectAdmin, checkPlanLimit("student"), createStudent);
router.get("/",                protectAdmin, getAllStudents);
router.get("/:id",             protectAdmin, getStudentById);
router.put("/:id",             protectAdmin, updateStudent);
router.delete("/:id",          protectAdmin, deleteStudent);

module.exports = router;