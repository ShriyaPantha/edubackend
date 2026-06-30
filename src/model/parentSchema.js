const mongoose = require("mongoose");

const parentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    occupation: {
      type: String,
      trim: true,
      default: null,
    },
    address: {
      type: String,
      trim: true,
      default: null,
    },
    phone: {
      type: String,
      default: null,
    },
    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
      },
    ],
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    // ── Mirrored login credentials (kept in sync with User at creation time) ──
    email: {
      type: String,
      default: null,
      lowercase: true,
    },
    password: {
      type: String,
      default: null,
      select: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Parent", parentSchema);