const mongoose = require("mongoose");

const teacherSchema = new mongoose.Schema(
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
    employeeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    department: {
      type: String,
      required: true,
      trim: true,
    },
    qualification: {
      type: String,
      trim: true,
    },
    subjects: [{ type: String, trim: true }],
    experience: {
      type: Number,
      default: 0,
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    salary: {
      type: Number,
      default: 0,
    },
    address: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      default: null,
    },
    bankAccountNumber: {
      type: String,
      trim: true,
      default: null,
    },
    profileImage: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["Active", "On Leave", "Suspended"],
      default: "Active",
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

module.exports = mongoose.model("Teacher", teacherSchema);