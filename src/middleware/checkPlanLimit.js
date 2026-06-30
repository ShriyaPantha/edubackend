// middleware/checkPlanLimit.js
const mongoose = require("mongoose");
const Subscription = require("../model/subscriptionSchema");
const Student = require("../model/studentSchema");
const Teacher = require("../model/teacherSchema");
// add other models here if you reuse this for admins etc.

const RESOURCE_MODEL_MAP = {
  student: { model: Student, limitKey: "maxStudents" },
  teacher: { model: Teacher, limitKey: "maxTeachers" },
  // admin:   { model: Admin,   limitKey: "maxAdmins" },
};

const checkPlanLimit = (resourceType) => {
  return async (req, res, next) => {
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
      })
        .populate("plan")
        .sort({ endDate: -1 });

      if (!subscription || !subscription.plan) {
        return res.status(403).json({
          success: false,
          message: "No active subscription. Please subscribe to a plan first.",
        });
      }

      const resourceConfig = RESOURCE_MODEL_MAP[resourceType];
      if (!resourceConfig) {
        return res.status(500).json({
          success: false,
          message: `checkPlanLimit: unsupported resource type "${resourceType}"`,
        });
      }

      const { model, limitKey } = resourceConfig;
      const limit = subscription.plan.features?.[limitKey];

      if (typeof limit === "number") {
        const currentCount = await model.countDocuments({
          schoolId: req.admin.schoolId,
        });

        if (currentCount >= limit) {
          return res.status(403).json({
            success: false,
            message: `Plan limit reached: your ${subscription.plan.name} plan allows up to ${limit} ${resourceType}s.`,
          });
        }
      }

      req.subscription = subscription;
      next();
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  };
};

module.exports = checkPlanLimit;