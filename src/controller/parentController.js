const Parent = require("../model/parentSchema");
const User = require("../model/userSchema");
const Student = require("../model/studentSchema");
const Attendance = require("../model/attendenceSchema");
const Fee = require("../model/feeSchema");
const Notification = require("../model/notificationSchema");
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
// CREATE PARENT (Admin only)
// Admin provides email + fullName + optional password
// No OTP — account is pre-verified
// =========================
exports.createParent = async (req, res) => {
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

      occupation,
      address,
      phone,
      students,
    } = req.body;

    // ── Validate required fields ──────────────────────────────────────────
    if (!fullName || !email) {
      return res.status(400).json({
        success: false,
        message: "fullName and email are required",
      });
    }

    // ── Check email uniqueness ────────────────────────────────────────────
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "A user with this email already exists. Use a different email.",
      });
    }

    // ── Resolve password ──────────────────────────────────────────────────
    const plainPassword = manualPassword?.trim() || generatePassword();
    if (plainPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // ── Validate students belong to this school ───────────────────────────
    let validStudents = [];
    if (students && students.length > 0) {
      validStudents = await Student.find({
        _id: { $in: students },
        schoolId: adminSchoolId,
      }).populate("userId", "fullName email");

      if (validStudents.length !== students.length) {
        return res.status(400).json({
          success: false,
          message: "One or more students not found in your school",
        });
      }
    }

    // ── Create User account (pre-verified — no OTP) ───────────────────────
    // NOTE: pass the PLAIN password. userSchema's pre('save') hook hashes it.
    // Hashing it manually here too would double-hash it and break login.
    const user = await User.create({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password: plainPassword,
      role: "parent",
      isVerified: true,
    });

    // Fetch the hash the hook just produced (password has select:false on User)
    const userWithHash = await User.findById(user._id).select("password");

    // ── Create Parent record ──────────────────────────────────────────────
    const parent = await Parent.create({
      userId: user._id,
      schoolId: adminSchoolId,
      createdBy: req.admin._id,
      occupation: occupation || null,
      address: address || null,
      phone: phone || null,
      students: students || [],
      email: user.email,
      password: userWithHash.password,
    });

    // ── Link students back to this parent ─────────────────────────────────
    if (students && students.length > 0) {
      await Student.updateMany(
        { _id: { $in: students } },
        { parentId: user._id }
      );
    }

    // ── Send welcome notification (in-app) ────────────────────────────────
    const childrenNames = validStudents
      .map((s) => s.userId?.fullName)
      .filter(Boolean)
      .join(", ");

    await Notification.create({
      recipient: user._id,
      schoolId: adminSchoolId,
      title: "Welcome to School Portal",
      message: childrenNames
        ? `Your parent account has been created and linked to: ${childrenNames}. You can now track attendance, fees, and assignments.`
        : `Your parent account has been created. You can now track your child's attendance, fees, and assignments.`,
      type: "general",
    });

    // ── Send welcome email with credentials ───────────────────────────────
    try {
      const studentsListHtml = validStudents.length > 0
        ? `<ul style="padding-left:18px;margin:8px 0;">
            ${validStudents
              .map(
                (s) =>
                  `<li style="color:#333;margin-bottom:4px;">${s.userId?.fullName || "N/A"} — Class ${s.class || ""}${s.section ? " " + s.section : ""}</li>`
              )
              .join("")}
           </ul>`
        : "";

      await sendEmail({
        to: user.email,
        subject: "Your Parent Account — School Portal",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px;">
            <div style="background:#1a73e8;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
              <h2 style="color:white;margin:0;">📚 School Portal</h2>
            </div>
            <div style="padding:30px;">
              <h3 style="color:#333;">Dear ${user.fullName},</h3>
              <p style="color:#555;font-size:15px;">
                Your parent account has been created by the school admin. Use the credentials below to log in.
              </p>

              <div style="background:#f0f4ff;border:1px solid #c7d7ff;border-radius:8px;padding:18px;margin:22px 0;">
                <p style="margin:0 0 8px;color:#444;font-size:14px;"><strong>Login Email:</strong> <span style="color:#1a73e8;">${user.email}</span></p>
                <p style="margin:0;color:#444;font-size:14px;"><strong>Password:</strong>
                  <span style="font-family:monospace;font-size:16px;background:#fff;border:1px solid #ddd;padding:2px 10px;border-radius:4px;letter-spacing:2px;">${plainPassword}</span>
                </p>
              </div>

              <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:12px;margin:16px 0;">
                <p style="margin:0;color:#795548;font-size:13px;">
                  ⚠️ Please change your password after your first login for security.
                </p>
              </div>

              ${
                validStudents.length > 0
                  ? `<p style="color:#555;font-size:14px;">You are linked to the following student(s):</p>${studentsListHtml}`
                  : ""
              }

              <p style="color:#555;font-size:14px;">Once logged in you can:</p>
              <ul style="color:#555;font-size:14px;padding-left:18px;">
                <li>Track your child's attendance</li>
                <li>View and pay fees</li>
                <li>Check assignments</li>
                <li>Receive important notifications</li>
              </ul>

              <p style="color:#888;font-size:12px;margin-top:28px;">
                This is an automated message. Please do not reply to this email.
              </p>
            </div>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error("[createParent] Welcome email failed:", emailErr.message);
    }

    const parentData = await Parent.findById(parent._id)
      .populate("userId", "fullName email role")
      .populate("schoolId", "name email")
      .populate({
        path: "students",
        populate: { path: "userId", select: "fullName email" },
      });

    res.status(201).json({
      success: true,
      message: "Parent account created successfully. Credentials sent to their email.",
      data: parentData,
    });
  } catch (error) {
    console.error("[createParent]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// GET ALL PARENTS (Admin only)
// =========================
exports.getAllParents = async (req, res) => {
  try {
    const adminSchoolId = req.admin.schoolId;

    const parents = await Parent.find({ schoolId: adminSchoolId })
      .populate("userId", "fullName email role")
      .populate("schoolId", "name")
      .populate("createdBy", "fullName email")
      .populate({
        path: "students",
        populate: { path: "userId", select: "fullName email" },
      });

    res.status(200).json({ success: true, count: parents.length, data: parents });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// GET SINGLE PARENT (Admin only)
// =========================
exports.getParentById = async (req, res) => {
  try {
    const adminSchoolId = req.admin.schoolId;

    const parent = await Parent.findOne({ _id: req.params.id, schoolId: adminSchoolId })
      .populate("userId", "fullName email role")
      .populate({
        path: "students",
        populate: { path: "userId", select: "fullName email" },
      });

    if (!parent) {
      return res.status(404).json({ success: false, message: "Parent not found" });
    }

    res.status(200).json({ success: true, data: parent });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// UPDATE PARENT (Admin only)
// =========================
exports.updateParent = async (req, res) => {
  try {
    const adminSchoolId = req.admin.schoolId;
    const { occupation, address, phone, status, students } = req.body;

    const parent = await Parent.findOne({ _id: req.params.id, schoolId: adminSchoolId });
    if (!parent) {
      return res.status(404).json({ success: false, message: "Parent not found" });
    }

    if (occupation !== undefined) parent.occupation = occupation;
    if (address    !== undefined) parent.address    = address;
    if (phone      !== undefined) parent.phone      = phone;
    if (status     !== undefined) parent.status     = status;

    if (students) {
      const removedStudents = parent.students.filter(
        (s) => !students.includes(s.toString())
      );
      if (removedStudents.length > 0) {
        await Student.updateMany(
          { _id: { $in: removedStudents } },
          { $unset: { parentId: "" } }
        );
      }

      const addedStudents = students.filter(
        (s) => !parent.students.map((ps) => ps.toString()).includes(s)
      );
      if (addedStudents.length > 0) {
        await Student.updateMany(
          { _id: { $in: addedStudents } },
          { parentId: parent.userId }
        );
      }

      parent.students = students;
    }

    await parent.save();

    const updated = await Parent.findById(parent._id)
      .populate("userId", "fullName email role")
      .populate({
        path: "students",
        populate: { path: "userId", select: "fullName email" },
      });

    res.status(200).json({ success: true, message: "Parent updated successfully", data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// DELETE PARENT (Admin only)
// Also deletes the linked User account created by admin
// =========================
exports.deleteParent = async (req, res) => {
  try {
    const adminSchoolId = req.admin.schoolId;

    const parent = await Parent.findOne({ _id: req.params.id, schoolId: adminSchoolId });
    if (!parent) {
      return res.status(404).json({ success: false, message: "Parent not found" });
    }

    if (parent.students.length > 0) {
      await Student.updateMany(
        { _id: { $in: parent.students } },
        { $unset: { parentId: "" } }
      );
    }

    await User.findByIdAndDelete(parent.userId);
    await Parent.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Parent and linked account deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// GET MY PROFILE (Parent self)
// =========================
exports.getMyProfile = async (req, res) => {
  try {
    const parent = await Parent.findOne({ userId: req.user._id })
      .populate("userId", "fullName email role")
      .populate("schoolId", "name email address")
      .populate({
        path: "students",
        populate: { path: "userId", select: "fullName email" },
      });

    if (!parent) {
      return res.status(404).json({ success: false, message: "Parent profile not found" });
    }

    res.status(200).json({ success: true, data: parent });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// GET PARENT DASHBOARD (Parent self)
// =========================
exports.getParentDashboard = async (req, res) => {
  try {
    const parent = await Parent.findOne({ userId: req.user._id }).populate({
      path: "students",
      populate: { path: "userId", select: "fullName email" },
    });

    if (!parent) {
      return res.status(404).json({ success: false, message: "Parent profile not found" });
    }

    const studentIds = parent.students.map((s) => s._id);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().split("T")[0];

    const attendance = await Attendance.find({
      studentId: { $in: studentIds },
      date: { $gte: dateStr },
    }).sort({ date: -1 });

    const fees = await Fee.find({
      studentId: { $in: studentIds },
      status: { $in: ["pending", "partial"] },
    }).sort({ dueDate: 1 });

    const notifications = await Notification.find({
      recipient: req.user._id,
      isRead: false,
    }).sort({ createdAt: -1 }).limit(10);

    const childrenSummary = await Promise.all(
      parent.students.map(async (student) => {
        const studentAttendance = attendance.filter(
          (a) => a.studentId.toString() === student._id.toString()
        );
        const present = studentAttendance.filter((a) => a.status === "present").length;
        const absent  = studentAttendance.filter((a) => a.status === "absent").length;
        const late    = studentAttendance.filter((a) => a.status === "late").length;
        const total   = studentAttendance.length;

        const studentFees = fees.filter(
          (f) => f.studentId.toString() === student._id.toString()
        );
        const totalDue = studentFees.reduce((sum, f) => sum + f.remainingAmount, 0);

        return {
          student: {
            _id: student._id,
            name: student.userId?.fullName,
            class: student.class,
            section: student.section,
            admissionNumber: student.admissionNumber,
          },
          attendance: {
            total, present, absent, late,
            percentage: total > 0 ? `${((present / total) * 100).toFixed(1)}%` : "0%",
          },
          fees: { pendingCount: studentFees.length, totalDue },
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        parent: { _id: parent._id, occupation: parent.occupation, address: parent.address },
        unreadNotifications: notifications.length,
        notifications,
        children: childrenSummary,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// GET CHILD ATTENDANCE (Parent self)
// =========================
exports.getChildAttendance = async (req, res) => {
  try {
    const parent = await Parent.findOne({ userId: req.user._id });
    if (!parent) return res.status(403).json({ success: false, message: "Access denied" });

    const { studentId } = req.params;
    const { month, year } = req.query;

    if (!parent.students.map((s) => s.toString()).includes(studentId)) {
      return res.status(403).json({ success: false, message: "This student is not linked to your account" });
    }

    let filter = { studentId };
    if (month && year) {
      const monthStr = String(month).padStart(2, "0");
      filter.date = { $regex: `^${year}-${monthStr}` };
    }

    const records = await Attendance.find(filter).sort({ date: -1 });
    const present = records.filter((r) => r.status === "present").length;
    const absent  = records.filter((r) => r.status === "absent").length;
    const late    = records.filter((r) => r.status === "late").length;
    const total   = records.length;

    res.status(200).json({
      success: true,
      summary: {
        total, present, absent, late,
        attendancePercentage: total > 0 ? `${((present / total) * 100).toFixed(1)}%` : "0%",
      },
      data: records,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =========================
// GET CHILD FEES (Parent self)
// =========================
exports.getChildFees = async (req, res) => {
  try {
    const parent = await Parent.findOne({ userId: req.user._id });
    if (!parent) return res.status(403).json({ success: false, message: "Access denied" });

    const { studentId } = req.params;

    if (!parent.students.map((s) => s.toString()).includes(studentId)) {
      return res.status(403).json({ success: false, message: "This student is not linked to your account" });
    }

    const fees = await Fee.find({ studentId }).sort({ dueDate: 1 });
    const totalDue = fees
      .filter((f) => f.status !== "paid")
      .reduce((sum, f) => sum + f.remainingAmount, 0);

    res.status(200).json({ success: true, totalDue, count: fees.length, data: fees });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


exports.updateMyProfile = async (req, res) => {
  try {
    const { fullName, occupation, address, phone } = req.body;
 
    // Update User.fullName if supplied
    if (fullName !== undefined) {
      const trimmed = fullName.trim();
      if (!trimmed) {
        return res.status(400).json({ success: false, message: "fullName cannot be empty" });
      }
      await User.findByIdAndUpdate(req.user._id, { fullName: trimmed });
    }
 
    // Update Parent fields
    const parentUpdate = {};
    if (occupation !== undefined) parentUpdate.occupation = occupation || null;
    if (address    !== undefined) parentUpdate.address    = address    || null;
    if (phone      !== undefined) parentUpdate.phone      = phone      || null;
 
    const parent = await Parent.findOneAndUpdate(
      { userId: req.user._id },
      { $set: parentUpdate },
      { new: true }
    )
      .populate("userId", "fullName email role")
      .populate("schoolId", "name email address")
      .populate({
        path: "students",
        populate: { path: "userId", select: "fullName email" },
      });
 
    if (!parent) {
      return res.status(404).json({ success: false, message: "Parent profile not found" });
    }
 
    res.status(200).json({ success: true, message: "Profile updated successfully", data: parent });
  } catch (error) {
    console.error("[updateMyProfile]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
 
// =========================
// CHANGE MY PASSWORD (Parent self)
// Requires: currentPassword, newPassword
// =========================
exports.changeMyPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
 
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "currentPassword and newPassword are required",
      });
    }
 
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters",
      });
    }
 
    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from current password",
      });
    }
 
    // Fetch hashed password (select:false field)
    const userWithHash = await User.findById(req.user._id).select("password");
    if (!userWithHash) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
 
    // Verify current password
    // NOTE: if userSchema has a comparePassword instance method, replace
    // the line below with: const match = await userWithHash.comparePassword(currentPassword);
    const match = await bcrypt.compare(currentPassword, userWithHash.password);
    if (!match) {
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }
 
    // Assign plain password — pre('save') hook will hash it
    userWithHash.password = newPassword;
    await userWithHash.save();
 
    // Also update the cached hash stored on the Parent document
    const hashedNew = await User.findById(req.user._id).select("password");
    await Parent.findOneAndUpdate(
      { userId: req.user._id },
      { password: hashedNew.password }
    );
 
    res.status(200).json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error("[changeMyPassword]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};