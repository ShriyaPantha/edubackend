const express = require("express");
const router = express.Router();
const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const { protect } = require("../middleware/authMiddleware");
const {
  submitFeePayment,
  getPendingFeePayments,
  approveFeePayment,
  rejectFeePayment,
  getPayments,
} = require("../controller/paymentController");

router.post("/fee/submit",                protect,      submitFeePayment);
router.get("/fee/pending",                protectAdmin, getPendingFeePayments);
router.post("/fee/approve/:paymentId",    protectAdmin, approveFeePayment);
router.post("/fee/reject/:paymentId",     protectAdmin, rejectFeePayment);
router.get("/history",                    protectAdmin, getPayments);
router.get("/my-payments",                protect,      getPayments);

module.exports = router;