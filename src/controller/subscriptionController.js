const mongoose = require("mongoose");
const cron = require("node-cron");
const Plan = require("../model/planSchema");
const Subscription = require("../model/subscriptionSchema");
const School = require("../model/schoolSchema");
const User = require("../model/userSchema");
const Notification = require("../model/notificationSchema");
const { sendEmail } = require("../utils/sendEmail");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const sendError = (res, status, message, detail = null) => {
  const body = { success: false, message };
  if (detail && process.env.NODE_ENV !== "production") body.detail = detail;
  return res.status(status).json(body);
};

// ─── Seed Plans ───────────────────────────────────────────────────────────────

const seedPlans = async (req, res) => {
  try {
    await Plan.deleteMany({});
    const plans = await Plan.insertMany([
      {
        name: "basic", price: 2000, description: "Perfect for small schools", isActive: true,
        features: { maxStudents: 200, maxTeachers: 15, maxAdmins: 1, hasQRAttendance: false, hasOnlinePayment: false, hasCRM: false, hasDocumentUpload: false, hasTimetable: true, hasNotifications: true, storageGB: 2 },
      },
      {
        name: "standard", price: 5000, description: "For growing schools", isActive: true,
        features: { maxStudents: 500, maxTeachers: 40, maxAdmins: 3, hasQRAttendance: true, hasOnlinePayment: true, hasCRM: false, hasDocumentUpload: true, hasTimetable: true, hasNotifications: true, storageGB: 10 },
      },
      {
        name: "premium", price: 10000, description: "Full featured for large schools", isActive: true,
        features: { maxStudents: 99999, maxTeachers: 99999, maxAdmins: 99999, hasQRAttendance: true, hasOnlinePayment: true, hasCRM: true, hasDocumentUpload: true, hasTimetable: true, hasNotifications: true, storageGB: 100 },
      },
    ]);
    return res.status(201).json({ success: true, message: "Plans seeded", data: plans });
  } catch (err) {
    return sendError(res, 500, "Failed to seed plans", err.message);
  }
};

// ─── Get Plans ────────────────────────────────────────────────────────────────

const getPlans = async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true }).sort({ price: 1 });
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ success: true, data: plans });
  } catch (err) {
    return sendError(res, 500, "Failed to fetch plans");
  }
};

// ─── Request Subscription ─────────────────────────────────────────────────────

const requestSubscription = async (req, res) => {
  try {
    const { planId, months, paymentMethod, transactionId } = req.body;

    if (!req.user?._id) return sendError(res, 401, "Authentication required.");

    if (!planId || !months || !paymentMethod || !transactionId) {
      return sendError(res, 400, "Missing required fields: planId, months, paymentMethod, transactionId");
    }

    const validPaymentMethods = ["esewa", "cash"];
    if (!validPaymentMethods.includes(paymentMethod)) {
      return sendError(res, 400, `Invalid payment method. Allowed: esewa, cash.`);
    }

    if (!isValidObjectId(planId)) {
      return sendError(res, 400, "Invalid plan ID. Please refresh and select a plan again.");
    }

    const validMonths = [1, 3, 6, 12];
    const parsedMonths = Number(months);
    if (!validMonths.includes(parsedMonths)) {
      return sendError(res, 400, `Invalid duration. Choose from: ${validMonths.join(", ")} months`);
    }

    const requestingUser = await User.findById(req.user._id).lean();
    if (!requestingUser) return sendError(res, 404, "User not found.");

    const plan = await Plan.findById(planId);
    if (!plan) return sendError(res, 404, "Plan not found.");
    if (!plan.isActive) return sendError(res, 400, "This plan is no longer available.");

    // Prevent duplicate pending — check by email only (no schoolId needed)
    const existing = await Subscription.findOne({
      status: "pending",
      requestingUserEmail: requestingUser.email,
    });
    if (existing) {
      return sendError(res, 409, "You already have a pending subscription request. Please wait for review.");
    }

    const totalAmount = plan.price * parsedMonths;
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + parsedMonths);

    const subscription = await Subscription.create({
      plan: plan._id,
      months: parsedMonths,
      totalAmount,
      paymentMethod,
      transactionId: transactionId.trim(),
      status: "pending",
      startDate,
      endDate,
      requestedAt: new Date(),
      requestingUserEmail: requestingUser.email,
      requestingUserName: requestingUser.fullName ?? requestingUser.name ?? requestingUser.email,
      requestingUserId: requestingUser._id,
      // school is intentionally NOT set here — created on approval
    });

    return res.status(201).json({
      success: true,
      message: "Subscription request submitted. Awaiting superadmin approval.",
      data: subscription,
    });

  } catch (err) {
    console.error("requestSubscription error:", err);
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message).join(", ");
      return sendError(res, 400, `Validation failed: ${messages}`);
    }
    if (err.name === "CastError") {
      return sendError(res, 400, `Invalid ID format for "${err.path}".`);
    }
    return sendError(res, 500, "Failed to submit subscription request", err.message);
  }
};

