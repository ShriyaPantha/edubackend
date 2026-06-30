const Notification = require("../model/notificationSchema");

// =========================
// GET MY NOTIFICATIONS
// GET /api/notifications?limit=20&unreadOnly=true
// =========================
exports.getMyNotifications = async (req, res) => {
  try {
    const { limit, unreadOnly } = req.query;

    const filter = { recipient: req.user._id };
    if (unreadOnly === "true") filter.isRead = false;

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit ? Math.min(parseInt(limit, 10) || 20, 100) : 20);

    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    res.status(200).json({
      success: true,
      unreadCount,
      count: notifications.length,
      data: notifications,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// MARK ONE NOTIFICATION READ
// PATCH /api/notifications/:id/read
// =========================
exports.markNotificationRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.status(200).json({ success: true, data: notification });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// MARK ALL NOTIFICATIONS READ
// PATCH /api/notifications/read-all
// =========================
exports.markAllNotificationsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true }
    );

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};