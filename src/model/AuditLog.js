// model/AuditLog.js
const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    action:   { type: String, required: true },
    user:     { type: String, default: "System" },
    userId:   { type: mongoose.Schema.Types.ObjectId, default: null },
    role:     { type: String, default: "system" },
    category: {
      type: String,
      enum: ["Auth", "User", "Settings", "Security"],
      default: "User",
    },
    status: {
      type: String,
      enum: ["success", "warning", "danger"],
      default: "success",
    },
    ip:      { type: String, default: null },
    meta:    { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuditLog", auditLogSchema);