const express = require("express");
const router = express.Router();
const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const { protect } = require("../middleware/authMiddleware");
const {
  createParent,
  getAllParents,
  getParentById,
  updateParent,
  deleteParent,
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
  getParentDashboard,
  getChildAttendance,
  getChildFees,
} = require("../controller/parentController");

// ── TEMP DEBUG — must be before /:id ─────────────────────────────────────────
router.get("/debug-parent", async (req, res) => {
  try {
    const User = require("../model/userSchema");
    const Parent = require("../model/parentSchema");
    const mongoose = require("mongoose");

    const userId = "6a3faf126e4061a1856dd64b";
    const user = await User.findById(userId).lean();
    const parent = await Parent.findOne({
      userId: new mongoose.Types.ObjectId(userId),
    }).lean();

    res.json({
      userExists: !!user,
      userRole: user?.role ?? null,
      userEmail: user?.email ?? null,
      parentExists: !!parent,
      parentUserId: parent?.userId ?? null,
      parentSchoolId: parent?.schoolId ?? null,
      studentsLinked: parent?.students?.length ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Parent self-access (User token) ──────────────────────────────────────────
router.get("/me",                          protect,      getMyProfile);
router.put("/me",                          protect,      updateMyProfile);
router.put("/me/password",                 protect,      changeMyPassword);
router.get("/dashboard",                   protect,      getParentDashboard);
router.get("/child/:studentId/attendance", protect,      getChildAttendance);
router.get("/child/:studentId/fees",       protect,      getChildFees);

// ── Admin only (Admin token) — /:id must come LAST ───────────────────────────
router.post("/",        protectAdmin, createParent);
router.get("/",         protectAdmin, getAllParents);
router.get("/:id",      protectAdmin, getParentById);
router.put("/:id",      protectAdmin, updateParent);
router.delete("/:id",   protectAdmin, deleteParent);

module.exports = router;