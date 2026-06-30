// schoolRoutes.js
const express = require("express");
const router  = express.Router();

const {
  createSchool,
  getSchools,
  getSchool,
  getSchoolByEmail,
  updateSchool,
  deleteSchool,
} = require("../controller/schoolController"); // ← fix: controllers (plural)

// ⚠️ /by-email MUST be above /:id — otherwise Express reads "by-email" as an id
router.get("/by-email", getSchoolByEmail);

router.get("/",       getSchools);
router.get("/:id",    getSchool);
router.post("/",      createSchool);
router.put("/:id",    updateSchool);
router.delete("/:id", deleteSchool);

module.exports = router;