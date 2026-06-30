const express = require("express");
const router = express.Router();

const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const {
  createDepartment,
  getDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
  getDepartmentPerformance,
} = require("../controller/Departmentcontroller");

router.get("/performance", protectAdmin, getDepartmentPerformance); // before /:id
router.get("/",            protectAdmin, getDepartments);
router.post("/",           protectAdmin, createDepartment);
router.get("/:id",         protectAdmin, getDepartmentById);
router.put("/:id",         protectAdmin, updateDepartment);
router.delete("/:id",      protectAdmin, deleteDepartment);

module.exports = router;