// ─── Approve Subscription ─────────────────────────────────────────────────────
// Auto-creates school from user's email, links it, sends notification + email

const approveSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    if (!isValidObjectId(subscriptionId)) return sendError(res, 400, "Invalid subscription ID.");

    const subscription = await Subscription.findById(subscriptionId).populate("plan");
    if (!subscription) return sendError(res, 404, "Subscription not found.");
    if (subscription.status !== "pending") return sendError(res, 400, `Cannot approve a "${subscription.status}" subscription.`);

    // ── Auto-create or find school from requesting user's email ───────────
    const userEmail = subscription.requestingUserEmail;
    const userName = subscription.requestingUserName ?? userEmail;

    if (!userEmail) {
      return sendError(res, 400, "No requesting user email on this subscription. Ask user to resubmit.");
    }

    let school = await School.findOne({ email: userEmail });

    if (!school) {
      school = await School.create({
        name: userName,
        email: userEmail,
        phone: "N/A",     // user/admin should update later
        address: "N/A",
        isActive: true,
      });
      console.log(`[Approve] Auto-created school: ${school.name} (${school._id})`);
    } else {
      console.log(`[Approve] Found existing school: ${school.name} (${school._id})`);
    }

    // ── Link school to subscription + activate ────────────────────────────
    subscription.school = school._id;
    subscription.status = "active";
    subscription.approvedAt = new Date();
    await subscription.save();

    // ── Update school subscription fields ─────────────────────────────────
    await School.findByIdAndUpdate(school._id, {
      activePlan: subscription.plan._id,
      subscriptionStatus: "active",
      subscriptionEndDate: subscription.endDate,
      isActive: true,
    });

    // ── Link school to requesting user ────────────────────────────────────
    if (subscription.requestingUserId) {
      await User.findByIdAndUpdate(subscription.requestingUserId, {
        $set: { schoolId: school._id },
      });
    }

    // ── Send in-app notification ──────────────────────────────────────────
    if (subscription.requestingUserId) {
      await Notification.create({
        recipient: subscription.requestingUserId,
        schoolId: school._id,
        title: "🎉 Subscription Approved!",
        message: `Your ${subscription.plan.name.toUpperCase()} plan has been activated. Your school "${school.name}" is now live. Welcome aboard!`,
        type: "subscription",
      });
    }

    // ── Send approval email ───────────────────────────────────────────────
    try {
      await sendEmail({
        to: userEmail,
        subject: `✅ Your ${subscription.plan.name.toUpperCase()} subscription is now active!`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;">
            <div style="background:#10b981;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
              <h2 style="color:white;margin:0;">🎉 Subscription Approved</h2>
            </div>
            <div style="padding:30px;">
              <p>Dear <strong>${userName}</strong>,</p>
              <p>Your subscription request has been <strong style="color:#10b981;">approved</strong>! Here are your details:</p>
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:16px;margin:16px 0;">
                <table style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td style="padding:6px 0;color:#6b7280;"><strong>School Name</strong></td>
                    <td style="padding:6px 0;color:#111;">${school.name}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#6b7280;"><strong>Plan</strong></td>
                    <td style="padding:6px 0;color:#111;text-transform:uppercase;">${subscription.plan.name}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#6b7280;"><strong>Duration</strong></td>
                    <td style="padding:6px 0;color:#111;">${subscription.months} month${subscription.months > 1 ? "s" : ""}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#6b7280;"><strong>Valid Until</strong></td>
                    <td style="padding:6px 0;color:#111;">${new Date(subscription.endDate).toLocaleDateString("en-NP", { day: "2-digit", month: "long", year: "numeric" })}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#6b7280;"><strong>Amount Paid</strong></td>
                    <td style="padding:6px 0;color:#111;">Rs ${Number(subscription.totalAmount).toLocaleString("ne-NP")}</td>
                  </tr>
                </table>
              </div>
              <p>You can now log in and start managing your school. Please update your school's phone and address from the settings page.</p>
              <p style="color:#9ca3af;font-size:12px;margin-top:24px;">This is an automated message. Please do not reply.</p>
            </div>
          </div>`,
      });

    } catch (emailErr) {
      // Email failure should not block the approval response
      console.error("[Approve] Email failed:", emailErr.message);
    }

    return res.status(200).json({
      success: true,
      message: "Subscription approved. School created/activated and user notified.",
      data: {
        subscription,
        school: {
          _id: school._id,
          name: school.name,
          email: school.email,
          phone: school.phone,
          address: school.address,
        },
      },
    });



    await logAudit({
      action: `Subscription approved for ${school.name}`,
      user: req.user?.fullName ?? "Superadmin",
      userId: req.user?._id,
      role: "superadmin",
      category: "Settings",
      status: "success",
      req,
      meta: { schoolId: school._id, plan: subscription.plan.name },
    });



  } catch (err) {
    console.error("approveSubscription error:", err);
    return sendError(res, 500, "Failed to approve subscription", err.message);
  }
};

// ─── Reject Subscription ──────────────────────────────────────────────────────

const rejectSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { reason } = req.body;

    if (!isValidObjectId(subscriptionId)) return sendError(res, 400, "Invalid subscription ID.");

    const subscription = await Subscription.findById(subscriptionId).populate("plan");
    if (!subscription) return sendError(res, 404, "Subscription not found.");
    if (subscription.status !== "pending") return sendError(res, 400, `Cannot reject a "${subscription.status}" subscription.`);

    subscription.status = "rejected";
    subscription.rejectedAt = new Date();
    subscription.rejectReason = reason?.trim() || "No reason provided";
    await subscription.save();

    // ── In-app notification ───────────────────────────────────────────────
    if (subscription.requestingUserId) {
      await Notification.create({
        recipient: subscription.requestingUserId,
        title: "❌ Subscription Request Rejected",
        message: `Your ${subscription.plan?.name?.toUpperCase() ?? ""} subscription request was rejected. Reason: ${subscription.rejectReason}`,
        type: "subscription",
      });
    }

    // ── Rejection email ───────────────────────────────────────────────────
    try {
      if (subscription.requestingUserEmail) {
        await sendEmail({
          to: subscription.requestingUserEmail,
          subject: "Subscription Request Rejected",
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;">
              <div style="background:#ef4444;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
                <h2 style="color:white;margin:0;">❌ Subscription Rejected</h2>
              </div>
              <div style="padding:30px;">
                <p>Dear <strong>${subscription.requestingUserName ?? subscription.requestingUserEmail}</strong>,</p>
                <p>Unfortunately your subscription request for the <strong>${subscription.plan?.name?.toUpperCase() ?? "selected"}</strong> plan has been <strong style="color:#ef4444;">rejected</strong>.</p>
                <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px;margin:16px 0;">
                  <strong>Reason:</strong> ${subscription.rejectReason}
                </div>
                <p>Please contact support if you believe this was a mistake or resubmit your request.</p>
                <p style="color:#9ca3af;font-size:12px;margin-top:24px;">This is an automated message. Please do not reply.</p>
              </div>
            </div>`,
        });
      }
    } catch (emailErr) {
      console.error("[Reject] Email failed:", emailErr.message);
    }

    return res.status(200).json({ success: true, message: "Subscription rejected.", data: subscription });
    await logAudit({
      action: `Subscription rejected: ${subscription.requestingUserEmail}`,
      user: req.user?.fullName ?? "Superadmin",
      userId: req.user?._id,
      role: "superadmin",
      category: "Settings",
      status: "warning",
      req,
      meta: { reason: subscription.rejectReason },
    });

  } catch (err) {
    return sendError(res, 500, "Failed to reject subscription", err.message);
  }
};

