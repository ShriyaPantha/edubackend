const StaffSalary = require("../model/staffSalarySchema");
const Attendance = require("../model/attendenceSchema");
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
// COUNT STAFF ATTENDANCE
// Uses teacher userId to check attendance records
// =========================
exports.getStaffAttendanceSummary = async (staffId, staffModel, month, year) => {
  // For staff, we count working days vs absences from their leave records
  // Since we track student attendance, for staff we calculate from working days
  // You can extend this with a staff leave model later
  return { presentDays: 26, absentDays: 0 }; // default full attendance
};

// =========================
// CALCULATE PAYROLL
// =========================
exports.calculatePayroll = (salaryConfig, absentDays = 0, extraDeductions = {}, extraAllowances = {}) => {
  const basicSalary = salaryConfig.basicSalary;
  const workingDays = salaryConfig.workingDays || 26;

  // Allowances
  const allowances = {
    houseRent: salaryConfig.allowances?.houseRent || 0,
    transport: salaryConfig.allowances?.transport || 0,
    medical: salaryConfig.allowances?.medical || 0,
    other: (salaryConfig.allowances?.other || 0) + (extraAllowances.other || 0),
  };

  const totalAllowances = Object.values(allowances).reduce((a, b) => a + b, 0);
  const grossSalary = basicSalary + totalAllowances;

  // Per day salary for absence deduction
  const perDaySalary = basicSalary / workingDays;
  const absenceDeduction = Math.round(perDaySalary * absentDays);

  // PF on basic salary
  const pfDeduction = Math.round((basicSalary * (salaryConfig.pfRate || 10)) / 100);

  // Tax on gross salary
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