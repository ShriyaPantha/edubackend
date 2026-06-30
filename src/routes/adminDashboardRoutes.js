const express = require("express");
const router = express.Router();
const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const {
  getAdmissionsOverview,
  getTeacherOverview,
  getFeeCollection,
} = require("../controller/adminDashboardController");

router.get("/admissions-overview", protectAdmin, getAdmissionsOverview);
router.get("/teacher-overview", protectAdmin, getTeacherOverview);
router.get("/fee-collection", protectAdmin, getFeeCollection);

module.exports = router;