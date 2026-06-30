const Teacher = require("../model/teacherSchema");
const Admin = require("../model/adminSchema");
const Receptionist = require("../model/receptionistSchema");

// =========================
// GET STAFF USER INFO
// =========================
exports.getStaffInfo = async (staffId, staffModel) => {
  let staff;
  if (staffModel === "Teacher") {
    staff = await Teacher.findById(staffId).populate("userId", "fullName email");
  } else if (staffModel === "Admin") {
    staff = await Admin.findById(staffId);
  } else if (staffModel === "Receptionist") {
    staff = await Receptionist.findById(staffId).populate("userId", "fullName email");
  }
  return staff;
};

// =========================
// CALCULATE PAYROLL
// =========================
exports.calculatePayroll = (salaryConfig, absentDays = 0, extraDeductions = {}, extraAllowances = {}) => {
  const basicSalary = salaryConfig.basicSalary;
  const workingDays = salaryConfig.workingDays || 26;

  const allowances = {
    houseRent: salaryConfig.allowances?.houseRent || 0,
    transport: salaryConfig.allowances?.transport || 0,
    medical: salaryConfig.allowances?.medical || 0,
    other: (salaryConfig.allowances?.other || 0) + (extraAllowances.other || 0),
  };

  const totalAllowances = Object.values(allowances).reduce((a, b) => a + b, 0);
  const grossSalary = basicSalary + totalAllowances;

  const perDaySalary = basicSalary / workingDays;
  const absenceDeduction = Math.round(perDaySalary * absentDays);

  const pfDeduction = Math.round((basicSalary * (salaryConfig.pfRate || 10)) / 100);
  const taxDeduction = Math.round((grossSalary * (salaryConfig.taxRate || 5)) / 100);

  const deductions = {
    tax: taxDeduction,
    providentFund: pfDeduction,
    absence: absenceDeduction,
    loan: extraDeductions.loan || 0,
    other: extraDeductions.other || 0,
  };

  const totalDeductions = Object.values(deductions).reduce((a, b) => a + b, 0);
  const netSalary = Math.max(0, grossSalary - totalDeductions);

  return {
    basicSalary,
    allowances,
    deductions,
    totalAllowances,
    totalDeductions,
    grossSalary,
    netSalary,
    workingDays,
    presentDays: workingDays - absentDays,
    absentDays,
  };
};