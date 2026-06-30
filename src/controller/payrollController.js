const Payroll = require("../model/payrollSchema");
const StaffSalary = require("../model/staffSalarySchema");
const Teacher = require("../model/teacherSchema");
const Admin = require("../model/adminSchema");
const Receptionist = require("../model/receptionistSchema");
const School = require("../model/schoolSchema");
const Notification = require("../model/notificationSchema");
const { sendEmail } = require("../utils/sendEmail");
const { calculatePayroll, getStaffInfo } = require("../services/payrollService");
const cron = require("node-cron");

// =========================
// SET STAFF SALARY CONFIG (Admin)
// Must be done before generating payroll
// =========================
exports.setStaffSalary = async (req, res) => {
  try {
    const {
      staffId,
      staffModel,
      basicSalary,
      allowances,
      pfRate,
      taxRate,
      workingDays,
    } = req.body;

    if (!staffId || !staffModel || !basicSalary) {
      return res.status(400).json({ message: "staffId, staffModel and basicSalary are required" });
    }

    if (!["Teacher", "Admin", "Receptionist"].includes(staffModel)) {
      return res.status(400).json({ message: "staffModel must be Teacher, Admin or Receptionist" });
    }

    const adminSchoolId = req.admin.schoolId;

    const salaryConfig = await StaffSalary.findOneAndUpdate(
      { staffId, schoolId: adminSchoolId },
      {
        schoolId: adminSchoolId,
        staffId,
        staffModel,
        basicSalary,
        allowances: {
          houseRent: allowances?.houseRent || 0,
          transport: allowances?.transport || 0,
          medical: allowances?.medical || 0,
          other: allowances?.other || 0,
        },
        pfRate: pfRate || 10,
        taxRate: taxRate || 5,
        workingDays: workingDays || 26,
        isActive: true,
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      message: "Salary configuration saved",
      data: salaryConfig,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET ALL SALARY CONFIGS (Admin)
// =========================
exports.getSalaryConfigs = async (req, res) => {
  try {
    const configs = await StaffSalary.find({ schoolId: req.admin.schoolId });

    // Populate staff info manually
    const populated = await Promise.all(
      configs.map(async (config) => {
        const staff = await getStaffInfo(config.staffId, config.staffModel);
        return {
          ...config.toObject(),
          staff: staff
            ? {
                _id: staff._id,
                name: staff.fullName || staff.userId?.fullName,
                email: staff.email || staff.userId?.email,
                model: config.staffModel,
              }
            : null,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: populated.length,
      data: populated,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GENERATE SINGLE PAYROLL (Admin — manual)
// =========================
exports.generatePayroll = async (req, res) => {
  try {
    const {
      staffId,
      staffModel,
      month,
      year,
      absentDays,
      extraDeductions,
      extraAllowances,
      remarks,
    } = req.body;

    if (!staffId || !staffModel || !month || !year) {
      return res.status(400).json({ message: "staffId, staffModel, month and year are required" });
    }

    const adminSchoolId = req.admin.schoolId;

    // Check salary config exists
    const salaryConfig = await StaffSalary.findOne({
      staffId,
      schoolId: adminSchoolId,
    });

    if (!salaryConfig) {
      return res.status(404).json({
        message: "Salary configuration not found for this staff. Set it first.",
      });
    }

    // Check not already generated
    const existing = await Payroll.findOne({ staffId, month, year });
    if (existing) {
      return res.status(400).json({
        message: `Payroll for ${getMonthName(month)} ${year} already exists for this staff`,
      });
    }

    // Calculate
    const calculated = calculatePayroll(
      salaryConfig,
      absentDays || 0,
      extraDeductions || {},
      extraAllowances || {}
    );

    const payroll = await Payroll.create({
      schoolId: adminSchoolId,
      staffId,
      staffModel,
      month,
      year,
      ...calculated,
      remarks: remarks || "",
      generatedBy: "manual",
    });

  

    res.status(201).json({
      success: true,
      message: "Payroll generated successfully",
      data: payroll,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GENERATE PAYROLL FOR ALL STAFF (Admin)
// Generates payroll for entire school at once
// =========================
exports.generateBulkPayroll = async (req, res) => {
  try {
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({ message: "month and year are required" });
    }

    const adminSchoolId = req.admin.schoolId;

    // ✅ Get all salary configs for this school
    const salaryConfigs = await StaffSalary.find({
      schoolId: adminSchoolId,
      isActive: true,
    });

    if (!salaryConfigs.length) {
      return res.status(404).json({ message: "No salary configurations found. Set staff salaries first." });
    }

    const results = { success: [], skipped: [], failed: [] };

    for (const config of salaryConfigs) {
      try {
        // Skip if already generated
        const existing = await Payroll.findOne({
          staffId: config.staffId,
          month,
          year,
        });

        if (existing) {
          results.skipped.push(config.staffId);
          continue;
        }

        const calculated = calculatePayroll(config, 0, {}, {});

        const payroll = await Payroll.create({
          schoolId: adminSchoolId,
          staffId: config.staffId,
          staffModel: config.staffModel,
          month,
          year,
          ...calculated,
          generatedBy: "manual",
        });

        // Notify staff
        await notifyStaff(payroll, config.staffModel, "generated", adminSchoolId);

        results.success.push(config.staffId);
      } catch (err) {
        results.failed.push({ staffId: config.staffId, reason: err.message });
      }
    }

    res.status(200).json({
      success: true,
      message: `Bulk payroll done for ${getMonthName(month)} ${year}`,
      data: {
        generated: results.success.length,
        skipped: results.skipped.length,
        failed: results.failed.length,
        details: results,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// MARK PAYROLL AS PAID (Admin)
// =========================
exports.markAsPaid = async (req, res) => {
  try {
    const { paymentMethod, remarks } = req.body;

    const payroll = await Payroll.findOne({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
    });

    if (!payroll) return res.status(404).json({ message: "Payroll not found" });

    if (payroll.status === "paid") {
      return res.status(400).json({ message: "Payroll already marked as paid" });
    }

    payroll.status = "paid";
    payroll.paidAt = new Date();
    payroll.paidBy = req.admin._id;
    payroll.paymentMethod = paymentMethod || "cash";
    if (remarks) payroll.remarks = remarks;

    await payroll.save();

    // ✅ Notify staff payment done
    await notifyStaff(payroll, payroll.staffModel, "paid", req.admin.schoolId);

    res.status(200).json({
      success: true,
      message: "Payroll marked as paid",
      data: payroll,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET ALL PAYROLLS (Admin)
// =========================
exports.getAllPayrolls = async (req, res) => {
  try {
    const adminSchoolId = req.admin.schoolId;
    const { month, year, status, staffModel } = req.query;

    let filter = { schoolId: adminSchoolId };
    if (month) filter.month = Number(month);
    if (year) filter.year = Number(year);
    if (status) filter.status = status;
    if (staffModel) filter.staffModel = staffModel;

    const payrolls = await Payroll.find(filter).sort({ year: -1, month: -1 });

    // ✅ Populate staff info
    const populated = await Promise.all(
      payrolls.map(async (p) => {
        const staff = await getStaffInfo(p.staffId, p.staffModel);
        return {
          ...p.toObject(),
          staff: staff
            ? {
                _id: staff._id,
                name: staff.fullName || staff.userId?.fullName,
                email: staff.email || staff.userId?.email,
                model: p.staffModel,
              }
            : null,
        };
      })
    );

    // ✅ Summary
    const totalNetSalary = payrolls.reduce((s, p) => s + p.netSalary, 0);
    const totalPaid = payrolls
      .filter((p) => p.status === "paid")
      .reduce((s, p) => s + p.netSalary, 0);
    const totalPending = payrolls
      .filter((p) => p.status === "pending")
      .reduce((s, p) => s + p.netSalary, 0);

    res.status(200).json({
      success: true,
      count: populated.length,
      summary: {
        totalNetSalary,
        totalPaid,
        totalPending,
      },
      data: populated,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET MY PAYSLIPS (Staff self)
// =========================
exports.getMyPayslips = async (req, res) => {
  try {
    let staffId, staffModel;

    // ✅ Find which type of staff this user is
    const teacher = await Teacher.findOne({ userId: req.user._id });
    if (teacher) {
      staffId = teacher._id;
      staffModel = "Teacher";
    } else {
      const receptionist = await Receptionist.findOne({ userId: req.user._id });
      if (receptionist) {
        staffId = receptionist._id;
        staffModel = "Receptionist";
      } else {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const payslips = await Payroll.find({ staffId }).sort({ year: -1, month: -1 });

    const totalEarned = payslips
      .filter((p) => p.status === "paid")
      .reduce((s, p) => s + p.netSalary, 0);

    res.status(200).json({
      success: true,
      totalEarned,
      count: payslips.length,
      data: payslips,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET SINGLE PAYSLIP (Staff self)
// =========================
exports.getPayslipById = async (req, res) => {
  try {
    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) return res.status(404).json({ message: "Payslip not found" });

    const school = await School.findById(payroll.schoolId).select("name address phone");
    const staff = await getStaffInfo(payroll.staffId, payroll.staffModel);

    res.status(200).json({
      success: true,
      data: {
        school,
        staff: {
          name: staff?.fullName || staff?.userId?.fullName,
          email: staff?.email || staff?.userId?.email,
          model: payroll.staffModel,
        },
        payroll,
        monthName: getMonthName(payroll.month),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// UPDATE PAYROLL (Admin — before paying)
// =========================
exports.updatePayroll = async (req, res) => {
  try {
    const payroll = await Payroll.findOne({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
    });

    if (!payroll) return res.status(404).json({ message: "Payroll not found" });

    if (payroll.status === "paid") {
      return res.status(400).json({ message: "Cannot update a paid payroll" });
    }

    const { absentDays, extraDeductions, extraAllowances, remarks } = req.body;

    // ✅ Recalculate
    const salaryConfig = await StaffSalary.findOne({ staffId: payroll.staffId });
    if (!salaryConfig) return res.status(404).json({ message: "Salary config not found" });

    const calculated = calculatePayroll(
      salaryConfig,
      absentDays ?? payroll.absentDays,
      extraDeductions || {},
      extraAllowances || {}
    );

    Object.assign(payroll, calculated);
    if (remarks) payroll.remarks = remarks;
    await payroll.save();

    res.status(200).json({
      success: true,
      message: "Payroll updated and recalculated",
      data: payroll,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// DELETE PAYROLL (Admin — pending only)
// =========================
exports.deletePayroll = async (req, res) => {
  try {
    const payroll = await Payroll.findOne({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
      status: "pending",
    });

    if (!payroll) {
      return res.status(404).json({ message: "Payroll not found or already paid" });
    }

    await Payroll.findByIdAndDelete(req.params.id);

    res.status(200).json({ success: true, message: "Payroll deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// HELPER — Notify staff
// =========================
const notifyStaff = async (payroll, staffModel, event, schoolId) => {
  try {
    const staff = await getStaffInfo(payroll.staffId, staffModel);
    if (!staff) return;

    const userId = staff.userId?._id || staff._id;
    const email = staff.userId?.email || staff.email;
    const name = staff.userId?.fullName || staff.fullName;
    const school = await School.findById(schoolId).select("name");
    const monthName = getMonthName(payroll.month);

    const titles = {
      generated: `Payslip Generated: ${monthName} ${payroll.year}`,
      paid: `Salary Paid: ${monthName} ${payroll.year}`,
    };

    const messages = {
      generated: `Your payslip for ${monthName} ${payroll.year} has been generated. Net Salary: Rs ${payroll.netSalary}.`,
      paid: `Your salary of Rs ${payroll.netSalary} for ${monthName} ${payroll.year} has been paid via ${payroll.paymentMethod}.`,
    };

    await Notification.create({
      recipient: userId,
      schoolId,
      title: titles[event],
      message: messages[event],
      type: "general",
    });

    if (email) {
      await sendEmail({
        to: email,
        subject: `${school?.name} — ${titles[event]}`,
        html: payslipEmailTemplate({
          name,
          monthName,
          year: payroll.year,
          basicSalary: payroll.basicSalary,
          totalAllowances: payroll.totalAllowances,
          totalDeductions: payroll.totalDeductions,
          grossSalary: payroll.grossSalary,
          netSalary: payroll.netSalary,
          status: payroll.status,
          schoolName: school?.name,
          allowances: payroll.allowances,
          deductions: payroll.deductions,
          event,
        }),
      });
    }
  } catch (err) {
    console.error("❌ Notify staff error:", err.message);
  }
};

// =========================
// HELPER — Month name
// =========================
const getMonthName = (month) => {
  const months = ["", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return months[month] || "";
};

// =========================
// EMAIL TEMPLATE
// =========================
const payslipEmailTemplate = ({
  name, monthName, year, basicSalary, totalAllowances,
  totalDeductions, grossSalary, netSalary, status,
  schoolName, allowances, deductions, event,
}) => `
  <div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;">
    <div style="background:${event === "paid" ? "#28a745" : "#1a73e8"};padding:20px;border-radius:8px 8px 0 0;text-align:center;">
      <h2 style="color:white;margin:0;">💼 ${event === "paid" ? "Salary Paid" : "Payslip Generated"} — ${schoolName}</h2>
    </div>
    <div style="padding:30px;">
      <p>Dear <strong>${name}</strong>,</p>
      <p>${event === "paid" ? "Your salary has been paid." : "Your payslip has been generated."}</p>

      <h3 style="border-bottom:2px solid #1a73e8;padding-bottom:8px;">
        Payslip: ${monthName} ${year}
      </h3>

      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#e8f0fe;">
          <td colspan="2" style="padding:8px;font-weight:bold;">💰 Earnings</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">Basic Salary</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">Rs ${basicSalary}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">House Rent</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">Rs ${allowances.houseRent}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">Transport</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">Rs ${allowances.transport}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">Medical</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">Rs ${allowances.medical}</td>
        </tr>
        <tr style="background:#fff3cd;">
          <td style="padding:8px;border:1px solid #ddd;font-weight:bold;">Gross Salary</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;font-weight:bold;">Rs ${grossSalary}</td>
        </tr>

        <tr style="background:#f8d7da;">
          <td colspan="2" style="padding:8px;font-weight:bold;">➖ Deductions</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">Tax (${deductions.tax})</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;color:#dc3545;">- Rs ${deductions.tax}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">Provident Fund</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;color:#dc3545;">- Rs ${deductions.providentFund}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">Absence Deduction</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;color:#dc3545;">- Rs ${deductions.absence}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">Loan</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;color:#dc3545;">- Rs ${deductions.loan}</td>
        </tr>

        <tr style="background:${event === "paid" ? "#d4edda" : "#e8f0fe"};">
          <td style="padding:12px;border:1px solid #ddd;font-weight:bold;font-size:16px;">Net Salary</td>
          <td style="padding:12px;border:1px solid #ddd;text-align:right;font-weight:bold;font-size:16px;color:${event === "paid" ? "#28a745" : "#1a73e8"};">
            Rs ${netSalary}
          </td>
        </tr>
      </table>

      <p style="margin-top:20px;color:${event === "paid" ? "#28a745" : "#fd7e14"};font-weight:bold;">
        Status: ${status.toUpperCase()}
      </p>
      <p style="color:#888;font-size:12px;">This is an automated message from ${schoolName}.</p>
    </div>
  </div>`;

// =========================
// AUTO PAYROLL CRON
// Runs on 1st of every month at 6:00 AM
// =========================
exports.startPayrollCron = () => {
  cron.schedule("0 6 1 * *", async () => {
    try {
      console.log("💼 Running auto payroll generation...");

      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const allConfigs = await StaffSalary.find({ isActive: true });
      let generated = 0;

      for (const config of allConfigs) {
        try {
          const existing = await Payroll.findOne({
            staffId: config.staffId,
            month,
            year,
          });

          if (existing) continue;

          const calculated = calculatePayroll(config, 0, {}, {});

          const payroll = await Payroll.create({
            schoolId: config.schoolId,
            staffId: config.staffId,
            staffModel: config.staffModel,
            month,
            year,
            ...calculated,
            generatedBy: "auto",
          });

          await notifyStaff(payroll, config.staffModel, "generated", config.schoolId);
          generated++;
        } catch (err) {
          console.error(`❌ Auto payroll failed for ${config.staffId}:`, err.message);
        }
      }

      console.log(`✅ Auto payroll done. Generated: ${generated} payslips`);
    } catch (err) {
      console.error("❌ Payroll cron error:", err.message);
    }
  }, { timezone: "Asia/Kathmandu" });

  console.log("📅 Payroll cron scheduled — runs on 1st of every month at 6:00 AM");
};



// =========================
// SALARY PAYMENT REMINDER CRON
// Runs every day at 10:00 AM
// Reminds admin about unpaid payrolls
// Reminds staff their salary is pending
// =========================
exports.startSalaryReminderCron = () => {
  cron.schedule("0 10 * * *", async () => {
    try {
      console.log("💰 Running salary reminder job...");

      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      // Find all pending payrolls for current month
      const pendingPayrolls = await Payroll.find({
        status: "pending",
        month,
        year,
      });

      if (!pendingPayrolls.length) {
        console.log("✅ No pending payrolls found.");
        return;
      }

      console.log(`📋 Found ${pendingPayrolls.length} unpaid payrolls`);

      //Group by school so admin gets one summary email
      const bySchool = {};
      for (const payroll of pendingPayrolls) {
        const key = payroll.schoolId.toString();
        if (!bySchool[key]) bySchool[key] = [];
        bySchool[key].push(payroll);
      }

      for (const [schoolId, payrolls] of Object.entries(bySchool)) {
        try {
          const school = await School.findById(schoolId).select("name email");
          if (!school) continue;

          const Admin = require("../model/adminSchema");
          const admins = await Admin.find({ schoolId, isActive: true })
            .select("fullName email");

          const monthName = getMonthName(month);
          const totalPending = payrolls.reduce((s, p) => s + p.netSalary, 0);

          // ================================
          // NOTIFY EACH ADMIN OF THIS SCHOOL
          // ================================
          for (const admin of admins) {
            // DB Notification to admin
            await Notification.create({
              recipient: admin._id,
              schoolId,
              title: `⚠️ Salary Pending: ${monthName} ${year}`,
              message: `${payrolls.length} staff salary payments are pending for ${monthName} ${year}. Total amount: Rs ${totalPending}.`,
              type: "general",
            });

            // Email to admin
            if (admin.email) {
              await sendEmail({
                to: admin.email,
                subject: `⚠️ ${school.name} — Salary Payment Reminder: ${monthName} ${year}`,
                html: `
                  <div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;">
                    <div style="background:#fd7e14;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
                      <h2 style="color:white;margin:0;">⚠️ Salary Payment Reminder — ${school.name}</h2>
                    </div>
                    <div style="padding:30px;">
                      <p>Dear <strong>${admin.fullName}</strong>,</p>
                      <p>This is a reminder that the following staff salaries for <strong>${monthName} ${year}</strong> are still pending.</p>
                      <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:15px;margin:15px 0;">
                        <strong>Pending Payrolls:</strong> ${payrolls.length}<br/>
                        <strong>Total Amount Due:</strong> Rs ${totalPending}<br/>
                        <strong>Month:</strong> ${monthName} ${year}
                      </div>
                      <p style="color:#dc3545;font-weight:bold;">Please process the payments as soon as possible.</p>
                      <p style="color:#888;font-size:12px;">This is an automated reminder from ${school.name} School SaaS.</p>
                    </div>
                  </div>`,
              });
            }
          }

          // ================================
          // NOTIFY EACH STAFF MEMBER
          // Their salary is pending
          // ================================
          for (const payroll of payrolls) {
            try {
              const staff = await getStaffInfo(payroll.staffId, payroll.staffModel);
              if (!staff) continue;

              const userId = staff.userId?._id || staff._id;
              const email = staff.userId?.email || staff.email;
              const name = staff.userId?.fullName || staff.fullName;
              const monthName = getMonthName(payroll.month);

              // DB Notification to staff
              await Notification.create({
                recipient: userId,
                schoolId,
                title: `💰 Salary Pending: ${monthName} ${year}`,
                message: `Your salary of Rs ${payroll.netSalary} for ${monthName} ${year} is pending. It will be processed soon.`,
                type: "general",
              });

              // Email to staff
              if (email) {
                await sendEmail({
                  to: email,
                  subject: `${school.name} — Salary Pending: ${monthName} ${year}`,
                  html: `
                    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;">
                      <div style="background:#1a73e8;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
                        <h2 style="color:white;margin:0;">💰 Salary Update — ${school.name}</h2>
                      </div>
                      <div style="padding:30px;">
                        <p>Dear <strong>${name}</strong>,</p>
                        <p>Your payslip for <strong>${monthName} ${year}</strong> has been generated and is currently being processed.</p>
                        <div style="background:#e8f0fe;border-radius:6px;padding:15px;margin:15px 0;">
                          <strong>Month:</strong> ${monthName} ${year}<br/>
                          <strong>Net Salary:</strong> Rs ${payroll.netSalary}<br/>
                          <strong>Status:</strong> 
                          <span style="color:#fd7e14;font-weight:bold;">PENDING</span>
                        </div>
                        <p style="color:#555;">Your salary will be credited soon. Contact admin for queries.</p>
                        <p style="color:#888;font-size:12px;">This is an automated message from ${school.name}.</p>
                      </div>
                    </div>`,
                });
              }

              console.log(`✅ Reminded: ${name} — Salary pending Rs ${payroll.netSalary}`);
            } catch (err) {
              console.error(`❌ Staff reminder error:`, err.message);
            }
          }
        } catch (err) {
          console.error(`❌ School reminder error for ${schoolId}:`, err.message);
        }
      }

      console.log("✅ Salary reminder job completed.");
    } catch (err) {
      console.error("❌ Salary reminder cron error:", err.message);
    }
  }, { timezone: "Asia/Kathmandu" });

  console.log("📅 Salary reminder cron scheduled — runs daily at 10:00 AM");
};