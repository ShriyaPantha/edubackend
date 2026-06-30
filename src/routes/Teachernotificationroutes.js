const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  getTeacherNotifications,
  markAsRead,
  markAllAsRead,
} = require("../controller/Teachernotificationcontroller");

router.get("/",              protect, getTeacherNotifications);
router.patch("/read-all",    protect, markAllAsRead);
router.patch("/:id/read",    protect, markAsRead);

module.exports = router;