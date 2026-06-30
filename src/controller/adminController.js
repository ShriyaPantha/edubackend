const Admin = require("../model/adminSchema");
const School = require("../model/schoolSchema");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../model/userSchema");
const { logAudit } = require("../controller/auditLogsController");


exports.createAdmin = async (req, res) => {
  try {
    const { fullName, email, password, phone, schoolId } = req.body;

    if (!fullName || !email || !password || !schoolId) {
      return res.status(400).json({
        success: false,
        message: "fullName, email, password and schoolId are required",
      });
    }

    // ── 1. Validate school exists ─────────────────────────────────────────
    const school = await School.findById(schoolId).populate("activePlan");
    if (!school) {
      return res.status(404).json({ success: false, message: "School not found" });
    }

    // ── 2. Check school has an active subscription ────────────────────────
    if (school.subscriptionStatus !== "active") {
      return res.status(403).json({
        success: false,
        message: "This school does not have an active subscription.",
      });
    }

    if (!school.activePlan) {
      return res.status(403).json({
        success: false,
        message: "No plan assigned to this school. Please contact support.",
      });
    }

    // ── 3. Enforce maxAdmins from plan ────────────────────────────────────
    const maxAdmins = school.activePlan.features?.maxAdmins ?? 1;
    const currentAdminCount = await Admin.countDocuments({ schoolId });

    if (currentAdminCount >= maxAdmins) {
      return res.status(403).json({
        success: false,
        message: `Admin limit reached. Your ${school.activePlan.name.toUpperCase()} plan allows a maximum of ${
          maxAdmins >= 99999 ? "unlimited" : maxAdmins
        } admin${maxAdmins === 1 ? "" : "s"}. Current: ${currentAdminCount}.`,
      });
    }

    // ── 4. Check for duplicate email ──────────────────────────────────────
    const exists = await Admin.findOne({ email });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Admin with this email already exists",
      });
    }

    // ── 5. Create admin ───────────────────────────────────────────────────
    const admin = await Admin.create({
      fullName,
      email,
      password,
      phone: phone || null,
      schoolId,
      role: "admin",
      createdBy: req.user?._id ?? null,
    });

    const adminData = await Admin.findById(admin._id)
      .select("-password")
      .populate("schoolId", "name email");

    // ── 6. Audit log — fire-and-forget; a logging failure must not fail the request ──
    try {
      await logAudit({
        action: `Admin created: ${email}`,
        user: req.user?.fullName ?? "Superadmin",
        userId: req.user?._id,
        role: "superadmin",
        category: "User",
        status: "success",
        req,
      });
    } catch (auditErr) {
      console.error("Audit log failed for createAdmin:", auditErr.message);
    }

    // ── 7. Respond (moved to the end so logAudit actually runs) ───────────
    return res.status(201).json({
      success: true,
      message: `Admin created successfully (${currentAdminCount + 1}/${
        maxAdmins >= 99999 ? "∞" : maxAdmins
      } admins used).`,
      data: adminData,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
// =========================
// LOGIN ADMIN
// =========================
exports.loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email }).select("+password");

    if (!admin) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!admin.isActive) {
      return res.status(403).json({
        message: "Your account has been deactivated. Contact superadmin.",
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // 🚨 IMPORTANT FIX: ensure schoolId exists
    if (!admin.schoolId) {
      return res.status(403).json({
        message: "No school assigned to this admin. Please contact superadmin.",
      });
    }

    const token = jwt.sign(
      { id: admin._id },   // MUST BE "id"
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const adminData = await Admin.findById(admin._id)
      .populate("schoolId", "name email");

    res.status(200).json({
      success: true,
      token,
      data: adminData,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET ALL ADMINS
// =========================
exports.getAdmins = async (req, res) => {
  try {
    const admins = await Admin.find()
      .select("-password")
      .populate("schoolId", "name email address")
      .populate("createdBy", "fullName email"); // show who created them

    res.status(200).json({
      success: true,
      count: admins.length,
      data: admins,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET SINGLE ADMIN
// =========================
exports.getAdminById = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id)
      .select("-password")
      .populate("schoolId", "name email address")
      .populate("createdBy", "fullName email");

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.status(200).json({ success: true, data: admin });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// UPDATE ADMIN
// =========================
exports.updateAdmin = async (req, res) => {
  try {
    const { fullName, email, phone, schoolId, isActive, password } = req.body;

    const admin = await Admin.findById(req.params.id);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // Validate schoolId if being updated
    if (schoolId) {
      const school = await School.findById(schoolId);
      if (!school) {
        return res.status(404).json({ message: "School not found. Please provide a valid schoolId" });
      }
    }

    // Update only provided fields
    if (fullName) admin.fullName = fullName;
    if (email) admin.email = email;
    if (phone) admin.phone = phone;
    if (schoolId) admin.schoolId = schoolId;
    if (typeof isActive === "boolean") admin.isActive = isActive; //activate/deactivate
    if (password) admin.password = password; // pre-save will re-hash

    await admin.save();

    const updated = await Admin.findById(admin._id)
      .select("-password")
      .populate("schoolId", "name email");

    res.status(200).json({
      success: true,
      message: "Admin updated successfully",
      data: updated,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// DELETE ADMIN
// =========================
exports.deleteAdmin = async (req, res) => {
  try {
    const admin = await Admin.findByIdAndDelete(req.params.id);

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // Revert user role back
    if (admin.userId) {
      await User.findByIdAndUpdate(admin.userId, { role: "user" });
    }

    res.status(200).json({
      success: true,
      message: "Admin deleted successfully and user role reverted",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// ASSIGN SCHOOL TO ADMIN
// =========================
exports.assignSchool = async (req, res) => {
  try {
    const { schoolId } = req.body;
    const { id } = req.params; // adminId

    if (!schoolId) {
      return res.status(400).json({ message: "schoolId is required" });
    }

    // Validate school exists
    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    // Check if school already assigned to another admin
    const alreadyAssigned = await Admin.findOne({ schoolId });
    if (alreadyAssigned && alreadyAssigned._id.toString() !== id) {
      return res.status(400).json({
        message: `This school is already assigned to admin: ${alreadyAssigned.fullName}`,
      });
    }

    const admin = await Admin.findByIdAndUpdate(
      id,
      { schoolId },
      { new: true }
    )
      .select("-password")
      .populate("schoolId", "name email address");

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.status(200).json({
      success: true,
      message: `School "${school.name}" assigned to admin "${admin.fullName}"`,
      data: admin,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};