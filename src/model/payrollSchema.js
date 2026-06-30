const mongoose = require("mongoose");

const payrollSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    // ✅ Staff member reference (any role)
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "staffModel",
    },
    staffModel: {
      type: String,
      enum: ["Teacher", "Admin", "Receptionist"],
      required: true,
    },
    month: { type: Number, required: true }, // 1-12
    year: { type: Number, required: true },
    // ✅ Salary breakdown
    basicSalary: { type: Number, required: true },
    allowances: {
      houseRent: { type: Number, default: 0 },
      transport: { type: Number, default: 0 },
      medical: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
    },
    deductions: {
      tax: { type: Number, default: 0 },
      providentFund: { type: Number, default: 0 },  // PF
      absence: { type: Number, default: 0 },         // deducted per absent day
      loan: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
    },
    // ✅ Auto-calculated
    totalAllowances: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    grossSalary: { type: Number, default: 0 },   // basicSalary + totalAllowances
    netSalary: { type: Number, default: 0 },      // grossSalary - totalDeductions
    // ✅ Attendance based deduction
    workingDays: { type: Number, default: 26 },
    presentDays: { type: Number, default: 26 },
    absentDays: { type: Number, default: 0 },
    // ✅ Payment status
    status: {
      type: String,
      enum: ["pending", "paid", "cancelled"],
      default: "pending",
    },
    paidAt: { type: Date, default: null },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "bank", "cheque"],
      default: "cash",
    },
    remarks: { type: String, default: "" },
    generatedBy: {
      type: String,
      enum: ["manual", "auto"],
      default: "manual",
    },
  },
  { timestamps: true }
);

//One payroll per staff per month per year
payrollSchema.index(
  { staffId: 1, month: 1, year: 1 },
  { unique: true }
);

module.exports = mongoose.model("Payroll", payrollSchema);