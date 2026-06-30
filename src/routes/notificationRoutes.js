const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware"); // adjust path to match your project
const {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require("../controller/notificationController");

router.get("/", protect, getMyNotifications);
router.patch("/read-all", protect, markAllNotificationsRead);
router.patch("/:id/read", protect, markNotificationRead);

module.exports = router;