const express = require("express");
const router = express.Router();
const { protectAdmin } = require("../middleware/adminAuthMiddleware");
const { protect } = require("../middleware/authMiddleware");
const {
  generateStudentIdCard,
  generateBulkIdCards,
  generateMyIdCard,
} = require("../controller/idCardController");

router.use((req, res, next) => {
  console.log("ID CARD ROUTE HIT:", req.method, req.originalUrl);
  next();
});

// Admin
// ?headerColor=%231A73E8&showQrCode=true&showPhoto=true&fields=class,rollNumber,dob
router.get("/student/:id", protectAdmin, generateStudentIdCard);

// ?class=10&section=A&headerColor=%230B8043&fields=class,phone,bloodGroup
router.get("/bulk", protectAdmin, generateBulkIdCards);

// Student self
// ?showQrCode=false&fields=class,dob,guardianName
router.get("/my", protect, generateMyIdCard);

module.exports = router;