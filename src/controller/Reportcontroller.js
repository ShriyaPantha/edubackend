const Student = require("../model/studentSchema");
const Teacher = require("../model/teacherSchema");
const Exam = require("../model/examSchema");
const Fee = require("../model/feeSchema");
const Payment = require("../model/paymentSchema");
const Attendance = require("../model/attendenceSchema");
const Payroll = require("../model/payrollSchema");
const AuditLog = require("../model/AuditLog");
const Parent = require("../model/parentSchema");

// =========================
// ACADEMIC REPORT
// Grade distribution across exams
// =========================
exports.getAcademicReport = async (req, res) => {
  try {
    const schoolId = req.admin.schoolId;

    const exams = await Exam.find({ schoolId }).sort({ examDate: -1 });

    const summary = {
      totalExams: exams.length,
      published: exams.filter(e => e.status === "published").length,
      upcoming: exams.filter(e => e.status === "upcoming").length,
      ongoing: exams.filter(e => e.status === "ongoing").length,
      completed: exams.filter(e => e.status === "completed").length,
    };

    // Grade distribution across all published exams
    const gradeCount = { "A+": 0, A: 0, "B+": 0, B: 0, "C+": 0, C: 0, F: 0 };
    let totalStudentResults = 0;
    let totalPassed = 0;

    for (const exam of exams) {
      if (exam.status !== "published") continue;
      for (const r of exam.results) {
        totalStudentResults++;
        if (r.isPassed) totalPassed++;
        if (r.grade && gradeCount[r.grade] !== undefined) gradeCount[r.grade]++;
      }
    }

    const students = await Student.find({ schoolId }).countDocuments();
    const teachers = await Teacher.find({ schoolId }).countDocuments();

    res.status(200).json({
      success: true,
      data: {
        summary,
        gradeDistribution: gradeCount,
        totalStudentResults,
        totalPassed,
        passRate: totalStudentResults > 0
          ? ((totalPassed / totalStudentResults) * 100).toFixed(1)
          : 0,
        totalStudents: students,
        totalTeachers: teachers,
        exams,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// FINANCIAL REPORT
// Fee collection + payroll
// =========================
exports.getFinancialReport = async (req, res) => {
  try {
    const schoolId = req.admin.schoolId;

    const fees = await Fee.find({ schoolId })
      .populate("studentId", "userId class section admissionNumber")
      .lean();

    const payments = await Payment.find({ schoolId }).lean();

    const payrolls = await Payroll.find({ schoolId }).lean();

    const feeSummary = {
      totalInvoiced: fees.reduce((a, f) => a + (f.totalAmount || 0), 0),
      totalCollected: fees.reduce((a, f) => a + (f.paidAmount || 0), 0),
      totalPending: fees.reduce((a, f) => a + (f.remainingAmount || 0), 0),
      paid: fees.filter(f => f.status === "paid").length,
      partial: fees.filter(f => f.status === "partial").length,
      pending: fees.filter(f => f.status === "pending").length,
    };

    const payrollSummary = {
      totalNetSalary: payrolls.reduce((a, p) => a + (p.netSalary || 0), 0),
      totalPaid: payrolls.filter(p => p.status === "paid").reduce((a, p) => a + (p.netSalary || 0), 0),
      totalPending: payrolls.filter(p => p.status === "pending").reduce((a, p) => a + (p.netSalary || 0), 0),
    };

    res.status(200).json({
      success: true,
      data: {
        feeSummary,
        payrollSummary,
        totalPayments: payments.length,
        fees,
        payrolls,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// ATTENDANCE REPORT
// Overall attendance stats
// =========================
exports.getAttendanceReport = async (req, res) => {
  try {
    const schoolId = req.admin.schoolId;
    const { startDate, endDate } = req.query;

    let filter = { schoolId };
    if (startDate && endDate) {
      filter.date = { $gte: startDate, $lte: endDate };
    }

    const records = await Attendance.find(filter)
      .populate({
        path: "studentId",
        populate: { path: "userId", select: "fullName" },
        select: "class section userId",
      })
      .lean();

    const total = records.length;
    const present = records.filter(r => r.status === "present").length;
    const absent  = records.filter(r => r.status === "absent").length;
    const late    = records.filter(r => r.status === "late").length;

    // Per-class breakdown
    const classMap = {};
    for (const r of records) {
      const key = `${r.studentId?.class || "?"}-${r.studentId?.section || "?"}`;
      if (!classMap[key]) classMap[key] = { present: 0, absent: 0, late: 0, total: 0 };
      classMap[key].total++;
      if (r.status === "present") classMap[key].present++;
      if (r.status === "absent")  classMap[key].absent++;
      if (r.status === "late")    classMap[key].late++;
    }

    const totalStudents = await Student.find({ schoolId }).countDocuments();

    res.status(200).json({
      success: true,
      data: {
        summary: {
          total,
          present,
          absent,
          late,
          attendanceRate: total > 0 ? ((present / total) * 100).toFixed(1) : 0,
          totalStudents,
        },
        classBreakdown: classMap,
        records,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// SYSTEM / AUDIT REPORT
// =========================
exports.getSystemReport = async (req, res) => {
  try {
    const schoolId = req.admin.schoolId;

    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(200).lean();

    const students     = await Student.find({ schoolId }).countDocuments();
    const teachers     = await Teacher.find({ schoolId }).countDocuments();
    const parents      = await Parent.find({ schoolId }).countDocuments();

    const actionBreakdown = {};
    for (const log of logs) {
      const key = log.category || "General";
      actionBreakdown[key] = (actionBreakdown[key] || 0) + 1;
    }

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalStudents: students,
          totalTeachers: teachers,
          totalParents: parents,
          totalLogs: logs.length,
        },
        actionBreakdown,
        logs,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};