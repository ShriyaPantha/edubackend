const Notification = require("../model/notificationSchema");
const Teacher = require("../model/teacherSchema");

// =========================
// GET RECENT NOTIFICATIONS
// Teacher sees their own notifications
// GET /api/teacher/notifications?limit=10&unreadOnly=false
// =========================
exports.getTeacherNotifications = async (req, res) => {
  try {
    const { limit = 10, unreadOnly = "false" } = req.query;

    const filter = { recipient: req.user._id };
    if (unreadOnly === "true") filter.isRead = false;

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

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
  } catch (error) {
    console.error("[getTeacherNotifications]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// MARK ONE AS READ
// PATCH /api/teacher/notifications/:id/read
// =========================
exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// MARK ALL AS READ
// PATCH /api/teacher/notifications/read-all
// =========================
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true }
    );

    res.status(200).json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};