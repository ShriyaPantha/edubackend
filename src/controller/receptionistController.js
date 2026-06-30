const Receptionist = require("../model/receptionistSchema");
const User = require("../model/userSchema");
const Student = require("../model/studentSchema");
const Teacher = require("../model/teacherSchema");
const Parent = require("../model/parentSchema");
const Attendance = require("../model/attendenceSchema");

// =========================
// CREATE RECEPTIONIST (Admin only)
// =========================
exports.createReceptionist = async (req, res) => {
  try {
    const { userId, phone, address, permissions } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const adminSchoolId = req.admin.schoolId;
    if (!adminSchoolId) {
      return res.status(403).json({ message: "You are not assigned to any school." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check not already a receptionist
    const existing = await Receptionist.findOne({ userId });
    if (existing) {
      return res.status(400).json({ message: "This user is already a receptionist" });
    }

    // Auto-generate employeeId
    const count = await Receptionist.countDocuments({ schoolId: adminSchoolId });
    const employeeId = `RCP-${String(count + 1).padStart(3, "0")}`;

    // Update user role
    user.role = "receptionist";
    await user.save();

    const receptionist = await Receptionist.create({
      userId,
      schoolId: adminSchoolId,
      createdBy: req.admin._id,
      employeeId,
      phone: phone || null,
      address: address || null,
      // Admin can customize permissions
      permissions: {
        viewStudents: permissions?.viewStudents ?? true,
        viewTeachers: permissions?.viewTeachers ?? true,
        viewParents: permissions?.viewParents ?? true,
        viewAttendance: permissions?.viewAttendance ?? true,
      },
    });

    const receptionistData = await Receptionist.findById(receptionist._id)
      .populate("userId", "fullName email role")
      .populate("schoolId", "name email")
      .populate("createdBy", "fullName email");

    res.status(201).json({
      success: true,
      message: "Receptionist created successfully",
      data: receptionistData,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// GET ALL RECEPTIONISTS (Admin only)
// =========================
exports.getAllReceptionists = async (req, res) => {
  try {
    const adminSchoolId = req.admin.schoolId;

    const receptionists = await Receptionist.find({ schoolId: adminSchoolId })
      .populate("userId", "fullName email role")
      .populate("createdBy", "fullName email");

    res.status(200).json({
      success: true,
      count: receptionists.length,
      data: receptionists,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// GET SINGLE RECEPTIONIST (Admin only)
// =========================
exports.getReceptionistById = async (req, res) => {
  try {
    const receptionist = await Receptionist.findOne({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
    })
      .populate("userId", "fullName email role")
      .populate("schoolId", "name email");

    if (!receptionist) {
      return res.status(404).json({ message: "Receptionist not found" });
    }

    res.status(200).json({ success: true, data: receptionist });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// UPDATE RECEPTIONIST + PERMISSIONS (Admin only)
// =========================
exports.updateReceptionist = async (req, res) => {
  try {
    const { phone, address, status, permissions } = req.body;

    const receptionist = await Receptionist.findOne({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
    });

    if (!receptionist) {
      return res.status(404).json({ message: "Receptionist not found" });
    }

    if (phone) receptionist.phone = phone;
    if (address) receptionist.address = address;
    if (status) receptionist.status = status;

    // Update permissions individually
    if (permissions) {
      if (typeof permissions.viewStudents === "boolean")
        receptionist.permissions.viewStudents = permissions.viewStudents;
      if (typeof permissions.viewTeachers === "boolean")
        receptionist.permissions.viewTeachers = permissions.viewTeachers;
      if (typeof permissions.viewParents === "boolean")
        receptionist.permissions.viewParents = permissions.viewParents;
      if (typeof permissions.viewAttendance === "boolean")
        receptionist.permissions.viewAttendance = permissions.viewAttendance;
    }

    await receptionist.save();

    const updated = await Receptionist.findById(receptionist._id)
      .populate("userId", "fullName email role")
      .populate("schoolId", "name");

    res.status(200).json({
      success: true,
      message: "Receptionist updated successfully",
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// DELETE RECEPTIONIST (Admin only)
// =========================
exports.deleteReceptionist = async (req, res) => {
  try {
    const receptionist = await Receptionist.findOne({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
    });

    if (!receptionist) {
      return res.status(404).json({ message: "Receptionist not found" });
    }

    // Revert user role
    await User.findByIdAndUpdate(receptionist.userId, { role: "user" });
    await Receptionist.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Receptionist deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// GET MY PROFILE (Receptionist self)
// =========================
exports.getMyProfile = async (req, res) => {
  try {
    const receptionist = await Receptionist.findOne({ userId: req.receptionist.userId._id })
      .populate("userId", "fullName email role")
      .populate("schoolId", "name email address");

    if (!receptionist) {
      return res.status(404).json({ message: "Profile not found" });
    }

    res.status(200).json({ success: true, data: receptionist });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// VIEW ALL STUDENTS (Receptionist)
// =========================
exports.viewStudents = async (req, res) => {
  try {
    const schoolId = req.receptionist.schoolId._id;
    const { class: className, section } = req.query;

    let filter = { schoolId };
    if (className) filter.class = className;
    if (section) filter.section = section;

    const students = await Student.find(filter)
      .populate("userId", "fullName email role")
      .populate("schoolId", "name")
      .select("-createdBy");

    res.status(200).json({
      success: true,
      count: students.length,
      data: students,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// VIEW SINGLE STUDENT (Receptionist)
// =========================
exports.viewStudentById = async (req, res) => {
  try {
    const schoolId = req.receptionist.schoolId._id;

    const student = await Student.findOne({ _id: req.params.id, schoolId })
      .populate("userId", "fullName email role")
      .populate("schoolId", "name")
      .populate("parentId", "fullName email");

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.status(200).json({ success: true, data: student });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// VIEW ALL TEACHERS (Receptionist)
// =========================
exports.viewTeachers = async (req, res) => {
  try {
    const schoolId = req.receptionist.schoolId._id;

    const teachers = await Teacher.find({ schoolId })
      .populate("userId", "fullName email role")
      .populate("schoolId", "name")
      .select("-salary -createdBy"); // ✅ hide sensitive fields

    res.status(200).json({
      success: true,
      count: teachers.length,
      data: teachers,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// VIEW SINGLE TEACHER (Receptionist)
// =========================
exports.viewTeacherById = async (req, res) => {
  try {
    const schoolId = req.receptionist.schoolId._id;

    const teacher = await Teacher.findOne({ _id: req.params.id, schoolId })
      .populate("userId", "fullName email role")
      .populate("schoolId", "name")
      .select("-salary -createdBy");

    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    res.status(200).json({ success: true, data: teacher });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// VIEW ALL PARENTS (Receptionist)
// =========================
exports.viewParents = async (req, res) => {
  try {
    const schoolId = req.receptionist.schoolId._id;

    const parents = await Parent.find({ schoolId })
      .populate("userId", "fullName email role")
      .populate("students", "admissionNumber class section")
      .select("-createdBy");

    res.status(200).json({
      success: true,
      count: parents.length,
      data: parents,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// VIEW SINGLE PARENT (Receptionist)
// =========================
exports.viewParentById = async (req, res) => {
  try {
    const schoolId = req.receptionist.schoolId._id;

    const parent = await Parent.findOne({ _id: req.params.id, schoolId })
      .populate("userId", "fullName email role")
      .populate({
        path: "students",
        populate: { path: "userId", select: "fullName email" },
      });

    if (!parent) {
      return res.status(404).json({ message: "Parent not found" });
    }

    res.status(200).json({ success: true, data: parent });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// VIEW ATTENDANCE (Receptionist)
// =========================
exports.viewAttendance = async (req, res) => {
  try {
    const schoolId = req.receptionist.schoolId._id;
    const { date, class: className, section } = req.query;

    if (!date) {
      return res.status(400).json({ message: "date is required (e.g. 2026-06-13)" });
    }

    // Get students matching filter
    let studentFilter = { schoolId };
    if (className) studentFilter.class = className;
    if (section) studentFilter.section = section;

    const students = await Student.find(studentFilter)
      .populate("userId", "fullName");

    const studentIds = students.map((s) => s._id);

    const attendanceRecords = await Attendance.find({
      date,
      schoolId,
      studentId: { $in: studentIds },
    }).populate({
      path: "studentId",
      populate: { path: "userId", select: "fullName" },
    });

    const markedIds = attendanceRecords.map((a) => a.studentId._id.toString());

    const notMarked = students
      .filter((s) => !markedIds.includes(s._id.toString()))
      .map((s) => ({
        studentId: s._id,
        studentName: s.userId?.fullName,
        class: s.class,
        section: s.section,
        status: "not marked",
      }));

    res.status(200).json({
      success: true,
      date,
      summary: {
        total: students.length,
        present: attendanceRecords.filter((a) => a.status === "present").length,
        absent: attendanceRecords.filter((a) => a.status === "absent").length,
        late: attendanceRecords.filter((a) => a.status === "late").length,
        notMarked: notMarked.length,
      },
      data: {
        attendance: attendanceRecords,
        notMarked,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};