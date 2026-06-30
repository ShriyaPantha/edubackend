const crypto = require("crypto");
const Plan = require("../model/planSchema");
const Subscription = require("../model/subscriptionSchema");

// =============================================================================
// HELPER — generate UUID, prefixed with purpose so esewaVerify can route correctly
// Format: s-{subscriptionId}-{base36Timestamp}-{6hexRand}
// =============================================================================
const generateTxnUuid = (purpose, refId) => {
  const rand = crypto.randomBytes(3).toString("hex");
  const ts = Date.now().toString(36);
  return `${purpose}-${refId}-${ts}-${rand}`;
};

// =============================================================================
// SUBSCRIPTION ESEWA INIT
// Creates a "pending" Subscription doc first (school stays null until superadmin
// approval, per your schema), then signs payment against its _id.
// =============================================================================
exports.subscriptionEsewaInit = async (req, res) => {
  try {
    const { planId, months } = req.body;

    if (!planId || !months) {
      return res.status(400).json({ message: "planId and months are required" });
    }

    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    const totalAmount = Math.round(plan.price * months);

    // req.admin is set by protectAdmin — adjust field names if yours differ
    const requestingUserId = req.admin?._id || req.admin?.userId || null;
    const requestingUserEmail = req.admin?.email || "";
    const requestingUserName = req.admin?.fullName || req.admin?.name || "";

    const subscription = await Subscription.create({
      plan: planId,
      months,
      totalAmount,
      paymentMethod: "esewa",
      status: "pending",
      requestingUserId,
      requestingUserEmail,
      requestingUserName,
    });

    const amount = String(totalAmount);
    const transactionUuid = generateTxnUuid("s", subscription._id.toString());
    const secret = process.env.ESEWA_SECRET_KEY;
    const productCode = process.env.ESEWA_MERCHANT_ID;

    const message = `total_amount=${amount},transaction_uuid=${transactionUuid},product_code=${productCode}`;
    const signature = crypto.createHmac("sha256", secret).update(message).digest("base64");

    const fields = {
      amount,
      tax_amount: "0",
      total_amount: amount,
      transaction_uuid: transactionUuid,
      product_code: productCode,
      product_service_charge: "0",
      product_delivery_charge: "0",
      success_url: `${process.env.BASE_URL}/api/payments/esewa/verify`,
      failure_url: `${process.env.BASE_URL}/api/payments/esewa/fail`,
      signed_field_names: "total_amount,transaction_uuid,product_code",
      signature,
    };

    res.status(200).json({
      success: true,
      message: "eSewa subscription payment initiated",
      data: {
        payment_url: process.env.ESEWA_PAYMENT_URL,
        fields,
        subscriptionId: subscription._id,
        amount,
      },
    });
  } catch (err) {
    console.error("[subscriptionEsewaInit]", err.message);
    res.status(500).json({ message: err.message });
  }
};