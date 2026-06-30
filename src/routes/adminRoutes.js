const express = require("express");
const router = express.Router();

const {
  createAdmin,
  loginAdmin,
  getAdmins,
  getAdminById,
  updateAdmin,
  deleteAdmin,
  assignSchool,
} = require("../controller/adminController");
const School = require("../model/schoolSchema");

const checkPlanLimit = require("../middleware/checkPlanLimit");
const { protectSuperAdmin } = require("../middleware/adminAuthMiddleware");
const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const Admin = require("../model/adminSchema"); 

// ── Public ────────────────────────────────────────────────────────────────────

router.post("/login", loginAdmin);  // public

// ── these should have ONLY protectSuperAdmin, nothing else ──
router.post("/",           protectSuperAdmin, createAdmin);
router.get("/",            protectSuperAdmin, getAdmins);
router.put("/:id",         protectSuperAdmin, updateAdmin);
router.delete("/:id",      protectSuperAdmin, deleteAdmin);
router.patch("/:id/assign-school", protectSuperAdmin, assignSchool);

router.get("/list", protectAdmin, async (req, res) => {
  try {
    const admins = await Admin.find({ schoolId: req.admin.schoolId })
      .select("fullName email employeeId isActive _id");
    res.json({ success: true, data: admins });
  } catch (e) { res.status(500).json({ message: e.message }); }
});


// Admin: get + update own school
router.get("/my-school", protectAdmin, async (req, res) => {
  try {
    const school = await School.findById(req.admin.schoolId);
    if (!school) return res.status(404).json({ message: "School not found" });
    res.json({ success: true, data: school });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put("/my-school", protectAdmin, async (req, res) => {
  try {
    const { name, email, phone, address, academicYear } = req.body;
    const school = await School.findById(req.admin.schoolId);
    if (!school) return res.status(404).json({ message: "School not found" });
    if (name) school.name = name;
    if (email) school.email = email;
    if (phone) school.phone = phone;
    if (address) school.address = address;
    if (academicYear) school.academicYear = academicYear;
    await school.save();
    res.json({ success: true, data: school });
  } catch (e) { res.status(500).json({ message: e.message }); }
});
router.get("/:id",         protectSuperAdmin, getAdminById);

module.exports = router;