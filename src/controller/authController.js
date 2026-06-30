const User = require("../model/userSchema");
const OTP = require("../model/otp");
const bcrypt = require("bcryptjs");
const Teacher = require("../model/teacherSchema");
const jwt = require("jsonwebtoken");
const sendOTP = require("../utils/sendOTP");
const { logAudit } = require("../controller/auditLogsController");

// =========================
// REGISTER (SEND OTP ONLY)
// =========================
exports.register = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    // FIX 1: Hash password before storing in temp memory
    // const hashedPassword = await bcrypt.hash(password, 12);

    if (!req.app.locals.tempUsers) req.app.locals.tempUsers = {};
    req.app.locals.tempUsers[email] = { fullName, email, password, };

    await OTP.deleteMany({ email });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await OTP.create({
      email,
      otp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    await sendOTP(email, otp);

    res.status(200).json({ message: "OTP sent to your email" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// VERIFY OTP + CREATE USER
// =========================
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const record = await OTP.findOne({ email, otp });
    if (!record || record.expiresAt < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    const tempUsers = req.app.locals.tempUsers || {};
    const tempUser = tempUsers[email];
    if (!tempUser) {
      return res.status(400).json({ message: "Session expired. Please register again." });
    }

    // Password is already hashed — save directly, do NOT hash again
    const user = await User.create({
      fullName: tempUser.fullName,
      email: tempUser.email,
      password: tempUser.password,
      role: "user",
      isVerified: true,
    });

    await OTP.deleteMany({ email });
    delete req.app.locals.tempUsers[email];

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    await logAudit({
      action: `Registration: ${user.email}`,
      user: user.fullName,
      userId: user._id,
      role: user.role,
      category: "Auth",
      status: "success",
      req,
    });

    res.status(201).json({
      success: true,
      message: "Account verified and created successfully",
      token,
      role: user.role,
      data: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// UNIFIED LOGIN
// Checks Admin first → then User
// One endpoint handles all roles: admin, student, teacher, user
// =========================
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // ── Step 1: Check Admin collection ───────────────────────────────────────
    const Admin = require("../model/adminSchema");
    const admin = await Admin.findOne({ email }).select("+password");

    if (admin) {
      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) {
        await logAudit({
          action: `Failed login attempt for ${email}`,
          user: email,
          category: "Security",
          status: "danger",
          req,
        });
        return res.status(400).json({ message: "Invalid credentials" });
      }

      if (!admin.isActive) {
        return res.status(403).json({
          message: "Your account has been deactivated. Contact superadmin.",
        });
      }

      if (!admin.schoolId) {
        return res.status(403).json({
          message: "No school assigned to your account. Contact superadmin.",
        });
      }

      const token = jwt.sign(
        { id: admin._id },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      const adminData = await Admin.findById(admin._id)
        .select("-password")
        .populate("schoolId", "name email");

      await logAudit({
        action: `Login: ${adminData.email}`,
        user: adminData.fullName,
        userId: adminData._id,
        role: "admin",
        category: "Auth",
        status: "success",
        req,
      });

      return res.status(200).json({
        success: true,
        token,
        role: "admin",
        data: {
          _id: adminData._id,
          fullName: adminData.fullName,
          email: adminData.email,
          role: "admin",
          schoolId: adminData.schoolId,
          isActive: adminData.isActive,
        },
      });
    }

    // ── Step 2: Fall through to User collection ───────────────────────────────
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      await logAudit({
        action: `Failed login attempt for ${email}`,
        user: email,
        category: "Security",
        status: "danger",
        req,
      });
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!user.isVerified) {
      return res.status(403).json({ message: "Please verify your email first" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      await logAudit({
        action: `Failed login attempt for ${email}`,
        user: email,
        category: "Security",
        status: "danger",
        req,
      });
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    await logAudit({
      action: `Login: ${user.email}`,
      user: user.fullName,
      userId: user._id,
      role: user.role,
      category: "Auth",
      status: "success",
      req,
    });

    return res.status(200).json({
      success: true,
      token,
      role: user.role,
      data: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
      },
    });

  } catch (err) {
    // FIX 3: Wrap logAudit in try/catch so its failure can't swallow the error
    // and leave the request hanging with no response
    try {
      await logAudit({
        action: `Failed login attempt for ${email}`,
        user: email,
        category: "Security",
        status: "danger",
        req,
      });
    } catch (auditErr) {
      console.error("[login] logAudit failed in catch:", auditErr.message);
    }
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET USER BY EMAIL
// GET /api/users/by-email?email=...
// =========================
exports.getUserByEmail = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email })
      .select("_id fullName email role isVerified");

    if (!user) {
      return res.status(404).json({ message: "No user found with that email" });
    }

    res.status(200).json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// RESEND OTP
// =========================
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    // FIX 2: Block resend if no pending registration session exists
    const tempUsers = req.app.locals.tempUsers || {};
    if (!tempUsers[email]) {
      return res.status(400).json({ message: "No pending registration found for this email. Please register first." });
    }

    const user = await User.findOne({ email });
    if (user?.isVerified) {
      return res.status(400).json({ message: "Email is already verified." });
    }

    // FIX 2: Rate-limit — block resend if a non-expired OTP already exists
    const existingOTP = await OTP.findOne({ email, expiresAt: { $gt: new Date() } });
    if (existingOTP) {
      return res.status(429).json({ message: "An OTP was already sent. Please wait before requesting a new one." });
    }

    await OTP.deleteMany({ email });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await OTP.create({ email, otp, expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
    await sendOTP(email, otp);

    res.status(200).json({ message: "OTP resent successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


 
// =========================
// UPDATE PROFILE (User/Teacher self)
// PUT /api/auth/update-profile
// Updates fullName on User doc
// Updates address + phone on Teacher doc (if teacher)
// =========================
exports.updateProfile = async (req, res) => {
  try {
    const { fullName, address, phone } = req.body;
 
    if (!fullName?.trim()) {
      return res.status(400).json({ message: "Full name is required" });
    }
 
    // Update User doc
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { fullName: fullName.trim() },
      { new: true, select: "fullName email role" }
    );
 
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
 
    // If teacher — also update address/phone on Teacher doc
    if (user.role === "teacher") {
      const update = {};
      if (address !== undefined) update.address = address;
      if (phone   !== undefined) update.phone   = phone;
 
      if (Object.keys(update).length) {
        await Teacher.findOneAndUpdate({ userId: req.user._id }, update);
      }
    }
 
    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: { fullName: user.fullName, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
 
// =========================
// CHANGE PASSWORD (User/Teacher self)
// PUT /api/auth/change-password
// =========================
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
 
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "All password fields are required" });
    }
 
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New password and confirm password do not match" });
    }
 
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }
 
    if (currentPassword === newPassword) {
      return res.status(400).json({ message: "New password must differ from current password" });
    }
 
    // Fetch with password (select: false on schema)
    const user = await User.findById(req.user._id).select("+password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
 
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }
 
    // Pre-save hook on userSchema hashes it — assign plain text
    user.password = newPassword;
    await user.save();
 
    res.status(200).json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};