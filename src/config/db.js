const mongoose = require("mongoose");

const connectDb = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected");

    // ── Drop stale unique index on subscriptions.schoolId ─────────────────
    // This index was created by an old schema version and causes E11000 errors
    // when schoolId is null. Safe to run on every startup — no-ops if gone.
    try {
      await mongoose.connection.collection("subscriptions").dropIndex("schoolId_1");
      console.log("✅ Dropped stale schoolId_1 index from subscriptions");
    } catch (e) {
      if (e.code === 27) {
        // Code 27 = IndexNotFound — already gone, nothing to do
        console.log("ℹ️  schoolId_1 index already removed");
      } else {
        console.warn("⚠️  Could not drop schoolId_1 index:", e.message);
      }
    }

  } catch (error) {
    console.log("DB Connection Error:", error.message);
    process.exit(1);
  }
};

module.exports = connectDb;