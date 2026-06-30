const mongoose = require("mongoose");

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      enum: ["basic", "standard", "premium"],
      required: true,
      unique: true,
    },
    price: { type: Number, required: true }, // monthly price in NPR
    description: { type: String, default: "" },
    features: {
      maxStudents: { type: Number, default: 100 },
      maxTeachers: { type: Number, default: 10 },
      maxAdmins: { type: Number, default: 1 },
      hasQRAttendance: { type: Boolean, default: false },
      hasOnlinePayment: { type: Boolean, default: false },
      hasCRM: { type: Boolean, default: false },
      hasDocumentUpload: { type: Boolean, default: false },
      hasTimetable: { type: Boolean, default: true },
      hasNotifications: { type: Boolean, default: true },
      storageGB: { type: Number, default: 1 },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Plan", planSchema);