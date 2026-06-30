const express = require("express");
const router = express.Router();

const {
  getStatCards,
  getStudentGrowth,
  getAttendanceOverview,
  getNotificationAlerts,
  getRecentActivities,
  getUpcomingExams,
  getDepartmentPerformance,
  getAdmissionsOverview,
  getTeacherOverview,
  getFeeCollection,
  getParentsOverview,
} = require("../controller/Dashboardcontroller");

const { authorizeRoles } = require("../middleware/roleMiddleware"); // adjust path if different
const { protect } = require("../middleware/authMiddleware"); // adjust path if different

router.use(protect, authorizeRoles("admin"));

router.get("/stats", getStatCards);
router.get("/growth", getStudentGrowth);
router.get("/attendance-overview", getAttendanceOverview);
router.get("/notifications", getNotificationAlerts);
router.get("/activities", getRecentActivities);
router.get("/exams", getUpcomingExams);
router.get("/departments", getDepartmentPerformance);
router.get("/admissions-overview", getAdmissionsOverview);
router.get("/teacher-overview", getTeacherOverview);
router.get("/fee-collection", getFeeCollection);
router.get("/parents-overview", getParentsOverview);

module.exports = router;