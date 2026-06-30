const express  = require("express");
const router   = express.Router();
const { protect ,protectSuperAdmin}       = require("../middleware/authMiddleware");

const {
  seedPlans,
  getPlans,
  requestSubscription,
  getSubscriptionRequests,
  approveSubscription,
  rejectSubscription,
  getSubscription,
  getAllSubscriptions,
  cancelSubscription,
} = require("../controller/subscriptionController");

// ── Public ───────────────────────────────────────────────────────────────────
router.get("/plans", getPlans);

// ── School / logged-in user ──────────────────────────────────────────────────
router.post("/request",            protect, requestSubscription);
router.get("/school/:schoolId",    protect, getSubscription);    

// ── Superadmin only ──────────────────────────────────────────────────────────
router.get("/request", protectSuperAdmin, getSubscriptionRequests); 
router.get("/all", protectSuperAdmin, getAllSubscriptions);        
router.post("/approve/:subscriptionId", protectSuperAdmin, approveSubscription);
router.post("/reject/:subscriptionId",  protectSuperAdmin, rejectSubscription);
router.post("/cancel/:schoolId", protectSuperAdmin, cancelSubscription);

// ── Dev/seed (protect in production) ────────────────────────────────────────
router.post("/seed-plans", seedPlans);

module.exports = router;