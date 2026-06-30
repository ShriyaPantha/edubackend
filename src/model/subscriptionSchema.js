const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    // school is optional until superadmin approves — NO unique index here
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", default: null },
    plan:   { type: mongoose.Schema.Types.ObjectId, ref: "Plan", required: true },

    status: {
      type: String,
      enum: ["pending", "active", "rejected", "cancelled", "expired"],
      default: "pending",
    },

    months:      { type: Number, required: true },
    totalAmount: { type: Number },
    startDate:   { type: Date, default: null },
    endDate:     { type: Date, default: null },

    paymentMethod: {
      type: String,
      enum: ["esewa", "cash"],
      required: true,
    },
    transactionId: { type: String, default: null },

    requestedAt:         { type: Date, default: Date.now },
    requestingUserEmail: { type: String },
    requestingUserName:  { type: String },
    requestingUserId:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    approvedAt:   { type: Date, default: null },
    rejectedAt:   { type: Date, default: null },
    rejectReason: { type: String, default: null },
    cancelledAt:  { type: Date, default: null },
    autoRenew:    { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Explicitly tell Mongoose NOT to create any extra indexes beyond _id
// This prevents accidental unique index recreation on school/schoolId
subscriptionSchema.set("autoIndex", false);

module.exports = mongoose.model("Subscription", subscriptionSchema);