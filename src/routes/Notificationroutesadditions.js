// ─── ADD THESE 3 ROUTES to your existing notificationRoutes.js ───────────────
// They are called by ParentNavbar (and StudentNavbar / TeacherNavbar too)

const express = require("express");
const router  = express.Router();
const Notification = require("../model/notificationSchema");
const { protect } = require("../middleware/authMiddleware");

// GET /api/notifications
// Returns the 30 most-recent notifications for the logged-in user
router.get("/", protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .select("title message type isRead createdAt");

    res.status(200).json({ success: true, data: notifications });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/notifications/:id/read
// Mark a single notification as read
router.patch("/:id/read", protect, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { isRead: true }
    );
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/notifications/read-all
// Mark every unread notification for this user as read
router.patch("/read-all", protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true }
    );
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;