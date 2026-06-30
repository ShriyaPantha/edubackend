const express = require("express");
const router = express.Router();
const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const { protect } = require("../middleware/authMiddleware");
const {
  createNotice,
  getNotices,
  getMyNotices,
  getNoticeById,
  updateNotice,
  deleteNotice,
} = require("../controller/noticeController");

// Student/Teacher/Parent (User token)
router.get("/my", protect, getMyNotices);
router.get("/:id", protect, getNoticeById);

// Admin only
router.post("/", protectAdmin, createNotice);
router.get("/", protectAdmin, getNotices);
router.put("/:id", protectAdmin, updateNotice);
router.delete("/:id", protectAdmin, deleteNotice);

module.exports = router;