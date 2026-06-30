const express = require("express");
const router = express.Router();

const {
  getOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization,
} = require("../controller/organizationController");

router.get("/", getOrganizations);
router.post("/", createOrganization);
router.put("/:id", updateOrganization);
router.delete("/:id", deleteOrganization);

module.exports = router;