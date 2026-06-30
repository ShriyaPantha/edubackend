const express = require("express");
const router = express.Router();
const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const { protect }      = require("../middleware/authMiddleware");
const {
  createExam,
  publishResults,
  submitSubjectMarks,   // ← add
  getExams,
  getMyExams,
  getMyResult,
  getExamById,
  updateExam,
  deleteExam,
} = require("../controller/examController");

// Student / Teacher / Parent
router.get("/my",                 protect,      getMyExams);
router.get("/my-result/:examId",  protect,      getMyResult);

// Teacher — submit marks for their subject
router.post("/subject-marks",     protect,      submitSubjectMarks);   // ← NEW

// Admin only
router.post("/",                  protectAdmin, createExam);
router.post("/publish-results",   protectAdmin, publishResults);
router.get("/",                   protectAdmin, getExams);
router.get("/:id",                protectAdmin, getExamById);
router.put("/:id",                protectAdmin, updateExam);
router.delete("/:id",             protectAdmin, deleteExam);

module.exports = router;