// middleware/checkActiveSubscription.js
const Subscription = require("../model/subscriptionSchema");

exports.checkActiveSubscription = async (req, res, next) => {
  try {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: "Admin not authenticated",
      });
    }

    if (!req.admin.schoolId) {
      return res.status(403).json({
        success: false,
        message: "Admin has no school assigned",
      });
    }

    const subscription = await Subscription.findOne({
      school: req.admin.schoolId,
      status: "active",
      endDate: { $gt: new Date() },
    }).sort({ endDate: -1 });

    if (!subscription) {
      return res.status(403).json({
        success: false,
        message: "No active subscription. Please subscribe to a plan first.",
      });
    }

    req.subscription = subscription;
    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};