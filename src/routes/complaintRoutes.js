const express = require("express");
const router = express.Router();
const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const { protect } = require("../middleware/authMiddleware");
const {
  raiseComplaint,
  getMyComplaints,
  getComplaintById,
  getAllComplaints,
  updateComplaintStatus,
  addComment,
  deleteComplaint,
} = require("../controller/complaintController");

// ✅ Student/Parent/Teacher (User token)
router.post("/", protect, raiseComplaint);
router.get("/my", protect, getMyComplaints);
router.get("/:id", protect, getComplaintById);
router.post("/:id/comment", protect, addComment);

// ✅ Admin only
router.get("/admin/all", protectAdmin, getAllComplaints);
router.patch("/admin/:id/status", protectAdmin, updateComplaintStatus);
router.post("/admin/:id/comment", protectAdmin, addComment);
router.delete("/admin/:id", protectAdmin, deleteComplaint);

module.exports = router;