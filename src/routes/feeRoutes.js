const express = require("express");
const router = express.Router();
const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const { protect } = require("../middleware/authMiddleware");
const {
  createFee,
  getAllFees,
  getStudentFees,
  getFeeById,
  updateFee,
  deleteFee,
} = require("../controller/feeController");

// Admin only
router.post("/", protectAdmin, createFee);
router.get("/", protectAdmin, getAllFees);             // ?status=pending
router.put("/:id", protectAdmin, updateFee);
router.delete("/:id", protectAdmin, deleteFee);

// Admin or Student
router.get("/:id", protect, getFeeById);
router.get("/student/:studentId", protect, getStudentFees);

module.exports = router;