// ─── Get All Subscriptions (superadmin) ───────────────────────────────────────

const getAllSubscriptions = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const subscriptions = await Subscription.find(filter)
      .populate("school", "name email")
      .populate("plan", "name price features")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, data: subscriptions });
  } catch (err) {
    return sendError(res, 500, "Failed to fetch subscriptions", err.message);
  }
};

// ─── Get Subscription Requests (superadmin) ───────────────────────────────────

const getSubscriptionRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const requests = await Subscription.find(filter)
      .populate("school", "name email phone")
      .populate("plan", "name price features")
      .sort({ requestedAt: -1 })
      .lean();

    return res.status(200).json({ success: true, data: requests });
  } catch (err) {
    return sendError(res, 500, "Failed to fetch subscription requests", err.message);
  }
};

// ─── Get Subscription for a School ───────────────────────────────────────────

const getSubscription = async (req, res) => {
  try {
    const { schoolId } = req.params;
    if (!isValidObjectId(schoolId)) return sendError(res, 400, "Invalid school ID.");

    const isSuperAdmin = req.user?.role === "superadmin";
    const requesterSchoolId = req.user?.schoolId ?? req.user?._id;

    if (!isSuperAdmin && String(requesterSchoolId) !== String(schoolId)) {
      return sendError(res, 403, "Not authorized to view this subscription.");
    }

    const subscription = await Subscription.findOne({ school: schoolId })
      .populate("plan", "name price features")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, data: subscription ?? null });
  } catch (err) {
    return sendError(res, 500, "Failed to fetch subscription", err.message);
  }
};

