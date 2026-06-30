const Student = require("../model/studentSchema");
const Teacher = require("../model/teacherSchema");
const Fee = require("../model/feeSchema");

// =========================
// ADMISSIONS OVERVIEW
// =========================
exports.getAdmissionsOverview = async (req, res) => {
  try {
    const schoolId = req.admin.schoolId;

    const now = new Date();

    // Today range
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // This week range (Monday to now)
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);

    // This month range
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      newToday,
      newThisWeek,
      newThisMonth,
      totalStudents,
    ] = await Promise.all([
      Student.countDocuments({
        schoolId,
        createdAt: { $gte: todayStart, $lte: todayEnd },
      }),
      Student.countDocuments({
        schoolId,
        createdAt: { $gte: weekStart },
      }),
      Student.countDocuments({
        schoolId,
        createdAt: { $gte: monthStart },
      }),
      Student.countDocuments({
        schoolId,
        status: "active",
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        newToday,
        newThisWeek,
        newThisMonth,
        totalStudents,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// TEACHER OVERVIEW
// =========================
exports.getTeacherOverview = async (req, res) => {
  try {
    const schoolId = req.admin.schoolId;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      activeTeachers,
      inactiveTeachers,
      newHiresThisMonth,
    ] = await Promise.all([
      Teacher.countDocuments({ schoolId, status: "active" }),
      Teacher.countDocuments({ schoolId, status: "inactive" }),
      Teacher.countDocuments({
        schoolId,
        createdAt: { $gte: monthStart },
      }),
    ]);

    // Count unique departments from active teachers
    const departmentList = await Teacher.distinct("department", {
      schoolId,
      status: "active",
    });

    res.status(200).json({
      success: true,
      data: {
        activeTeachers,
        inactiveTeachers,
        newHiresThisMonth,
        departments: departmentList.length,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// FEE COLLECTION
// =========================
exports.getFeeCollection = async (req, res) => {
  try {
    const schoolId = req.admin.schoolId;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get all fees for this month
    const fees = await Fee.find({
      schoolId,
      dueDate: {
        $gte: monthStart.toISOString().slice(0, 10),
        $lte: monthEnd.toISOString().slice(0, 10),
      },
    });

    const totalAmount = fees.reduce((sum, f) => sum + f.totalAmount, 0);
    const collectedAmount = fees.reduce((sum, f) => sum + f.paidAmount, 0);
    const pendingAmount = fees.reduce((sum, f) => sum + f.remainingAmount, 0);
    const collectedPercent = totalAmount > 0
      ? Math.round((collectedAmount / totalAmount) * 100)
      : 0;

    res.status(200).json({
      success: true,
      data: {
        totalAmount,
        collectedAmount,
        pendingAmount,
        collectedPercent,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};