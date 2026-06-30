const express = require("express");
const router = express.Router();

const { createAdmin, getAdmins, getAdmin, updateAdmin, deleteAdmin, dashboardStats,getAllUsers } = require("../controller/superAdminController");
const { authorizeRoles } = require("../middleware/roleMiddleware");
const { protect } = require("../middleware/authMiddleware");
const {protectSuperAdmin} = require("../middleware/adminAuthMiddleware")
router.use(protect, authorizeRoles("superadmin"));

router.get("/dashboard-stats", dashboardStats);
router.post("/admins", createAdmin);           
router.get("/admins", getAdmins);              
router.get("/admins/:id", getAdmin);           
router.put("/admins/:id", updateAdmin);        
router.delete("/admins/:id", deleteAdmin);     
router.get("/users", protectSuperAdmin, getAllUsers); // ← add this

module.exports = router;