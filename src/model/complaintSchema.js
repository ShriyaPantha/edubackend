const mongoose = require("mongoose");

const complaintSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    // Who raised the complaint
    raisedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    raisedByRole: {
      type: String,
      enum: ["student", "parent", "teacher"],
      required: true,
    },
    // Complaint details
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: ["academic", "fee", "staff", "facility", "transport", "other"],
      default: "other",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    // Ticket tracking
    ticketNumber: { type: String, unique: true },
    status: {
      type: String,
      enum: ["open", "in-progress", "resolved", "closed", "rejected"],
      default: "open",
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    // Resolution
    resolution: { type: String, default: "" },
    resolvedAt: { type: Date, default: null },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    // Conversation thread
    comments: [
      {
        author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        authorRole: { type: String },
        message: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Auto-generate ticket number before save
complaintSchema.pre("save", async function () {
  if (!this.ticketNumber) {
    const count = await mongoose.model("Complaint").countDocuments();
    this.ticketNumber = `TKT-${String(count + 1).padStart(5, "0")}`;
  }
});

module.exports = mongoose.model("Complaint", complaintSchema);