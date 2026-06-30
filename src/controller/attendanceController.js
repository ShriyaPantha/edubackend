const Attendance = require("../model/attendenceSchema");
const Student = require("../model/studentSchema");
const User = require("../model/userSchema");

// =========================
// MARK SINGLE ATTENDANCE
// Teacher marks one student
// =========================
exports.markAttendance = async (req, res) => {
  try {
    const { studentId, date, status, method, note } = req.body;

    if (!studentId || !date || !status) {
      return res.status(400).json({ message: "studentId, date and status are required" });
    }

    // Get schoolId from logged-in teacher's record
    const Teacher = require("../model/teacherSchema");
    const teacher = await Teacher.findOne({ userId: req.user._id });
    if (!teacher) {
      return res.status(403).json({ message: "Only teachers can mark attendance" });
    }

    //Make sure student belongs to same school
    const student = await Student.findOne({
      _id: studentId,
      schoolId: teacher.schoolId,
    }).populate("userId", "fullName");

    if (!student) {
      return res.status(404).json({ message: "Student not found in your school" });
    }

    //Check duplicate
    const existing = await Attendance.findOne({ studentId, date });
    if (existing) {
      return res.status(400).json({
        message: `Attendance for this student on ${date} already exists. Use update instead.`,
      });
    }

    const attendance = await Attendance.create({
      studentId,
      schoolId: teacher.schoolId,
      date,
      status,
      method: method || "manual",
      markedBy: req.user._id,
      note: note || "",
    });

    //Notify parent if student is absent
    if (status === "absent" && student.parentId) {
      const parent = await User.findById(student.parentId).select("fullName");
      if (parent) {
        // You can plug in your Notification model here
        console.log(`Notify parent ${parent.fullName}: ${student.userId.fullName} was absent on ${date}`);

        // Uncomment if you have a Notification model:
        // await Notification.create({
        //   recipient: student.parentId,
        //   title: "Attendance Alert",
        //   message: `${student.userId.fullName} was absent on ${date}.`,
        //   type: "attendance",
        // });
      }
    }

    res.status(201).json({
      success: true,
      message: "Attendance marked successfully",
      data: attendance,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// BULK MARK ATTENDANCE
// Teacher marks entire class at once
// =========================
exports.markBulkAttendance = async (req, res) => {
  try {
    const { date, class: className, section, attendanceList } = req.body;
    // attendanceList = [{ studentId, status, note }, ...]

    if (!date || !attendanceList || !Array.isArray(attendanceList) || attendanceList.length === 0) {
      return res.status(400).json({ message: "date and attendanceList array are required" });
    }

    const Teacher = require("../model/teacherSchema");
    const teacher = await Teacher.findOne({ userId: req.user._id });
    if (!teacher) {
      return res.status(403).json({ message: "Only teachers can mark attendance" });
    }

    const results = { success: [], failed: [] };

    for (const item of attendanceList) {
      try {
        //Verify each student belongs to same school
        const student = await Student.findOne({
          _id: item.studentId,
          schoolId: teacher.schoolId,
        });

        if (!student) {
          results.failed.push({ studentId: item.studentId, reason: "Student not found in your school" });
          continue;
        }

        //Upsert — update if exists, create if not
        await Attendance.findOneAndUpdate(
          { studentId: item.studentId, date },
          {
            studentId: item.studentId,
            schoolId: teacher.schoolId,
            date,
            status: item.status || "present",
            method: "manual",
            markedBy: req.user._id,
            note: item.note || "",
          },
          { upsert: true, new: true }
        );

        results.success.push(item.studentId);
      } catch (err) {
        results.failed.push({ studentId: item.studentId, reason: err.message });
      }
    }

    res.status(200).json({
      success: true,
      message: `Attendance marked: ${results.success.length} success, ${results.failed.length} failed`,
      data: results,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Replace the existing updateAttendance export in attendanceController.js
// with this version. The route is PATCH /:date — studentId is in req.body.

exports.updateAttendance = async (req, res) => {
  try {
    const { date } = req.params;
    const { studentId, status, note } = req.body;

    if (!studentId || !status) {
      return res.status(400).json({ message: "studentId and status are required" });
    }

    const Teacher = require("../model/teacherSchema");
    const teacher = await Teacher.findOne({ userId: req.user._id });
    if (!teacher) {
      return res.status(403).json({ message: "Only teachers can update attendance" });
    }

    const attendance = await Attendance.findOneAndUpdate(
      { studentId, date, schoolId: teacher.schoolId },
      { status, note: note || "" },
      { new: true }
    );

    if (!attendance) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    res.status(200).json({
      success: true,
      message: "Attendance updated successfully",
      data: attendance,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// GET DAILY ATTENDANCE
// Teacher/Admin sees full class attendance for a date
// =========================
exports.getDailyAttendance = async (req, res) => {
  try {
    const { date, class: className, section } = req.query;

    if (!date) {
      return res.status(400).json({ message: "date is required (e.g. 2026-06-08)" });
    }

    let schoolId;

    if (req.admin) {
      schoolId = req.admin.schoolId;
    } else {
      const Teacher = require("../model/teacherSchema");
      const teacher = await Teacher.findOne({ userId: req.user._id });
      if (!teacher) return res.status(403).json({ message: "Access denied" });
      schoolId = teacher.schoolId;
    }

    // Build filter
    let studentFilter = { schoolId };
    if (className) studentFilter.class = className;
    if (section) studentFilter.section = section;

    // Get students matching filter
    const students = await Student.find(studentFilter).populate("userId", "fullName");
    const studentIds = students.map((s) => s._id);

    // Get attendance for those students on that date
    const attendanceRecords = await Attendance.find({
      date,
      schoolId,
      studentId: { $in: studentIds },
    }).populate({
      path: "studentId",
      populate: { path: "userId", select: "fullName" },
    });

    // Build full report including students with no record (not marked yet)
    const markedIds = attendanceRecords.map((a) => a.studentId._id.toString());

    const unmarked = students
      .filter((s) => !markedIds.includes(s._id.toString()))
      .map((s) => ({
        studentId: s._id,
        studentName: s.userId?.fullName,
        class: s.class,
        section: s.section,
        status: "not marked",
        date,
      }));

    res.status(200).json({
      success: true,
      date,
      totalStudents: students.length,
      marked: attendanceRecords.length,
      unmarked: unmarked.length,
      summary: {
        present: attendanceRecords.filter((a) => a.status === "present").length,
        absent: attendanceRecords.filter((a) => a.status === "absent").length,
        late: attendanceRecords.filter((a) => a.status === "late").length,
      },
      data: {
        attendance: attendanceRecords,
        notMarked: unmarked,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET STUDENT ATTENDANCE
// Student sees own record; Parent sees their linked child's record
exports.getStudentAttendance = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { month, year } = req.query;

    // ── Authorization ────────────────────────────────────────────────────────
    // Find the student record so we can check ownership
    const student = await Student.findById(studentId).populate("userId", "fullName email");
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const callerId = req.user._id.toString();

    // Allow if:
    //   1. The logged-in user IS the student (student.userId matches caller)
    //   2. The logged-in user IS the linked parent (student.parentId matches caller)
    //   3. The caller is a teacher in the same school (optional — remove if unwanted)
    const isStudent = student.userId?._id?.toString() === callerId;
    const isParent  = student.parentId?.toString() === callerId;

    if (!isStudent && !isParent) {
      return res.status(403).json({ message: "Access denied. You are not linked to this student." });
    }
    // ────────────────────────────────────────────────────────────────────────

    let filter = { studentId };

    if (month && year) {
      const monthStr = String(month).padStart(2, "0");
      filter.date = { $regex: `^${year}-${monthStr}` };
    }

    const records = await Attendance.find(filter).sort({ date: -1 });

    const total      = records.length;
    const present    = records.filter((r) => r.status === "present").length;
    const absent     = records.filter((r) => r.status === "absent").length;
    const late       = records.filter((r) => r.status === "late").length;
    const percentage = total > 0 ? ((present / total) * 100).toFixed(1) : 0;

    res.status(200).json({
      success: true,
      student: {
        id:    student._id,
        name:  student.userId?.fullName,
        email: student.userId?.email,
        class: student.class,
        section: student.section,
      },
      summary: { total, present, absent, late, attendancePercentage: `${percentage}%` },
      data: records,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// GET ALL ATTENDANCE (Admin)
// Admin sees all attendance in their school
// =========================
exports.getAllAttendance = async (req, res) => {
  try {
    const { date, class: className, section } = req.query;

    const schoolId = req.admin ? req.admin.schoolId : null;
    if (!schoolId) return res.status(403).json({ message: "Access denied" });

    let filter = { schoolId };
    if (date) filter.date = date;

    const data = await Attendance.find(filter)
      .populate({
        path: "studentId",
        match: {
          ...(className && { class: className }),
          ...(section && { section }),
        },
        // in getAllAttendance populate:
        populate: { path: "userId", select: "fullName email" }
      })
      .populate("markedBy", "fullName role")
      .sort({ date: -1 });

    // Filter out nulls (from populate match)
    const filtered = data.filter((a) => a.studentId !== null);

    res.status(200).json({
      success: true,
      count: filtered.length,
      data: filtered,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// GET MY CHILD'S ATTENDANCE
// Parent calls GET /attendance/my-child
// Server resolves their child automatically via parentId linkage
exports.getMyChildAttendance = async (req, res) => {
  try {
    const { month, year } = req.query;
    const parentId = req.user._id;

    // Find the child linked to this parent
    const student = await Student.findOne({ parentId })
      .populate("userId", "fullName email");

    if (!student) {
      return res.status(404).json({
        message: "No student linked to your account. Please contact the school admin.",
      });
    }

    let filter = { studentId: student._id };

    if (month && year) {
      const monthStr = String(month).padStart(2, "0");
      filter.date = { $regex: `^${year}-${monthStr}` };
    }

    const records = await Attendance.find(filter).sort({ date: -1 });

    const total      = records.length;
    const present    = records.filter((r) => r.status === "present").length;
    const absent     = records.filter((r) => r.status === "absent").length;
    const late       = records.filter((r) => r.status === "late").length;
    const percentage = total > 0 ? ((present / total) * 100).toFixed(1) : 0;

    res.status(200).json({
      success: true,
      student: {
        id:      student._id,
        name:    student.userId?.fullName,
        email:   student.userId?.email,
        class:   student.class,
        section: student.section,
      },
      summary: { total, present, absent, late, attendancePercentage: `${percentage}%` },
      data: records,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};