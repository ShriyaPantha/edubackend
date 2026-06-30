const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { cloudinary } = require("../config/cloudinaryConfig");

// All models to backup
const models = {
  User: require("../model/userSchema"),
  School: require("../model/schoolSchema"),
  Admin: require("../model/adminSchema"),
  Teacher: require("../model/teacherSchema"),
  Student: require("../model/studentSchema"),
  Parent: require("../model/parentSchema"),
  Attendance: require("../model/attendenceSchema"),
  Fee: require("../model/feeSchema"),
  Payment: require("../model/paymentSchema"),
  Exam: require("../model/examSchema"),
  Result: require("../model/resultSchema"),
  Notice: require("../model/noticeSchema"),
  Assignment: require("../model/assignmentSchema"),
  Notification: require("../model/notificationSchema"),
  Timetable: require("../model/timetableSchema"),
  Lead: require("../model/leadSchema"),
  Complaint: require("../model/complaintSchema"),
  Subscription: require("../model/subscriptionSchema"),
};

// =========================
// CREATE BACKUP (Superadmin)
// Exports all collections as JSON zip
// =========================
exports.createBackup = async (req, res) => {
  const backupDir = path.join(__dirname, "../../backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(backupDir, `backup-${timestamp}.zip`);

  try {
    const output = fs.createWriteStream(backupFile);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      console.log(`✅ Backup created: ${archive.pointer()} bytes`);
    });

    archive.on("error", (err) => { throw err; });
    archive.pipe(output);

    // ✅ Export each collection as JSON
    for (const [name, Model] of Object.entries(models)) {
      try {
        const data = await Model.find({}).lean();
        archive.append(JSON.stringify(data, null, 2), { name: `${name}.json` });
        console.log(`📦 Backed up ${name}: ${data.length} records`);
      } catch (err) {
        console.error(`❌ Failed to backup ${name}:`, err.message);
      }
    }

    // ✅ Add metadata
    archive.append(
      JSON.stringify({
        createdAt: new Date(),
        createdBy: req.user?.email || "superadmin",
        totalCollections: Object.keys(models).length,
        version: "1.0",
      }, null, 2),
      { name: "metadata.json" }
    );

    await archive.finalize();

    // ✅ Wait for file to be written
    await new Promise((resolve) => output.on("close", resolve));

    // ✅ Send file to client
    res.download(backupFile, `school-backup-${timestamp}.zip`, (err) => {
      if (err) console.error("Download error:", err);
      // Clean up local file after download
      fs.unlink(backupFile, () => {});
    });
  } catch (err) {
    if (fs.existsSync(backupFile)) fs.unlinkSync(backupFile);
    res.status(500).json({ message: err.message });
  }
};

// =========================
// CREATE SCHOOL BACKUP (Admin)
// Only backs up their school's data
// =========================
exports.createSchoolBackup = async (req, res) => {
  const backupDir = path.join(__dirname, "../../backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const schoolId = req.admin.schoolId;
  const backupFile = path.join(backupDir, `school-backup-${timestamp}.zip`);

  try {
    const output = fs.createWriteStream(backupFile);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(output);

    // ✅ School-specific collections
    const schoolModels = {
      Teacher: models.Teacher,
      Student: models.Student,
      Parent: models.Parent,
      Attendance: models.Attendance,
      Fee: models.Fee,
      Payment: models.Payment,
      Exam: models.Exam,
      Result: models.Result,
      Notice: models.Notice,
      Assignment: models.Assignment,
      Timetable: models.Timetable,
    };

    for (const [name, Model] of Object.entries(schoolModels)) {
      try {
        const data = await Model.find({ schoolId }).lean();
        archive.append(JSON.stringify(data, null, 2), { name: `${name}.json` });
      } catch (err) {
        console.error(`❌ Failed to backup ${name}:`, err.message);
      }
    }

    archive.append(
      JSON.stringify({
        schoolId,
        createdAt: new Date(),
        createdBy: req.admin.email,
      }, null, 2),
      { name: "metadata.json" }
    );

    await archive.finalize();
    await new Promise((resolve) => output.on("close", resolve));

    res.download(backupFile, `school-backup-${timestamp}.zip`, () => {
      fs.unlink(backupFile, () => {});
    });
  } catch (err) {
    if (fs.existsSync(backupFile)) fs.unlinkSync(backupFile);
    res.status(500).json({ message: err.message });
  }
};

// =========================
// RESTORE BACKUP (Superadmin only)
// Upload backup zip → restore all collections
// =========================
exports.restoreBackup = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No backup file uploaded" });
    }

    const backupData = JSON.parse(req.file.buffer.toString("utf-8"));
    const results = { restored: [], failed: [] };

    for (const [name, data] of Object.entries(backupData)) {
      if (name === "metadata") continue;
      if (!models[name]) continue;

      try {
        if (Array.isArray(data) && data.length > 0) {
          // ✅ Use insertMany with ordered:false to skip duplicates
          await models[name].insertMany(data, {
            ordered: false,
            rawResult: true,
          });
          results.restored.push(`${name}: ${data.length} records`);
        }
      } catch (err) {
        // Ignore duplicate key errors
        if (err.code === 11000) {
          results.restored.push(`${name}: skipped duplicates`);
        } else {
          results.failed.push(`${name}: ${err.message}`);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: "Restore completed",
      data: results,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// AUTO BACKUP CRON (Weekly)
// =========================
const cron = require("node-cron");

exports.startBackupCron = () => {
  // ✅ Every Sunday at 2:00 AM
  cron.schedule("0 2 * * 0", async () => {
    console.log("🔄 Running automatic weekly backup...");
    const backupDir = path.join(__dirname, "../../backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(backupDir, `auto-backup-${timestamp}.zip`);

    try {
      const output = fs.createWriteStream(backupFile);
      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(output);

      for (const [name, Model] of Object.entries(models)) {
        const data = await Model.find({}).lean();
        archive.append(JSON.stringify(data, null, 2), { name: `${name}.json` });
      }

      await archive.finalize();
      await new Promise((resolve) => output.on("close", resolve));

      console.log(`✅ Auto backup saved: ${backupFile}`);
    } catch (err) {
      console.error("❌ Auto backup failed:", err.message);
    }
  }, { timezone: "Asia/Kathmandu" });

  console.log("📅 Auto backup cron scheduled — runs every Sunday at 2:00 AM");
};