const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const express = require("express");
const app = express();
const dotenv = require("dotenv");
dotenv.config();
const cors = require("cors");
const connectDb = require("./src/config/db");

const authRoutes = require("./src/routes/authRoutes");
const organizationRoutes = require(
  "./src/routes/organizationRoutes"
);
const auditRoutes = require("./src/routes/auditLogsRoutes"); 
const studentRoutes = require("./src/routes/studentRoutes");
const attendanceRoutes = require("./src/routes/attendenceRoutes");
const teacherRoutes = require("./src/routes/teacherRoutes");
const parentRoutes = require("./src/routes/parentRoutes");
const notificationRoutes = require("./src/routes/notificationRoutes");
const assignmentRoutes = require("./src/routes/assignmentRoutes");
const feeRoutes = require("./src/routes/feeRoutes");
const paymentRoutes = require("./src/routes/paymentRoutes");
const examRoutes = require("./src/routes/examRoutes");
const noticeRoutes = require("./src/routes/noticeRoutes");
const adminRoutes = require("./src/routes/adminRoutes");
const superAdminRoutes = require("./src/routes/superadminRoutes");
const schoolRoutes = require("./src/routes/schoolRoutes");
const qrAttendanceRoutes = require("./src/routes/qrAttendanceRoutes");
const resultRoutes = require("./src/routes/resultRoutes");
const leadRoutes = require("./src/routes/leadRoutes");
const complaintRoutes = require("./src/routes/complaintRoutes");
const receptionistRoutes = require("./src/routes/receptionistRoutes");
const timetableRoutes = require("./src/routes/timetableRoutes");
const uploadRoutes = require("./src/routes/uploadRoutes");
const subscriptionRoutes = require("./src/routes/subscriptionRoutes");
const backupRoutes = require("./src/routes/backupRoutes");
const payrollRoutes = require("./src/routes/payrollRoutes");
const idCardRoutes = require("./src/routes/idCardRoutes");
const superAdminSettingRoutes = require("./src/routes/superAdminSettingRoutes");
const departmentRoutes = require("./src/routes/Departmentroutes");
const dashboardRoutes = require("./src/routes/Dashboardroutes");
const adminDashboardRoutes = require("./src/routes/adminDashboardRoutes");
const reportRoutes = require("./src/routes/Reportroutes");
const Searchroutes = require("./src/routes/Searchroutes");
const Teachernotificationroutes = require("./src/routes/Teachernotificationroutes");




const { startFeeNotificationJob } = require("./src/utils/feeNotificationJob");
const { startSubscriptionCron } = require("./src/controller/subscriptionController");
const { startBackupCron } = require("./src/controller/backupController");
const { startPayrollCron, startSalaryReminderCron } = require("./src/controller/payrollController");

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin === "http://localhost:5173" || /\.vercel\.app$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  exposedHeaders: ["Content-Disposition"],
}));
// Parse JSON
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use(
  "/api/organizations",
  organizationRoutes
);

app.use("/api/students", studentRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/parents", parentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/fees", feeRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/notices", noticeRoutes);
app.use("/api/superadmin", superAdminRoutes);
app.use("/api/superadmin", superAdminSettingRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/attendance/qr", qrAttendanceRoutes);
app.use("/api/results", resultRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/receptionist", receptionistRoutes);
app.use("/api/timetable", timetableRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/backup", backupRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/id-cards", idCardRoutes);
app.use("/api/admin/departments", departmentRoutes);
app.use("/api/admin/dashboard", dashboardRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/search", Searchroutes);
app.use("/api/Teachernotificationroutes/", Teachernotificationroutes );



//  Crons
// startFeeNotificationJob();
// startSubscriptionCron();
// startBackupCron();
// startPayrollCron();
// startSalaryReminderCron();

// Health check
app.get("/", (req, res) => {
  res.status(200).json({ message: "Server is running successfully 🚀" });
});

const PORT = process.env.PORT || 4000;

const startServer = async () => {
  try {
    await connectDb();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server Error:", error);
  }
};

process.on('uncaughtException', (err) => console.error('UNCAUGHT:', err));
process.on('unhandledRejection', (err) => console.error('UNHANDLED:', err));

startServer();