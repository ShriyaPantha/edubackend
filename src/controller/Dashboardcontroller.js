const Student = require("../model/studentSchema");
const Teacher = require("../model/teacherSchema");
const Parent = require("../model/parentSchema");
const Fee = require("../model/feeSchema");
const Payment = require("../model/paymentSchema");
const Attendance = require("../model/attendenceSchema");
const Exam = require("../model/examSchema");
const AuditLog = require("../model/AuditLog");
const Notice = require("../model/noticeSchema");
const Department = require("../model/Departmentschema");
const { getAdminDasboardContext, computeGrowth, computeSumGrowth } = require("../utils/Dashboardhelpers");

let Course = null;
try {
  Course = require("../model/courseSchema");
} catch (e) {
  Course = null;
}

// =========================
// TOP STAT CARDS
// GET /api/admin/dashboard/stats
// =========================
exports.getStatCards = async (req, res) => {
  try {
    const { schoolId } = await getAdminDasboardContext(req);

    const [students, teachers, revenue, pendingFees] = await Promise.all([
      computeGrowth(Student, { schoolId, status: "active" }),
      computeGrowth(Teacher, { schoolId, status: "active" }),
      computeSumGrowth(Payment, { schoolId, status: "completed" }, "amount"),
      Fee.countDocuments({ schoolId, status: { $in: ["pending", "partial"] } }),
    ]);

    const courses = Course
      ? await computeGrowth(Course, { schoolId })
      : { total: 0, changePercent: 0, positive: true };

    // Attendance rate: this month vs last month (% present)
    const now = new Date();
    const monthStartStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const lastMonthStartStr = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);

    const [thisMonthAtt, lastMonthAtt] = await Promise.all([
      Attendance.aggregate([
        { $match: { schoolId, date: { $gte: monthStartStr, $lte: todayStr } } },
        { $group: { _id: null, total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } } } },
      ]),
      Attendance.aggregate([
        { $match: { schoolId, date: { $gte: lastMonthStartStr, $lt: monthStartStr } } },
        { $group: { _id: null, total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } } } },
      ]),
    ]);

    const thisMonthRate = thisMonthAtt[0] ? (thisMonthAtt[0].present / thisMonthAtt[0].total) * 100 : 0;
    const lastMonthRate = lastMonthAtt[0] ? (lastMonthAtt[0].present / lastMonthAtt[0].total) * 100 : 0;
    const attendanceChange = lastMonthRate > 0 ? thisMonthRate - lastMonthRate : 0;

    res.status(200).json({
      success: true,
      data: {
        totalStudents: { value: students.total, changePercent: students.changePercent, positive: students.positive },
        totalTeachers: { value: teachers.total, changePercent: teachers.changePercent, positive: teachers.positive },
        totalCourses: { value: courses.total, changePercent: courses.changePercent, positive: courses.positive },
        totalRevenue: { value: revenue.thisMonthSum, changePercent: revenue.changePercent, positive: revenue.positive },
        pendingFees: { value: pendingFees },
        attendanceRate: {
          value: Math.round(thisMonthRate),
          changePercent: Math.round(attendanceChange * 10) / 10,
          positive: attendanceChange >= 0,
        },
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// =========================
// STUDENT GROWTH (monthly, this year)
// GET /api/admin/dashboard/growth
// =========================
exports.getStudentGrowth = async (req, res) => {
  try {
    const { schoolId } = await getAdminDasboardContext(req);
    const year = new Date().getFullYear();

    const results = await Student.aggregate([
      { $match: { schoolId, createdAt: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31T23:59:59`) } } },
      { $group: { _id: { $month: "$createdAt" }, count: { $sum: 1 } } },
    ]);

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const countByMonth = {};
    results.forEach((r) => { countByMonth[r._id] = r.count; });

    // Cumulative running total, like the original mock chart
    let running = await Student.countDocuments({ schoolId, createdAt: { $lt: new Date(`${year}-01-01`) } });
    const data = monthNames.map((name, idx) => {
      running += countByMonth[idx + 1] || 0;
      return { name, students: running };
    });

    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// =========================
// ATTENDANCE OVERVIEW (this month, present/absent/late %)
// GET /api/admin/dashboard/attendance-overview
// =========================
exports.getAttendanceOverview = async (req, res) => {
  try {
    const { schoolId } = await getAdminDasboardContext(req);
    const now = new Date();
    const monthStartStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);

    const agg = await Attendance.aggregate([
      { $match: { schoolId, date: { $gte: monthStartStr, $lte: todayStr } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const counts = { present: 0, absent: 0, late: 0 };
    agg.forEach((a) => { if (counts[a._id] !== undefined) counts[a._id] = a.count; });
    const total = counts.present + counts.absent + counts.late;

    const toPct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);

    res.status(200).json({
      success: true,
      data: [
        { name: "Present", value: toPct(counts.present), color: "#22c55e" },
        { name: "Absent", value: toPct(counts.absent), color: "#ef4444" },
        { name: "Late", value: toPct(counts.late), color: "#f59e0b" },
      ],
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// =========================
// NOTIFICATIONS PANEL (computed alerts — no Admission model exists,
// so "new applications" is swapped for "new students added this week")
// GET /api/admin/dashboard/notifications
// =========================
exports.getNotificationAlerts = async (req, res) => {
  try {
    const { schoolId } = await getAdminDasboardContext(req);
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    const monthStartStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);

    const [lowAttendanceStudents, newStudentsThisWeek, upcomingExam, pendingFeeAgg] = await Promise.all([
      // Students whose attendance this month is below 75%
      Attendance.aggregate([
        { $match: { schoolId, date: { $gte: monthStartStr, $lte: todayStr } } },
        { $group: { _id: "$studentId", total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } } } },
        { $project: { pct: { $multiply: [{ $divide: ["$present", "$total"] }, 100] } } },
        { $match: { pct: { $lt: 75 } } },
        { $count: "count" },
      ]),
      Student.countDocuments({ schoolId, createdAt: { $gte: startOfWeek } }),
      Exam.findOne({ schoolId, status: "upcoming", examDate: { $gte: now } }).sort({ examDate: 1 }),
      Fee.aggregate([
        { $match: { schoolId, status: { $in: ["pending", "partial"] } } },
        { $group: { _id: null, count: { $sum: 1 }, totalRemaining: { $sum: "$remainingAmount" } } },
      ]),
    ]);

    const notifications = [];

    if (lowAttendanceStudents[0]?.count) {
      notifications.push({
        type: "attendance",
        title: `${lowAttendanceStudents[0].count} students have attendance below 75%`,
        subtitle: "Please take necessary action.",
      });
    }

    if (newStudentsThisWeek) {
      notifications.push({
        type: "admission",
        title: `${newStudentsThisWeek} new students added this week`,
        subtitle: "Review their profiles and class assignments.",
      });
    }

    if (upcomingExam) {
      const daysLeft = Math.ceil((upcomingExam.examDate - now) / (1000 * 60 * 60 * 24));
      notifications.push({
        type: "exam",
        title: `${upcomingExam.title} in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
        subtitle: "Please check exam schedule.",
      });
    }

    if (pendingFeeAgg[0]?.count) {
      notifications.push({
        type: "fee",
        title: `${pendingFeeAgg[0].count} fee payments pending`,
        subtitle: `Total pending: $${pendingFeeAgg[0].totalRemaining.toLocaleString()}`,
      });
    }

    res.status(200).json({ success: true, data: notifications });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// =========================
// RECENT ACTIVITIES (from AuditLog)
// GET /api/admin/dashboard/activities
// NOTE: AuditLog has no schoolId field in its schema, so this currently
// returns the latest entries globally, not scoped per school.
// =========================
exports.getRecentActivities = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 4;
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(limit);

    res.status(200).json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// UPCOMING EXAMS
// GET /api/admin/dashboard/exams
// =========================
exports.getUpcomingExams = async (req, res) => {
  try {
    const { schoolId } = await getAdminDasboardContext(req);
    const limit = Number(req.query.limit) || 4;
    const now = new Date();

    const exams = await Exam.find({ schoolId, status: "upcoming", examDate: { $gte: now } })
      .sort({ examDate: 1 })
      .limit(limit);

    const data = exams.map((exam) => {
      const daysLeft = Math.ceil((exam.examDate - now) / (1000 * 60 * 60 * 24));
      return {
        subject: exam.title,
        className: exam.className,
        date: exam.examDate.toISOString().slice(0, 10),
        time: exam.subjects?.[0]?.examTime || null,
        daysLeft,
      };
    });

    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// =========================
// DEPARTMENT PERFORMANCE — delegates to departmentController logic
// (kept here as a re-export so the frontend can hit one dashboard namespace)
// GET /api/admin/dashboard/departments
// =========================
exports.getDepartmentPerformance = require("./Departmentcontroller").getDepartmentPerformance;

// =========================
// ADMISSIONS OVERVIEW (no Admission/Application model exists yet,
// so this reflects Student record creation activity, not a separate pipeline)
// GET /api/admin/dashboard/admissions-overview
// =========================
exports.getAdmissionsOverview = async (req, res) => {
  try {
    const { schoolId } = await getAdminDasboardContext(req);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [today, thisWeek, thisMonth, total] = await Promise.all([
      Student.countDocuments({ schoolId, createdAt: { $gte: startOfToday } }),
      Student.countDocuments({ schoolId, createdAt: { $gte: startOfWeek } }),
      Student.countDocuments({ schoolId, createdAt: { $gte: startOfMonth } }),
      Student.countDocuments({ schoolId }),
    ]);

    res.status(200).json({
      success: true,
      data: { newToday: today, newThisWeek: thisWeek, newThisMonth: thisMonth, totalStudents: total },
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// =========================
// TEACHER OVERVIEW
// GET /api/admin/dashboard/teacher-overview
// NOTE: There's no "leave request" model, so that metric is omitted
// rather than faked.
// =========================
exports.getTeacherOverview = async (req, res) => {
  try {
    const { schoolId } = await getAdminDasboardContext(req);
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [active, inactive, newHiresThisMonth, departmentCount] = await Promise.all([
      Teacher.countDocuments({ schoolId, status: "active" }),
      Teacher.countDocuments({ schoolId, status: "inactive" }),
      Teacher.countDocuments({ schoolId, joiningDate: { $gte: startOfMonth } }),
      Department.countDocuments({ schoolId, status: "active" }),
    ]);

    res.status(200).json({
      success: true,
      data: { activeTeachers: active, inactiveTeachers: inactive, newHiresThisMonth, departments: departmentCount },
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// =========================
// FEE COLLECTION (this month)
// GET /api/admin/dashboard/fee-collection
// =========================
exports.getFeeCollection = async (req, res) => {
  try {
    const { schoolId } = await getAdminDasboardContext(req);
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const agg = await Fee.aggregate([
      { $match: { schoolId, createdAt: { $gte: startOfMonth } } },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$totalAmount" },
          paidAmount: { $sum: "$paidAmount" },
          remainingAmount: { $sum: "$remainingAmount" },
        },
      },
    ]);

    const totals = agg[0] || { totalAmount: 0, paidAmount: 0, remainingAmount: 0 };
    const collectedPct = totals.totalAmount > 0 ? Math.round((totals.paidAmount / totals.totalAmount) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        collectedAmount: totals.paidAmount,
        totalAmount: totals.totalAmount,
        pendingAmount: totals.remainingAmount,
        collectedPercent: collectedPct,
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// =========================
// PARENTS OVERVIEW + RECENT PARENTS (for "show parent details" panel)
// GET /api/admin/dashboard/parents-overview
// =========================
exports.getParentsOverview = async (req, res) => {
  try {
    const { schoolId } = await getAdminDasboardContext(req);

    const [total, active, recent] = await Promise.all([
      Parent.countDocuments({ schoolId }),
      Parent.countDocuments({ schoolId, status: "active" }),
      Parent.find({ schoolId })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("userId", "fullName email")
        .populate("students", "rollNumber class section"),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalParents: total,
        activeParents: active,
        recentParents: recent.map((p) => ({
          id: p._id,
          name: p.userId?.fullName || "—",
          email: p.userId?.email || "—",
          phone: p.phone,
          occupation: p.occupation,
          childrenCount: p.students?.length || 0,
          status: p.status,
          joinedAt: p.createdAt,
        })),
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};