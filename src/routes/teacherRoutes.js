const express = require("express");
const router = express.Router();

const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const { protect } = require("../middleware/authMiddleware");
const checkPlanLimit = require("../middleware/checkPlanLimit");
const {
  createTeacher,
  getAllTeachers,
  getTeacherById,
  getMyProfile,
  updateTeacher,
  deleteTeacher,
} = require("../controller/teacherController");

// Teacher self (User token)
router.get("/me", protect, getMyProfile);

// Admin only (Admin token)
router.post("/", protectAdmin, checkPlanLimit("teacher"), createTeacher);
router.get("/", protectAdmin, getAllTeachers);
router.get("/:id", protectAdmin, getTeacherById);
router.put("/:id", protectAdmin, updateTeacher);
router.delete("/:id", protectAdmin, deleteTeacher);

module.exports = router;