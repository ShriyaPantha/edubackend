const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
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
    headOfDepartmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      default: null,
    },
    description: {
      type: String,
      default: "",
    },
    // Which classes (Student.class values) belong to this department.
    // e.g. ["9", "10", "11-Science"] — used to compute student/attendance/exam
    // performance per department since Student docs don't store a department directly.
    classes: [
      {
        type: String,
        trim: true,
      },
    ],
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true }
);

departmentSchema.index({ schoolId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Department", departmentSchema);