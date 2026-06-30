const User = require("../model/userSchema");
const bcrypt = require("bcryptjs");

// =========================
// GET SUPERADMIN PROFILE
// GET /api/superadmin/profile
// Protected: superadmin only
// =========================
exports.getProfile = async (req, res) => {
  try {
    // req.user is set by your auth middleware (contains { id, role } from JWT)
    const superAdmin = await User.findById(req.user.id).select("-password");

    if (!superAdmin || superAdmin.role !== "superadmin") {
      return res.status(404).json({ message: "Superadmin not found" });
    }

    res.status(200).json({
      success: true,
      data: {
        profile: {
          name: superAdmin.fullName,
          email: superAdmin.email,
          phone: superAdmin.phone || "",
        },
        twoFactorEnabled: superAdmin.twoFactorEnabled || false,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// UPDATE SUPERADMIN PROFILE
// PATCH /api/superadmin/profile
// Protected: superadmin only
// =========================
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;

    // email is intentionally NOT updatable here (it is disabled in UI too)
    const superAdmin = await User.findById(req.user.id);

    if (!superAdmin || superAdmin.role !== "superadmin") {
      return res.status(404).json({ message: "Superadmin not found" });
    }

    if (name) superAdmin.fullName = name;
    if (phone !== undefined) superAdmin.phone = phone;

    await superAdmin.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        name: superAdmin.fullName,
        email: superAdmin.email,
        phone: superAdmin.phone || "",
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// TOGGLE 2FA
// POST /api/superadmin/2fa
// Protected: superadmin only
// =========================
exports.toggle2FA = async (req, res) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "'enabled' must be a boolean" });
    }

    const superAdmin = await User.findById(req.user.id);

    if (!superAdmin || superAdmin.role !== "superadmin") {
      return res.status(404).json({ message: "Superadmin not found" });
    }

    superAdmin.twoFactorEnabled = enabled;
    await superAdmin.save();

    res.status(200).json({
      success: true,
      message: `Two-factor authentication ${enabled ? "enabled" : "disabled"}`,
      twoFactorEnabled: superAdmin.twoFactorEnabled,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// CHANGE PASSWORD
// POST /api/superadmin/change-password
// Protected: superadmin only
// =========================
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "currentPassword and newPassword are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters" });
    }

    // Must select +password since it's select:false in schema
    const superAdmin = await User.findById(req.user.id).select("+password");

    if (!superAdmin || superAdmin.role !== "superadmin") {
      return res.status(404).json({ message: "Superadmin not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, superAdmin.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Assign plain text — pre-save hook in userSchema will hash it
    superAdmin.password = newPassword;
    await superAdmin.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};