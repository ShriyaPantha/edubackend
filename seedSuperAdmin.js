const mongoose = require("mongoose");
const User = require("./src/model/userSchema");
require("dotenv").config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  console.log("MongoDB Connected");

  // Delete old broken superadmin
  await User.deleteOne({ email: "super@school.com" });
  console.log("🗑️  Old superadmin deleted");

  // Create fresh one — DO NOT hash manually, schema does it automatically
  await User.create({
    fullName: "Super Admin",
    email: "super@school.com",
    password: "super123",   // ✅ plain text — pre-save hook hashes it once
    role: "superadmin",
    isVerified: true,
  });

  console.log("✅ Superadmin created successfully!");
  console.log("📧 Email:    super@school.com");
  console.log("🔑 Password: super123");
  process.exit();
}).catch(err => {
  console.error("DB Error:", err.message);
  process.exit(1);
});