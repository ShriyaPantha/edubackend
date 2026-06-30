const School = require("../model/schoolSchema");
const User = require("../model/userSchema");

// =========================
// CREATE SCHOOL
// =========================
exports.createSchool = async (req, res) => {
  try {
    const { name, address, phone, email } = req.body;

    if (!name || !address || !phone || !email) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingSchool = await School.findOne({ email });
    if (existingSchool) {
      return res.status(400).json({ message: "School already exists" });
    }

    const school = await School.create({ name, address, phone, email });

    res.status(201).json({
      success: true,
      message: "School created successfully",
      data: school,  // ✅ _id is here — use this as schoolId
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// schoolController.js

exports.getSchools = async (req, res) => {
  try {
    const Admin = require("../model/adminSchema");
    const schools = await School.find()
      .populate("activePlan")  // ← add this
      .lean();

    const schoolsWithAdmins = await Promise.all(
      schools.map(async (school) => {
        const admins = await Admin.find({ schoolId: school._id })
          .select("fullName email phone isActive createdAt")
          .lean();
        return { ...school, admins };
      })
    );

    res.status(200).json({ success: true, count: schoolsWithAdmins.length, data: schoolsWithAdmins });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSchool = async (req, res) => {
  try {
    const Admin = require("../model/adminSchema");
    const school = await School.findById(req.params.id)
      .populate("activePlan")  // ← add this
      .lean();

    if (!school) return res.status(404).json({ message: "School not found" });

    const admins = await Admin.find({ schoolId: req.params.id })
      .select("fullName email phone isActive createdAt")
      .lean();

    res.status(200).json({ success: true, data: { ...school, admins } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// UPDATE SCHOOL
// =========================
exports.updateSchool = async (req, res) => {
  try {
    const school = await School.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    res.status(200).json({
      success: true,
      message: "School updated successfully",
      data: school,
    });
    await logAudit({
      action: `School updated: ${school.name}`,
      user: req.user?.fullName ?? "Superadmin",
      userId: req.user?._id,
      role: "superadmin",
      category: "Settings",
      status: "success",
      req,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// DELETE SCHOOL
// =========================
exports.deleteSchool = async (req, res) => {
  try {
    const school = await School.findByIdAndDelete(req.params.id);

    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    await User.updateMany(
      { schoolId: req.params.id },
      { $set: { schoolId: null } }
    );

    res.status(200).json({
      success: true,
      message: "School deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// =========================
// GET SCHOOL BY EMAIL
// =========================
exports.getSchoolByEmail = async (req, res) => {
  try {
    const { email } = req.query; // GET /api/schools/by-email?email=school@gmail.com

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const school = await School.findOne({ email });

    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }

    res.status(200).json({ success: true, data: school });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};