const User = require("../model/userSchema");
const bcrypt = require("bcryptjs");

// =========================
// CREATE SCHOOL ADMIN
// =========================
exports.createAdmin = async (req, res) => {
  try {
    const { fullName, email, password, phone, schoolId } = req.body;

    // Validate required fields
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "fullName, email and password are required" });
    }

    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: "Admin with this email already exists" });
    }

    const admin = await User.create({
      fullName,
      email,
      password,       // plain text — hook will hash it
      phone: phone || null,
      schoolId: schoolId || null,
      role: "admin",
      isVerified: true, // admin created by superadmin, no OTP needed
    });

    // Return admin without password
    const adminData = await User.findById(admin._id); // password is select:false by default

    res.status(201).json({
      success: true,
      message: "School Admin created successfully",
      data: adminData,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// GET ALL ADMINS
// =========================
exports.getAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: "admin" }).select("-password");

    res.status(200).json({
      success: true,
      count: admins.length,
      data: admins,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// GET SINGLE ADMIN
// =========================
exports.getAdmin = async (req, res) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: "admin" }).select("-password");

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.status(200).json({ success: true, data: admin });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// UPDATE ADMIN
// =========================
exports.updateAdmin = async (req, res) => {
  try {
    const { fullName, email, phone, schoolId, password } = req.body;

    const admin = await User.findOne({ _id: req.params.id, role: "admin" });
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // Update only provided fields
    if (fullName) admin.fullName = fullName;
    if (email) admin.email = email;
    if (phone) admin.phone = phone;
    if (schoolId) admin.schoolId = schoolId;
    if (password) admin.password = password; // pre-save hook will re-hash

    await admin.save();

    const updated = await User.findById(admin._id); // fetch without password

    res.status(200).json({
      success: true,
      message: "Admin updated successfully",
      data: updated,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// DELETE ADMIN
// =========================
exports.deleteAdmin = async (req, res) => {
  try {
    const admin = await User.findOneAndDelete({ _id: req.params.id, role: "admin" });

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.json({ success: true, message: "Admin deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// DASHBOARD STATS
// =========================
exports.dashboardStats = async (req, res) => {
  try {
    const [totalAdmins, totalTeachers, totalStudents, totalParents] = await Promise.all([
      User.countDocuments({ role: "admin" }),
      User.countDocuments({ role: "teacher" }),
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: "parent" }),
    ]);

    res.json({
      success: true,
      data: {
        totalAdmins,
        totalTeachers,
        totalStudents,
        totalParents,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/superadmin/users — all users across every role
exports.getAllUsers = async (req, res) => {
  try {
    const Admin = require("../model/adminSchema");

    // ── Fetch from both collections in parallel ───────────────────────────
    const [users, admins] = await Promise.all([
      User.find()
        .select("_id fullName email role isVerified createdAt schoolId")
        .lean(),
      Admin.find()
        .select("_id fullName email role isActive createdAt schoolId")
        .lean(),
    ]);

    // ── Normalize admins to match User shape ──────────────────────────────
    const normalizedAdmins = admins.map((a) => ({
      _id:       a._id,
      fullName:  a.fullName,
      email:     a.email,
      role:      "admin",
      isVerified: a.isActive,  // map isActive → isVerified for uniform shape
      createdAt: a.createdAt,
      schoolId:  a.schoolId,
      source:    "admin_collection",
    }));

    // ── Merge: prefer Admin collection entry for admins (avoid duplicates) 
    const adminEmails = new Set(normalizedAdmins.map((a) => a.email));
    const filteredUsers = users.filter(
      (u) => !(u.role === "admin" && adminEmails.has(u.email))
    );

    const all = [...filteredUsers, ...normalizedAdmins];

    return res.status(200).json({ success: true, count: all.length, data: all });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};