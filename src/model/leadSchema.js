const mongoose = require("mongoose");

const leadSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    //Prospective student info
    studentName: { type: String, required: true, trim: true },
    parentName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true },
    address: { type: String, default: null },
    applyingForClass: { type: String, required: true },
    // Lead pipeline
    status: {
      type: String,
      enum: [
        "inquiry",      // just contacted
        "contacted",    // admin reached out
        "applied",      // form submitted
        "interview",    // called for interview
        "admitted",     // confirmed admission
        "rejected",     // not admitted
        "dropped",      // lost interest
      ],
      default: "inquiry",
    },
    source: {
      type: String,
      enum: ["walk-in", "phone", "website", "referral", "social-media", "other"],
      default: "walk-in",
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    notes: { type: String, default: "" },
    followUpDate: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Lead", leadSchema);