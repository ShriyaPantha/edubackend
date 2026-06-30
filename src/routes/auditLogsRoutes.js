// src/routes/auditLogsRoutes.js
const express = require("express");
const router  = express.Router();

const {
  getAuditLogs,
  createAuditLog,
  clearAuditLogs,
} = require("../controller/auditLogsController");

const { protectSuperAdmin } = require("../middleware/adminAuthMiddleware");

router.get("/",    protectSuperAdmin, getAuditLogs);
router.post("/",   protectSuperAdmin, createAuditLog);
router.delete("/", protectSuperAdmin, clearAuditLogs);

module.exports = router;