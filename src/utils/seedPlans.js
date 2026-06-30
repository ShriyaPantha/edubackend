const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
const Plan = require("../model/planSchema");

const plans = [
  {
    name: "basic",
    price: 2000,
    description: "Perfect for small schools",
    isActive: true,
    features: {
      maxStudents: 200, maxTeachers: 15, maxAdmins: 1,
      hasQRAttendance: false, hasOnlinePayment: false, hasCRM: false,
      hasDocumentUpload: false, hasTimetable: true, hasNotifications: true,
      storageGB: 2,
    },
  },
  {
    name: "standard",
    price: 5000,
    description: "For growing schools",
    isActive: true,
    features: {
      maxStudents: 500, maxTeachers: 40, maxAdmins: 3,
      hasQRAttendance: true, hasOnlinePayment: true, hasCRM: false,
      hasDocumentUpload: true, hasTimetable: true, hasNotifications: true,
      storageGB: 10,
    },
  },
  {
    name: "premium",
    price: 10000,
    description: "Full featured for large schools",
    isActive: true,
    features: {
      maxStudents: 99999, maxTeachers: 99999, maxAdmins: 99999,
      hasQRAttendance: true, hasOnlinePayment: true, hasCRM: true,
      hasDocumentUpload: true, hasTimetable: true, hasNotifications: true,
      storageGB: 100,
    },
  },
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    await Plan.deleteMany({});
    console.log("🗑️  Cleared existing plans");

    const inserted = await Plan.insertMany(plans);
    console.log(`🌱 Seeded ${inserted.length} plans:`);
    inserted.forEach((p) => console.log(`   • ${p.name} — Rs ${p.price}/mo`));

    await mongoose.disconnect();
    console.log("✅ Done. DB disconnected.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
  }
};

seed();