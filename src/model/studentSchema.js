const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
    admissionNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    rollNumber: {
      type: String,
      default: null,
    },
    class: {
      type: String,
      required: true,
    },
    section: {
      type: String,
      required: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    dob: {
      type: Date,
      default: null,
    },
    address: {
      type: String,
      default: null,
    },
    phone: {
      type: String,
      default: null,
    },
    profileImage: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "left"],
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
      select: false, // never returned unless explicitly selected
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Student", studentSchema);