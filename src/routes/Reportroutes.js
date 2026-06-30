const express = require("express");
const router = express.Router();
const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const {
  getAcademicReport,
  getFinancialReport,
  getAttendanceReport,
  getSystemReport,
} = require("../controller/Reportcontroller");

router.get("/academic",    protectAdmin, getAcademicReport);
router.get("/financial",   protectAdmin, getFinancialReport);
router.get("/attendance",  protectAdmin, getAttendanceReport);
router.get("/system",      protectAdmin, getSystemReport);

module.exports = router;