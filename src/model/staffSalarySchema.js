const mongoose = require("mongoose");

const staffSalarySchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "staffModel",
      unique: true,
    },
    staffModel: {
      type: String,
      enum: ["Teacher", "Admin", "Receptionist"],
      required: true,
    },
    basicSalary: { type: Number, required: true },
    allowances: {
      houseRent: { type: Number, default: 0 },
      transport: { type: Number, default: 0 },
      medical: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
    },
    // ✅ PF and tax rates in percentage
    pfRate: { type: Number, default: 10 },   // 10% of basic
    taxRate: { type: Number, default: 5 },    // 5% of gross
    workingDays: { type: Number, default: 26 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StaffSalary", staffSalarySchema);