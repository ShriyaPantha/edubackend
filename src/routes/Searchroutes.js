const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware"); // adjust path to match your project
const { globalSearch } = require("../controller/Searchcontroller");

// Mount this under your existing parent router, e.g.:
//   app.use("/api/parent", parentRoutes);
// where parentRoutes includes: router.get("/search", protect, globalSearch);
// Kept as a standalone router here so you can mount it either way.
router.get("/search", protect, globalSearch);

module.exports = router;