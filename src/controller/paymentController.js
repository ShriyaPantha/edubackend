const Fee = require("../model/feeSchema");
const Payment = require("../model/paymentSchema");
const Notification = require("../model/notificationSchema");

// =========================
// SUBMIT FEE PAYMENT (Parent/Student)
// POST /api/payments/fee/submit
// Body: { feeId, transactionId }
// =========================
exports.submitFeePayment = async (req, res) => {
  try {
    const { feeId, transactionId } = req.body;

    if (!feeId || !transactionId?.trim()) {
      return res.status(400).json({
        success: false,
        message: "feeId and transactionId are required",
      });
    }

    const fee = await Fee.findById(feeId);
    if (!fee) {
      return res.status(404).json({ success: false, message: "Fee not found" });
    }

    if (fee.status === "paid") {
      return res.status(400).json({
        success: false,
        message: "This fee is already fully paid",
      });
    }

    // Prevent duplicate transaction ID submissions
    const duplicate = await Payment.findOne({ transactionId: transactionId.trim() });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "This transaction ID has already been submitted",
      });
    }

    // Prevent duplicate pending submission for the same fee
    const existingPending = await Payment.findOne({
      feeId,
      submittedBy: req.user._id,
      status: "pending",
    });
    if (existingPending) {
      return res.status(409).json({
        success: false,
        message: "You already have a pending submission for this fee. Please wait for admin review.",
      });
    }

    const payment = await Payment.create({
      feeId,
      studentId:     fee.studentId,
      schoolId:      fee.schoolId,
      submittedBy:   req.user._id,
      transactionId: transactionId.trim(),
      amount:        fee.remainingAmount,
      method:        "esewa",
      status:        "pending",
    });

    res.status(201).json({
      success: true,
      message:
        "Payment submitted successfully. Admin will verify and update your fee status.",
      data: payment,
    });
  } catch (error) {
    console.error("[submitFeePayment]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// GET PENDING PAYMENTS (Admin)
// GET /api/payments/fee/pending
// =========================
exports.getPendingFeePayments = async (req, res) => {
  try {
    const filter = req.admin?.schoolId
      ? { status: "pending", schoolId: req.admin.schoolId }
      : { status: "pending" };

    const payments = await Payment.find(filter)
      .populate("feeId", "title totalAmount remainingAmount dueDate")
      .populate("studentId", "class section admissionNumber")
      .populate("submittedBy", "fullName email")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: payments.length, data: payments });
  } catch (error) {
    console.error("[getPendingFeePayments]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// APPROVE PAYMENT (Admin)
// POST /api/payments/fee/approve/:paymentId
// =========================
exports.approveFeePayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    if (payment.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Payment is already ${payment.status}`,
      });
    }

    const fee = await Fee.findById(payment.feeId);
    if (!fee) {
      return res.status(404).json({ success: false, message: "Fee not found" });
    }

    // Update fee amounts
    fee.paidAmount      = (fee.paidAmount || 0) + payment.amount;
    fee.remainingAmount = Math.max(0, fee.totalAmount - fee.paidAmount);
    fee.status          = fee.remainingAmount === 0 ? "paid" : "partial";
    await fee.save();

    // Mark payment approved
    payment.status     = "approved";
    payment.reviewedBy = req.admin._id;
    payment.reviewedAt = new Date();
    await payment.save();

    // Notify parent
    await Notification.create({
      recipient: payment.submittedBy,
      schoolId:  payment.schoolId,
      title:     "Payment Approved ✅",
      message:   `Your payment of Rs ${payment.amount.toLocaleString()} for "${fee.title}" has been approved and your fee record has been updated.`,
      type:      "general",
    });

    res.status(200).json({
      success: true,
      message: "Payment approved and fee updated",
      data: payment,
    });
  } catch (error) {
    console.error("[approveFeePayment]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// REJECT PAYMENT (Admin)
// POST /api/payments/fee/reject/:paymentId
// Body: { note } — optional rejection reason
// =========================
exports.rejectFeePayment = async (req, res) => {
  try {
    const { note } = req.body;

    const payment = await Payment.findById(req.params.paymentId);
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    if (payment.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Payment is already ${payment.status}`,
      });
    }

    payment.status        = "rejected";
    payment.rejectionNote = note?.trim() || null;
    payment.reviewedBy    = req.admin._id;
    payment.reviewedAt    = new Date();
    await payment.save();

    const fee = await Fee.findById(payment.feeId);

    await Notification.create({
      recipient: payment.submittedBy,
      schoolId:  payment.schoolId,
      title:     "Payment Rejected ❌",
      message:   `Your payment submission for "${fee?.title ?? "a fee"}" was rejected.${
        note ? ` Reason: ${note.trim()}` : " Please contact the school for details."
      }`,
      type: "general",
    });

    res.status(200).json({
      success: true,
      message: "Payment rejected",
      data: payment,
    });
  } catch (error) {
    console.error("[rejectFeePayment]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// GET PAYMENT HISTORY
// Admin → GET /api/payments/history      (all payments for their school)
// Parent → GET /api/payments/my-payments (only their own)
// =========================
exports.getPayments = async (req, res) => {
  try {
    const filter = req.admin
      ? { schoolId: req.admin.schoolId }
      : { submittedBy: req.user._id };

    const payments = await Payment.find(filter)
      .populate("feeId", "title totalAmount dueDate status")
      .populate("studentId", "class section admissionNumber")
      .populate("submittedBy", "fullName email")
      .populate("reviewedBy", "fullName email")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: payments.length, data: payments });
  } catch (error) {
    console.error("[getPayments]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};