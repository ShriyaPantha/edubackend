const express = require("express");
const router = express.Router();
const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const { protect } = require("../middleware/authMiddleware");
const {
  setStaffSalary,
  getSalaryConfigs,
  generatePayroll,
  generateBulkPayroll,
  markAsPaid,
  getAllPayrolls,
  getMyPayslips,
  getPayslipById,
  updatePayroll,
  deletePayroll,
} = require("../controller/payrollController");

//Staff self (User token)
router.get("/my", protect, getMyPayslips);
router.get("/slip/:id", protect, getPayslipById);

//Admin only (Admin token)
router.post("/salary-config", protectAdmin, setStaffSalary);
router.get("/salary-config", protectAdmin, getSalaryConfigs);
router.post("/generate", protectAdmin, generatePayroll);
router.post("/generate-bulk", protectAdmin, generateBulkPayroll);
router.patch("/:id/pay", protectAdmin, markAsPaid);
router.get("/", protectAdmin, getAllPayrolls);
router.put("/:id", protectAdmin, updatePayroll);
router.delete("/:id", protectAdmin, deletePayroll);

module.exports = router;