// ─── Cancel Subscription ──────────────────────────────────────────────────────

const cancelSubscription = async (req, res) => {
  try {
    const { schoolId } = req.params;
    if (!isValidObjectId(schoolId)) return sendError(res, 400, "Invalid school ID.");

    const subscription = await Subscription.findOneAndUpdate(
      { school: schoolId, status: "active" },
      { status: "cancelled", cancelledAt: new Date() },
      { new: true }
    );

    if (!subscription) return sendError(res, 404, "No active subscription found for this school.");

    await School.findByIdAndUpdate(schoolId, { subscriptionStatus: "cancelled" });

    return res.status(200).json({ success: true, message: "Subscription cancelled.", data: subscription });
  } catch (err) {
    return sendError(res, 500, "Failed to cancel subscription", err.message);
  }
};

// ─── Cron: expire subscriptions daily at midnight ────────────────────────────

const startSubscriptionCron = () => {
  cron.schedule("0 0 * * *", async () => {
    try {
      const now = new Date();
      const expired = await Subscription.updateMany(
        { status: "active", endDate: { $lt: now } },
        { status: "expired" }
      );
      if (expired.modifiedCount > 0) {
        console.log(`[SubscriptionCron] Expired ${expired.modifiedCount} subscription(s)`);
      }
    } catch (err) {
      console.error("[SubscriptionCron] Error:", err.message);
    }
  });
  console.log("[SubscriptionCron] Scheduled — runs daily at midnight");
};


// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  seedPlans,
  getPlans,
  requestSubscription,
  getSubscriptionRequests,
  approveSubscription,
  rejectSubscription,
  getSubscription,
  getAllSubscriptions,
  cancelSubscription,
  startSubscriptionCron,
};