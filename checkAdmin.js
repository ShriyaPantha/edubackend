// Run this as a one-time script: node checkAdmin.js
require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("./src/model/adminSchema");

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const admin = await Admin.findById("6a35f83512959e30c246377e");
  console.log("Admin found:", admin ? "YES" : "NO");
  if (admin) {
    console.log("Email:", admin.email);
    console.log("isActive:", admin.isActive);
    console.log("schoolId:", admin.schoolId);
  }
  process.exit(0);
});