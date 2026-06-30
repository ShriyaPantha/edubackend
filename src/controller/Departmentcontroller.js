
const Department = require("../model/Departmentschema");
const Teacher = require("../model/teacherSchema");
const Student = require("../model/studentSchema");
const Attendance = require("../model/attendenceSchema");
const Exam = require("../model/examSchema");
const { getAdminContext } = require("../utils/Dashboardhelpers");

// Course model is optional — not provided yet. Code below degrades gracefully
// if it doesn't exist instead of crashing.
let Course = null;
try {
  Course = require("../model/courseSchema");
} catch (e) {
  Course = null;
}


exports.createDepartment = async (req, res) => {
  try {
    const { schoolId, adminId } = await getAdminContext(req);
    const { name, description, headOfDepartmentId, classes } = req.body;

    if (!name) {
      return res.status(400).json({ message: "name is required" });
    }

    const exists = await Department.findOne({ schoolId, name });
    if (exists) {
      return res.status(409).json({ message: "A department with this name already exists" });
    }

    if (headOfDepartmentId) {
      const teacher = await Teacher.findOne({ _id: headOfDepartmentId, schoolId });
      if (!teacher) {
        return res.status(404).json({ message: "Head of department teacher not found" });
      }
    }

    const department = await Department.create({
      name,
      description,
      headOfDepartmentId: headOfDepartmentId || null,
      classes: Array.isArray(classes) ? classes : [],
      schoolId,
      createdBy: adminId,
    });

    res.status(201).json({ success: true, data: department });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// =========================
// GET ALL DEPARTMENTS (basic list)
// =========================
exports.getDepartments = async (req, res) => {
  try {
    const { schoolId } = await getAdminContext(req);

    const departments = await Department.find({ schoolId })
      .populate("headOfDepartmentId", "employeeId")
      .populate({ path: "headOfDepartmentId", populate: { path: "userId", select: "fullName" } })
      .sort({ name: 1 });

    res.status(200).json({ success: true, count: departments.length, data: departments });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// =========================
// GET SINGLE DEPARTMENT
// GET /api/admin/departments/:id
exports.getDepartmentById = async (req, res) => {
  try {
    const { schoolId } = await getAdminContext(req);

    const department = await Department.findOne({ _id: req.params.id, schoolId }).populate(
      "headOfDepartmentId",
      "employeeId"
    );

    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    res.status(200).json({ success: true, data: department });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// =========================
// UPDATE DEPARTMENT
// PUT /api/admin/departments/:id
// =========================
exports.updateDepartment = async (req, res) => {
  try {
    const { schoolId } = await getAdminContext(req);
    const { name, description, headOfDepartmentId, classes, status } = req.body;

    const department = await Department.findOne({ _id: req.params.id, schoolId });
    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    if (name) department.name = name;
    if (description !== undefined) department.description = description;
    if (headOfDepartmentId !== undefined) department.headOfDepartmentId = headOfDepartmentId || null;
    if (Array.isArray(classes)) department.classes = classes;
    if (status) department.status = status;

    await department.save();

    res.status(200).json({ success: true, message: "Department updated", data: department });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// =========================
// DELETE DEPARTMENT
// DELETE /api/admin/departments/:id
// =========================
exports.deleteDepartment = async (req, res) => {
  try {
    const { schoolId } = await getAdminContext(req);

    const department = await Department.findOneAndDelete({ _id: req.params.id, schoolId });
    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    res.status(200).json({ success: true, message: "Department deleted" });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

// =========================
// DEPARTMENT PERFORMANCE (for dashboard table)
// GET /api/admin/departments/performance
// Returns: name, students, teachers, courses, avgScore, attendance
// =========================
exports.getDepartmentPerformance = async (req, res) => {
  try {
    const { schoolId } = await getAdminDasboardContext(req);

    const departments = await Department.find({ schoolId, status: "active" });

    const startOfThisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const todayStr = new Date().toISOString().slice(0, 10);
    const monthStartStr = startOfThisMonth.toISOString().slice(0, 10);

    const performance = await Promise.all(
      departments.map(async (dept) => {
        const classFilter = { schoolId, class: { $in: dept.classes }, status: "active" };

        const [studentIds, teacherCount, courseCount] = await Promise.all([
          Student.find(classFilter).distinct("_id"),
          Teacher.countDocuments({ schoolId, department: dept.name, status: "active" }),
          Course ? Course.countDocuments({ schoolId, department: dept.name }) : Promise.resolve(0),
        ]);

        // Attendance %: present days / total marked days this month, for students in this department
        const attendanceAgg = await Attendance.aggregate([
          {
            $match: {
              schoolId,
              studentId: { $in: studentIds },
              date: { $gte: monthStartStr, $lte: todayStr },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
            },
          },
        ]);
        const attendancePct = attendanceAgg[0]
          ? Math.round((attendanceAgg[0].present / attendanceAgg[0].total) * 100)
          : null;

        // Avg score %: from Exam.results for these students, recent exams only
        const examAgg = await Exam.aggregate([
          { $match: { schoolId, className: { $in: dept.classes } } },
          { $unwind: "$results" },
          { $match: { "results.studentId": { $in: studentIds } } },
          { $group: { _id: null, avgPct: { $avg: "$results.percentage" } } },
        ]);
        const avgScore = examAgg[0] ? Math.round(examAgg[0].avgPct) : null;

        return {
          name: dept.name,
          students: studentIds.length,
          teachers: teacherCount,
          courses: courseCount, // 0 until a Course model is wired in
          avgScore, // null if no exam results yet
          attendance: attendancePct, // null if no attendance marked this month yet
        };
      })
    );

    res.status(200).json({ success: true, data: performance });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};