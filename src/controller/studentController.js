const Student = require("../model/studentSchema");
const User = require("../model/userSchema");
const School = require("../model/schoolSchema");
const bcrypt = require("bcryptjs");
const { sendEmail } = require("../utils/sendEmail");

// =========================
// UTILS
// =========================

const generatePassword = () => {
  const upper  = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower  = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const syms   = "@#$!%&";
  const pick = (s, n) =>
    Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join("");
  return (pick(upper, 3) + pick(lower, 3) + pick(digits, 2) + pick(syms, 2))
    .split("").sort(() => Math.random() - 0.5).join("");
};

// =========================
// CREATE STUDENT (Admin only)
// =========================
exports.createStudent = async (req, res) => {
  try {
    if (!req.admin) {
      return res.status(401).json({ success: false, message: "Admin not authenticated" });
    }

    const adminSchoolId = req.admin.schoolId;
    if (!adminSchoolId) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to any school. Contact superadmin.",
      });
    }

    const {
      fullName,
      email,
      password: manualPassword,
      userId,
      admissionNumber,
      rollNumber,
      class: className,
      section,
      parentId,
      dob,
      address,
      phone,
    } = req.body;

    if (!className || !section) {
      return res.status(400).json({
        success: false,
        message: "class and section are required",
      });
    }

    if (!email && !userId) {
      return res.status(400).json({
        success: false,
        message: "Provide either email (new user) or userId (existing user)",
      });
    }

    let resolvedUserId;
    let plainPassword = null;
    let hashedPasswordForStudent = null;
    let resolvedEmail = null;
    let resolvedFullName = null;

    // ── PATH A: Create a brand-new User from email ────────────────────────
    if (email) {
      if (!fullName) {
        return res.status(400).json({
          success: false,
          message: "fullName is required when creating by email",
        });
      }

      const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "A user with this email already exists. Use a different email.",
        });
      }

      plainPassword = manualPassword?.trim() || generatePassword();
      if (plainPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters",
        });
      }

      // FIX: pass the PLAIN password here. The userSchema's pre('save') hook
      // hashes it automatically. Hashing it manually before this would cause
      // a double-hash, which breaks login (this was the original bug).
      const newUser = await User.create({
        fullName: fullName.trim(),
        email: email.toLowerCase().trim(),
        password: plainPassword,
        role: "student",
        isVerified: true,
      });

      resolvedUserId   = newUser._id;
      resolvedEmail    = newUser.email;
      resolvedFullName = newUser.fullName;

      // Fetch the hash that the hook just produced, so Student can store
      // the SAME hash User has (password has select:false on User model).
      const userWithHash = await User.findById(newUser._id).select("password");
      hashedPasswordForStudent = userWithHash.password;

    // ── PATH B: Link an existing User ────────────────────────────────────
    } else {
      const user = await User.findById(userId).select("+password email");
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      const alreadyStudent = await Student.findOne({ userId });
      if (alreadyStudent) {
        return res.status(400).json({
          success: false,
          message: "This user is already a student",
        });
      }

      user.role = "student";
      await user.save();

      resolvedUserId            = userId;
      resolvedEmail             = user.email;
      hashedPasswordForStudent  = user.password; // mirror existing hash as-is
    }

    const existingStudent = await Student.findOne({ userId: resolvedUserId });
    if (existingStudent) {
      return res.status(400).json({
        success: false,
        message: "Student profile already exists for this user",
      });
    }

    // ── Create Student record (now also stores email + password hash) ─────
    const student = await Student.create({
      userId: resolvedUserId,
      schoolId: adminSchoolId,
      createdBy: req.admin._id,
      admissionNumber: admissionNumber || null,
      rollNumber:      rollNumber      || null,
      class:           className,
      section,
      parentId: parentId || null,
      dob:      dob      || null,
      address:  address  || null,
      phone:    phone    || null,
      email:    resolvedEmail,
      password: hashedPasswordForStudent,
    });

    // ── Send welcome email (PATH A only) ──────────────────────────────────
    if (plainPassword && resolvedEmail) {
      const school = await School.findById(adminSchoolId).select("name");
      const schoolName = school?.name ?? "Your School";

      try {
        await sendEmail({
          to: resolvedEmail,
          subject: "Your Student Account — " + schoolName,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px;">
              <div style="background:#1a73e8;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
                <h2 style="color:white;margin:0;">📚 ${schoolName}</h2>
              </div>
              <div style="padding:30px;">
                <h3 style="color:#333;">Dear ${resolvedFullName},</h3>
                <p style="color:#555;font-size:15px;">
                  Your student account has been created by the school admin. Use the credentials below to log in.
                </p>
                <div style="background:#f0f4ff;border:1px solid #c7d7ff;border-radius:8px;padding:18px;margin:22px 0;">
                  <p style="margin:0 0 8px;color:#444;font-size:14px;">
                    <strong>Login Email:</strong>
                    <span style="color:#1a73e8;">${resolvedEmail}</span>
                  </p>
                  <p style="margin:0;color:#444;font-size:14px;">
                    <strong>Password:</strong>
                    <span style="font-family:monospace;font-size:16px;background:#fff;border:1px solid #ddd;padding:2px 10px;border-radius:4px;letter-spacing:2px;">${plainPassword}</span>
                  </p>
                </div>
                <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:12px;margin:16px 0;">
                  <p style="margin:0;color:#795548;font-size:13px;">
                    ⚠️ Please change your password after your first login for security.
                  </p>
                </div>
                <p style="color:#555;font-size:14px;">Once logged in you can:</p>
                <ul style="color:#555;font-size:14px;padding-left:18px;">
                  <li>View your class schedule and assignments</li>
                  <li>Check your attendance records</li>
                  <li>Track your fee payments</li>
                  <li>Receive important school notifications</li>
                </ul>
                <p style="color:#888;font-size:12px;margin-top:28px;">
                  This is an automated message. Please do not reply to this email.
                </p>
              </div>
            </div>
          `,
        });
      } catch (emailErr) {
        console.error("[createStudent] Welcome email failed:", emailErr.message);
      }
    }

    const studentData = await Student.findById(student._id)
      .populate("userId",    "fullName email role")
      .populate("schoolId",  "name email")
      .populate("parentId",  "fullName email")
      .populate("createdBy", "fullName email");

    res.status(201).json({
      success: true,
      message: email
        ? "Student account created successfully. Credentials sent to their email."
        : "Student created successfully.",
      data: studentData,
    });
  } catch (error) {
    console.error("[createStudent]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// GET ALL STUDENTS (Admin only)
// =========================
exports.getAllStudents = async (req, res) => {
  try {
    if (!req.admin) {
      return res.status(401).json({ success: false, message: "Admin not authenticated" });
    }
    if (!req.admin.schoolId) {
      return res.status(403).json({ success: false, message: "Admin has no school assigned" });
    }

    const adminSchoolId = req.admin.schoolId;
    const { class: className, section, email } = req.query;

    let filter = { schoolId: adminSchoolId };
    if (className) filter.class   = className;
    if (section)   filter.section = section;

    if (email) {
      const matchingUsers = await User.find(
        { email: { $regex: email, $options: "i" } },
        "_id"
      );
      filter.userId = { $in: matchingUsers.map((u) => u._id) };
    }

    const students = await Student.find(filter)
      .populate("userId",    "fullName email role")
      .populate("schoolId",  "name email")
      .populate("parentId",  "fullName email")
      .populate("createdBy", "fullName email");

    res.status(200).json({ success: true, count: students.length, data: students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// GET SINGLE STUDENT (Admin only)
// =========================
exports.getStudentById = async (req, res) => {
  try {
    if (!req.admin) {
      return res.status(401).json({ success: false, message: "Admin not authenticated" });
    }
    if (!req.admin.schoolId) {
      return res.status(403).json({ success: false, message: "Admin has no school assigned" });
    }

    const student = await Student.findOne({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
    })
      .populate("userId",   "fullName email role")
      .populate("schoolId", "name email")
      .populate("parentId", "fullName email");

    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    res.status(200).json({ success: true, data: student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// GET MY PROFILE (Student self)
// =========================
exports.getMyProfile = async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id })
      .populate("userId",   "fullName email role")
      .populate("schoolId", "name email address")
      .populate("parentId", "fullName email");

    if (!student) {
      return res.status(404).json({ success: false, message: "Student profile not found" });
    }

    res.status(200).json({ success: true, data: student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// UPDATE STUDENT (Admin only)
// =========================
exports.updateStudent = async (req, res) => {
  try {
    if (!req.admin) {
      return res.status(401).json({ success: false, message: "Admin not authenticated" });
    }
    if (!req.admin.schoolId) {
      return res.status(403).json({ success: false, message: "Admin has no school assigned" });
    }

    const student = await Student.findOne({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
    });

    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const {
      admissionNumber,
      rollNumber,
      class: className,
      section,
      parentId,
      dob,
      address,
      phone,
      status,
      profileImage,
    } = req.body;

    if (admissionNumber !== undefined) student.admissionNumber = admissionNumber;
    if (rollNumber      !== undefined) student.rollNumber      = rollNumber;
    if (className       !== undefined) student.class           = className;
    if (section         !== undefined) student.section         = section;
    if (parentId        !== undefined) student.parentId        = parentId;
    if (dob             !== undefined) student.dob             = dob;
    if (address         !== undefined) student.address         = address;
    if (phone           !== undefined) student.phone           = phone;
    if (status          !== undefined) student.status          = status;
    if (profileImage    !== undefined) student.profileImage    = profileImage;

    await student.save();

    const updated = await Student.findById(student._id)
      .populate("userId",   "fullName email role")
      .populate("schoolId", "name email")
      .populate("parentId", "fullName email");

    res.status(200).json({
      success: true,
      message: "Student updated successfully",
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// DELETE STUDENT (Admin only)
// =========================
exports.deleteStudent = async (req, res) => {
  try {
    if (!req.admin) {
      return res.status(401).json({ success: false, message: "Admin not authenticated" });
    }
    if (!req.admin.schoolId) {
      return res.status(403).json({ success: false, message: "Admin has no school assigned" });
    }

    const student = await Student.findOne({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
    });

    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    // Revert user role to "user"
    await User.findByIdAndUpdate(student.userId, { role: "user" });
    await Student.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Student deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// GET AVAILABLE USERS (for student picker dropdown)
// Returns users not yet linked to any student
// =========================
exports.getAvailableUsers = async (req, res) => {
  try {
    if (!req.admin) {
      return res.status(401).json({ success: false, message: "Admin not authenticated" });
    }
    if (!req.admin.schoolId) {
      return res.status(403).json({ success: false, message: "Admin has no school assigned" });
    }

    const adminSchoolId = req.admin.schoolId;

    const existingStudents = await Student.find({ schoolId: adminSchoolId }, "userId");
    const linkedUserIds = existingStudents.map((s) => s.userId);

    const users = await User.find(
      { _id: { $nin: linkedUserIds } },
      "fullName email _id"
    ).limit(100);

    res.status(200).json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// =========================
// GET STUDENTS FOR TEACHER (Teacher view - read only)
// Looks up teacher's schoolId, returns all students in that school
// =========================
exports.getStudentsForTeacher = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    // Look up the teacher profile to get their schoolId
    const Teacher = require("../model/teacherSchema"); // adjust path if needed
    const teacher = await Teacher.findOne({ userId: req.user._id }).select("schoolId");

    if (!teacher) {
      return res.status(404).json({ success: false, message: "Teacher profile not found" });
    }
    if (!teacher.schoolId) {
      return res.status(403).json({ success: false, message: "Teacher is not assigned to any school" });
    }

    const { class: className, section } = req.query;

    const filter = { schoolId: teacher.schoolId };
    if (className) filter.class   = className;
    if (section)   filter.section = section;

    const students = await Student.find(filter)
      .populate("userId",   "fullName email role")
      .populate("schoolId", "name email")
      .select("-password"); // never expose hashes to teachers

    res.status(200).json({ success: true, count: students.length, data: students });
  } catch (error) {
    console.error("[getStudentsForTeacher]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};