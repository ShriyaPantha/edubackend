const express = require("express");
const router = express.Router();
const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const { protectReceptionist, checkPermission } = require("../middleware/receptionistAuthMiddleware");
const {
  createReceptionist,
  getAllReceptionists,
  getReceptionistById,
  updateReceptionist,
  deleteReceptionist,
  getMyProfile,
  viewStudents,
  viewStudentById,
  viewTeachers,
  viewTeacherById,
  viewParents,
  viewParentById,
  viewAttendance,
} = require("../controller/receptionistController");
const Receptionist = require("../model/receptionistSchema");
// Admin only
router.post("/", protectAdmin, createReceptionist);
router.get("/admin/all", protectAdmin, getAllReceptionists);
router.get("/admin/:id", protectAdmin, getReceptionistById);
router.put("/admin/:id", protectAdmin, updateReceptionist);
router.delete("/admin/:id", protectAdmin, deleteReceptionist);

// Receptionist self
router.get("/me", protectReceptionist, getMyProfile);

// Receptionist view routes (with permission checks)
router.get("/students", protectReceptionist, checkPermission("viewStudents"), viewStudents);
router.get("/students/:id", protectReceptionist, checkPermission("viewStudents"), viewStudentById);
router.get("/teachers", protectReceptionist, checkPermission("viewTeachers"), viewTeachers);
router.get("/teachers/:id", protectReceptionist, checkPermission("viewTeachers"), viewTeacherById);
router.get("/parents", protectReceptionist, checkPermission("viewParents"), viewParents);
router.get("/parents/:id", protectReceptionist, checkPermission("viewParents"), viewParentById);
router.get("/attendance", protectReceptionist, checkPermission("viewAttendance"), viewAttendance);
router.get("/list", protectAdmin, async (req, res) => {
  try {
    const recs = await Receptionist.find({ schoolId: req.admin.schoolId })
      .populate("userId", "fullName email");
    res.json({ success: true, data: recs });
  } catch (e) { res.status(500).json({ message: e.message }); }
});
module.exports = router;