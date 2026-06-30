const Teacher = require("../model/teacherSchema");
const User = require("../model/userSchema");
const School = require("../model/schoolSchema");
const { sendEmail } = require("../utils/sendEmail");

// =========================
// UTILS
// =========================

/** Generates a secure random password: 3 uppercase + 3 lowercase + 2 digits + 2 symbols */
const generatePassword = () => {
  const upper  = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower  = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const syms   = "@#$!%&";

  const pick = (str, n) =>
    Array.from({ length: n }, () => str[Math.floor(Math.random() * str.length)]).join("");

  const raw = pick(upper, 3) + pick(lower, 3) + pick(digits, 2) + pick(syms, 2);

  return raw
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
};

// =========================
// CREATE TEACHER (Admin only)
// Admin provides email + name + optional password — no OTP needed
// =========================
exports.createTeacher = async (req, res) => {
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

      employeeId,
      department,
      designation,
      qualification,
      subjects,
      experience,
      joiningDate,
      salary,
      address,
      phone,
      bankAccountNumber,
    } = req.body;

    // ── Validate required fields ──────────────────────────────────────────
    if (!fullName || !email || !employeeId || !department) {
      return res.status(400).json({
        success: false,
        message: "fullName, email, employeeId, and department are required",
      });
    }

    // ── Check email not already taken ─────────────────────────────────────
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists. Use a different email.",
      });
    }

    // ── Check employeeId uniqueness ───────────────────────────────────────
    const employeeExists = await Teacher.findOne({ employeeId });
    if (employeeExists) {
      return res.status(400).json({ success: false, message: "Employee ID already in use" });
    }

    // ── Resolve password ──────────────────────────────────────────────────
    const plainPassword = manualPassword?.trim() || generatePassword();

    if (plainPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // ── Create User account (pre-verified — no OTP) ───────────────────────
    // NOTE: pass the PLAIN password. userSchema's pre('save') hook hashes it.
    // Hashing it manually here too would double-hash it and break login.
    const user = await User.create({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password: plainPassword,
      role: "teacher",
      isVerified: true,
    });

    // Fetch the hash the hook just produced (password has select:false on User)
    const userWithHash = await User.findById(user._id).select("password");

    // ── Create Teacher record ─────────────────────────────────────────────
    const teacher = await Teacher.create({
      userId: user._id,
      schoolId: adminSchoolId,
      createdBy: req.admin._id,
      employeeId,
      department,
      designation: designation || "Lecturer",
      qualification: qualification || null,
      subjects: Array.isArray(subjects) ? subjects : subjects ? [subjects] : [],
      experience: experience != null ? Number(experience) : 0,
      joiningDate: joiningDate || Date.now(),
      salary: salary != null ? Number(salary) : 0,
      address: address || null,
      phone: phone || null,
      bankAccountNumber: bankAccountNumber || null,
      email: user.email,
      password: userWithHash.password,
    });

    const teacherData = await Teacher.findById(teacher._id)
      .populate("userId", "fullName email role")
      .populate("schoolId", "name email")
      .populate("createdBy", "fullName email");

    // ── Send welcome email with credentials ───────────────────────────────
    try {
      const school = await School.findById(adminSchoolId);
      await sendEmail({
        to: user.email,
        subject: `🎉 Welcome to ${school?.name ?? "the school"} — Your Teacher Account`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <div style="background: #1a73e8; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
              <h2 style="color: white; margin: 0;">📚 ${school?.name ?? "School System"}</h2>
            </div>
            <div style="padding: 30px;">
              <h3 style="color: #333;">Dear ${user.fullName},</h3>
              <p style="color: #555; font-size: 15px;">
                Your teacher account has been created by the admin. Use the credentials below to log in.
              </p>

              <div style="background: #f0f4ff; border: 1px solid #c7d7ff; border-radius: 8px; padding: 18px; margin: 22px 0;">
                <p style="margin: 0 0 6px; color: #444;"><strong>Login Email:</strong> <span style="color: #1a73e8;">${user.email}</span></p>
                <p style="margin: 0; color: #444;"><strong>Temporary Password:</strong>
                  <span style="font-family: monospace; font-size: 16px; background: #fff; border: 1px solid #ddd; padding: 2px 8px; border-radius: 4px; letter-spacing: 2px;">${plainPassword}</span>
                </p>
              </div>

              <div style="background: #fff8e1; border: 1px solid #ffe082; border-radius: 6px; padding: 12px; margin: 16px 0;">
                <p style="margin: 0; color: #795548; font-size: 13px;">
                  ⚠️ Please change your password after your first login for security.
                </p>
              </div>

              <div style="background: #f8f9fa; border-radius: 6px; padding: 15px; margin: 16px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="color: #666; padding: 4px 0; font-size: 13px;"><strong>Employee ID:</strong></td>
                    <td style="color: #333; font-size: 13px;">${employeeId}</td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 4px 0; font-size: 13px;"><strong>Department:</strong></td>
                    <td style="color: #333; font-size: 13px;">${department}</td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 4px 0; font-size: 13px;"><strong>Designation:</strong></td>
                    <td style="color: #333; font-size: 13px;">${designation || "Lecturer"}</td>
                  </tr>
                  <tr>
                    <td style="color: #666; padding: 4px 0; font-size: 13px;"><strong>Joining Date:</strong></td>
                    <td style="color: #333; font-size: 13px;">${new Date(teacher.joiningDate).toLocaleDateString("en-NP", { day: "2-digit", month: "long", year: "numeric" })}</td>
                  </tr>
                </table>
              </div>

              <p style="color: #888; font-size: 12px; margin-top: 28px;">
                This is an automated message. Please do not reply to this email.
              </p>
            </div>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error("[createTeacher] Welcome email failed:", emailErr.message);
    }

    res.status(201).json({
      success: true,
      message: "Teacher account created successfully. Credentials sent to their email.",
      data: teacherData,
    });
  } catch (error) {
    console.error("[createTeacher]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// GET ALL TEACHERS (Admin only)
// =========================
exports.getAllTeachers = async (req, res) => {
  try {
    if (!req.admin) {
      return res.status(401).json({ success: false, message: "Admin not authenticated" });
    }

    const adminSchoolId = req.admin.schoolId;
    if (!adminSchoolId) {
      return res.status(403).json({ success: false, message: "Admin has no school assigned" });
    }

    const { department, status } = req.query;
    const filter = { schoolId: adminSchoolId };
    if (department) filter.department = department;
    if (status) filter.status = status;

    const teachers = await Teacher.find(filter)
      .populate("userId", "fullName email role")
      .populate("schoolId", "name email")
      .populate("createdBy", "fullName email");

    res.status(200).json({ success: true, count: teachers.length, data: teachers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// GET SINGLE TEACHER (Admin only)
// =========================
exports.getTeacherById = async (req, res) => {
  try {
    if (!req.admin) {
      return res.status(401).json({ success: false, message: "Admin not authenticated" });
    }

    const adminSchoolId = req.admin.schoolId;
    if (!adminSchoolId) {
      return res.status(403).json({ success: false, message: "Admin has no school assigned" });
    }

    const teacher = await Teacher.findOne({ _id: req.params.id, schoolId: adminSchoolId })
      .populate("userId", "fullName email role")
      .populate("schoolId", "name email");

    if (!teacher) {
      return res.status(404).json({ success: false, message: "Teacher not found" });
    }

    res.status(200).json({ success: true, data: teacher });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// GET MY PROFILE (Teacher self)
// =========================
exports.getMyProfile = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ userId: req.user._id })
      .populate("userId", "fullName email role")
      .populate("schoolId", "name email address");

    if (!teacher) {
      return res.status(404).json({ success: false, message: "Teacher profile not found" });
    }

    res.status(200).json({ success: true, data: teacher });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// UPDATE TEACHER (Admin only)
// =========================
exports.updateTeacher = async (req, res) => {
  try {
    if (!req.admin) {
      return res.status(401).json({ success: false, message: "Admin not authenticated" });
    }

    const adminSchoolId = req.admin.schoolId;
    if (!adminSchoolId) {
      return res.status(403).json({ success: false, message: "Admin has no school assigned" });
    }

    const teacher = await Teacher.findOne({ _id: req.params.id, schoolId: adminSchoolId });
    if (!teacher) {
      return res.status(404).json({ success: false, message: "Teacher not found" });
    }

    const {
      employeeId,
      department,
      designation,
      qualification,
      subjects,
      experience,
      salary,
      address,
      phone,
      bankAccountNumber,
      status,
      joiningDate,
      profileImage,
    } = req.body;

    if (employeeId)              teacher.employeeId       = employeeId;
    if (department)              teacher.department       = department;
    if (designation)             teacher.designation      = designation;
    if (qualification)           teacher.qualification    = qualification;
    if (subjects)                teacher.subjects         = Array.isArray(subjects) ? subjects : [subjects];
    if (experience !== undefined) teacher.experience      = Number(experience);
    if (salary !== undefined)    teacher.salary           = Number(salary);
    if (address)                 teacher.address          = address;
    if (phone)                   teacher.phone            = phone;
    if (bankAccountNumber)       teacher.bankAccountNumber = bankAccountNumber;
    if (status)                  teacher.status           = status;
    if (joiningDate)             teacher.joiningDate      = joiningDate;
    if (profileImage)            teacher.profileImage     = profileImage;

    await teacher.save();

    const updated = await Teacher.findById(teacher._id)
      .populate("userId", "fullName email role")
      .populate("schoolId", "name email");

    res.status(200).json({ success: true, message: "Teacher updated successfully", data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// DELETE TEACHER (Admin only)
// Also deletes the linked User account created by admin
// =========================
exports.deleteTeacher = async (req, res) => {
  try {
    if (!req.admin) {
      return res.status(401).json({ success: false, message: "Admin not authenticated" });
    }

    const adminSchoolId = req.admin.schoolId;
    if (!adminSchoolId) {
      return res.status(403).json({ success: false, message: "Admin has no school assigned" });
    }

    const teacher = await Teacher.findOne({ _id: req.params.id, schoolId: adminSchoolId });
    if (!teacher) {
      return res.status(404).json({ success: false, message: "Teacher not found" });
    }

    await User.findByIdAndDelete(teacher.userId);
    await Teacher.findByIdAndDelete(req.params.id);

    res.status(200).json({ success: true, message: "Teacher and linked account deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};