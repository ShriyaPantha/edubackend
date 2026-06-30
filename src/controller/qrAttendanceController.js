const QRCode = require("qrcode");
const jwt = require("jsonwebtoken");
const Attendance = require("../model/attendenceSchema");
const Student = require("../model/studentSchema");
const Teacher = require("../model/teacherSchema");

const QR_SECRET = process.env.QR_SECRET || "qr_attendance_secret";

// =========================
// GENERATE QR CODE
// Teacher generates QR for their class
// =========================
exports.generateQR = async (req, res) => {
  try {
    const { class: className, section, date } = req.body;

    if (!className || !section || !date) {
      return res.status(400).json({ message: "class, section and date are required" });
    }

    const teacher = await Teacher.findOne({ userId: req.user._id });
    if (!teacher) {
      return res.status(403).json({ message: "Only teachers can generate QR codes" });
    }

    const qrPayload = {
      teacherId: teacher._id,
      schoolId: teacher.schoolId,
      class: className,
      section,
      date,
      type: "attendance_qr",
    };

    const qrToken = jwt.sign(qrPayload, QR_SECRET, { expiresIn: "15m" });

    // ✅ Generate QR code image as base64
    const qrImageBase64 = await QRCode.toDataURL(qrToken);

    res.status(200).json({
      success: true,
      message: "QR code generated. Valid for 15 minutes.",
      data: {
        qrToken,              // raw token (for mobile apps)
        qrImage: qrImageBase64, // base64 image (for web display)
        validFor: "15 minutes",
        class: className,
        section,
        date,
        generatedBy: teacher._id,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// SCAN QR — STUDENT MARKS ATTENDANCE
// Student scans QR and hits this endpoint
// =========================
exports.scanQR = async (req, res) => {
  try {
    const { qrToken } = req.body;

    if (!qrToken) {
      return res.status(400).json({ message: "qrToken is required" });
    }

    // ✅ Verify QR token
    let qrData;
    try {
      qrData = jwt.verify(qrToken, QR_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(400).json({ message: "QR code has expired. Ask teacher to generate a new one." });
      }
      return res.status(400).json({ message: "Invalid QR code" });
    }

    // ✅ Make sure it's an attendance QR
    if (qrData.type !== "attendance_qr") {
      return res.status(400).json({ message: "Invalid QR code type" });
    }

    // ✅ Get student from logged-in user
    const student = await Student.findOne({ userId: req.user._id })
      .populate("userId", "fullName");

    if (!student) {
      return res.status(403).json({ message: "Only students can scan attendance QR" });
    }

    // ✅ Make sure student belongs to same school
    if (student.schoolId.toString() !== qrData.schoolId.toString()) {
      return res.status(403).json({ message: "This QR code is not for your school" });
    }

    // ✅ Make sure student is in the correct class and section
    if (student.class !== qrData.class || student.section !== qrData.section) {
      return res.status(403).json({
        message: `This QR is for class ${qrData.class}-${qrData.section}. You are in class ${student.class}-${student.section}.`,
      });
    }

    // ✅ Check if already marked
    const existing = await Attendance.findOne({
      studentId: student._id,
      date: qrData.date,
    });

    if (existing) {
      return res.status(400).json({
        message: `Your attendance for ${qrData.date} is already marked as "${existing.status}"`,
      });
    }

    // ✅ Mark attendance
    const attendance = await Attendance.create({
      studentId: student._id,
      schoolId: student.schoolId,
      date: qrData.date,
      status: "present",
      method: "qr",
      markedBy: qrData.teacherId,
    });

    res.status(201).json({
      success: true,
      message: `Attendance marked successfully for ${student.userId.fullName} on ${qrData.date}`,
      data: {
        studentName: student.userId.fullName,
        class: student.class,
        section: student.section,
        date: qrData.date,
        status: "present",
        method: "qr",
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// GET QR ATTENDANCE REPORT
// Teacher sees who scanned and who didn't
// =========================
exports.getQRAttendanceReport = async (req, res) => {
  try {
    const { date, class: className, section } = req.query;

    if (!date || !className || !section) {
      return res.status(400).json({ message: "date, class and section are required" });
    }

    const teacher = await Teacher.findOne({ userId: req.user._id });
    if (!teacher) {
      return res.status(403).json({ message: "Access denied" });
    }

    // ✅ Get all students in this class
    const allStudents = await Student.find({
      schoolId: teacher.schoolId,
      class: className,
      section,
    }).populate("userId", "fullName");

    // ✅ Get QR attendance records for that day
    const attendanceRecords = await Attendance.find({
      schoolId: teacher.schoolId,
      date,
      method: "qr",
      studentId: { $in: allStudents.map((s) => s._id) },
    });

    const markedIds = attendanceRecords.map((a) => a.studentId.toString());

    // ✅ Students who scanned
    const scanned = allStudents
      .filter((s) => markedIds.includes(s._id.toString()))
      .map((s) => ({
        studentId: s._id,
        name: s.userId?.fullName,
        rollNumber: s.rollNumber,
        status: "present",
      }));

    // ✅ Students who did NOT scan
    const notScanned = allStudents
      .filter((s) => !markedIds.includes(s._id.toString()))
      .map((s) => ({
        studentId: s._id,
        name: s.userId?.fullName,
        rollNumber: s.rollNumber,
        status: "not marked",
      }));

    res.status(200).json({
      success: true,
      date,
      class: className,
      section,
      summary: {
        total: allStudents.length,
        scanned: scanned.length,
        notScanned: notScanned.length,
      },
      data: { scanned, notScanned },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};