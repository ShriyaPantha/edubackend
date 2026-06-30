const mongoose = require("mongoose");

const receptionistSchema = new mongoose.Schema(
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
      unique: true,
      trim: true,
    },
    phone: {
      type: String,
      default: null,
    },
    address: {
      type: String,
      default: null,
    },
    profileImage: {
      type: String,
      default: "",
    },
    // What receptionist can access
    permissions: {
      viewStudents: { type: Boolean, default: true },
      viewTeachers: { type: Boolean, default: true },
      viewParents: { type: Boolean, default: true },
      viewAttendance: { type: Boolean, default: true },
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Receptionist", receptionistSchema);