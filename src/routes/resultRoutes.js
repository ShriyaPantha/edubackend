const express = require("express");
const router = express.Router();
const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const { protect } = require("../middleware/authMiddleware");
const {
  publishResults,
  getExamResults,
  getMyResult,
  getAllMyResults,
  getChildResults,
  getReportCard,
  updateResult,
  deleteResult,
} = require("../controller/resultController");

router.get("/my", protect, getAllMyResults);
router.get("/my/:examId", protect, getMyResult);
router.get("/report-card/:examId/:studentId", protect, getReportCard);

//  Parent routes (User token)
router.get("/child/:studentId", protect, getChildResults);

//Admin routes (Admin token)
router.post("/publish", protectAdmin, publishResults);
router.get("/exam/:examId", protectAdmin, getExamResults);
router.put("/:id", protectAdmin, updateResult);
router.delete("/:id", protectAdmin, deleteResult);

module.exports = router;