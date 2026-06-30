const express = require("express");
const router = express.Router();
const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const {
  createLead,
  getAllLeads,
  getLeadById,
  updateLeadStatus,
  deleteLead,
  getLeadStats,
} = require("../controller/leadController");

router.use(protectAdmin);

router.get("/stats", getLeadStats);           // GET  /leads/stats
router.post("/", createLead);                 // POST /leads
router.get("/", getAllLeads);                 // GET  /leads?status=inquiry&source=walk-in
router.get("/:id", getLeadById);             // GET  /leads/:id
router.patch("/:id/status", updateLeadStatus); // PATCH /leads/:id/status
router.delete("/:id", deleteLead);           // DELETE /leads/:id

module.exports = router;