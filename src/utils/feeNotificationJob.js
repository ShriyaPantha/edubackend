const cron = require("node-cron");
const Fee = require("../model/feeSchema");
const Student = require("../model/studentSchema");
const User = require("../model/userSchema");
const School = require("../model/schoolSchema");
const Notification = require("../model/notificationSchema");
const { sendEmail, feeDueEmailTemplate, feeOverdueEmailTemplate } = require("../utils/sendEmail");

// =========================
// CORE FUNCTION
// Send notifications for due/overdue fees
// =========================


const sendFeeNotifications = async () => {
  try {
    console.log("🔔 Running fee notification job...", new Date().toLocaleString());

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);

    const oneDayFromNow = new Date(today);
    oneDayFromNow.setDate(today.getDate() + 1);

    // Find fees due in 3 days (reminder)
    const dueSoonFees = await Fee.find({
      status: { $in: ["pending", "partial"] },
      dueDate: {
        $gte: oneDayFromNow,
        $lte: threeDaysFromNow,
      },
    });

    // Find fees due TODAY
    const dueTodayFees = await Fee.find({
      status: { $in: ["pending", "partial"] },
      dueDate: {
        $gte: today,
        $lt: oneDayFromNow,
      },
    });

    // Find OVERDUE fees (past due date, not paid)
    const overdueFees = await Fee.find({
      status: { $in: ["pending", "partial"] },
      dueDate: { $lt: today },
    });

    const allFees = [
      ...dueSoonFees.map((f) => ({ fee: f, type: "reminder" })),
      ...dueTodayFees.map((f) => ({ fee: f, type: "due_today" })),
      ...overdueFees.map((f) => ({ fee: f, type: "overdue" })),
    ];

    console.log(`📋 Found: ${dueSoonFees.length} due soon, ${dueTodayFees.length} due today, ${overdueFees.length} overdue`);

    for (const { fee, type } of allFees) {
      try {
        // Get student with user info
        const student = await Student.findById(fee.studentId)
          .populate("userId", "fullName email");

        if (!student || !student.userId) continue;

        // Get school name
        const school = await School.findById(fee.schoolId).select("name");
        const schoolName = school?.name || "School";

        const dueDateFormatted = new Date(fee.dueDate).toLocaleDateString("en-NP", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        // Titles based on type
        const titles = {
          reminder: "Fee Due in 3 Days",
          due_today: "Fee Due Today",
          overdue: "Fee Overdue — Action Required",
        };

        const messages = {
          reminder: `Your fee "${fee.title}" of Rs ${fee.remainingAmount} is due on ${dueDateFormatted}.`,
          due_today: `Your fee "${fee.title}" of Rs ${fee.remainingAmount} is due TODAY.`,
          overdue: `Your fee "${fee.title}" of Rs ${fee.remainingAmount} was due on ${dueDateFormatted} and is now OVERDUE.`,
        };

        // ================================
        // NOTIFY STUDENT
        // ================================
        await Notification.create({
          recipient: student.userId._id,
          schoolId: fee.schoolId,
          title: titles[type],
          message: messages[type],
          type: "fee",
          refId: fee._id,
          refModel: "Fee",
        });

        // Send email to student
        if (student.userId.email) {
          const isOverdue = type === "overdue";
          const html = isOverdue
            ? feeOverdueEmailTemplate({
                recipientName: student.userId.fullName,
                studentName: student.userId.fullName,
                feeTitle: fee.title,
                dueDate: dueDateFormatted,
                remainingAmount: fee.remainingAmount,
                schoolName,
              })
            : feeDueEmailTemplate({
                recipientName: student.userId.fullName,
                studentName: student.userId.fullName,
                feeTitle: fee.title,
                dueDate: dueDateFormatted,
                remainingAmount: fee.remainingAmount,
                schoolName,
              });

          await sendEmail({
            to: student.userId.email,
            subject: `${schoolName} — ${titles[type]}`,
            html,
          });
        }

        // ================================
        // NOTIFY PARENT (if exists)
        // ================================
        if (student.parentId) {
          const parent = await User.findById(student.parentId).select("fullName email");

          if (parent) {
            const parentMessages = {
              reminder: `Your child ${student.userId.fullName}'s fee "${fee.title}" of Rs ${fee.remainingAmount} is due on ${dueDateFormatted}.`,
              due_today: `Your child ${student.userId.fullName}'s fee "${fee.title}" of Rs ${fee.remainingAmount} is due TODAY.`,
              overdue: `Your child ${student.userId.fullName}'s fee "${fee.title}" of Rs ${fee.remainingAmount} was due on ${dueDateFormatted} and is now OVERDUE.`,
            };

            await Notification.create({
              recipient: parent._id,
              schoolId: fee.schoolId,
              title: titles[type],
              message: parentMessages[type],
              type: "fee",
              refId: fee._id,
              refModel: "Fee",
            });

            // Send email to parent
            if (parent.email) {
              const isOverdue = type === "overdue";
              const html = isOverdue
                ? feeOverdueEmailTemplate({
                    recipientName: parent.fullName,
                    studentName: student.userId.fullName,
                    feeTitle: fee.title,
                    dueDate: dueDateFormatted,
                    remainingAmount: fee.remainingAmount,
                    schoolName,
                  })
                : feeDueEmailTemplate({
                    recipientName: parent.fullName,
                    studentName: student.userId.fullName,
                    feeTitle: fee.title,
                    dueDate: dueDateFormatted,
                    remainingAmount: fee.remainingAmount,
                    schoolName,
                  });

              await sendEmail({
                to: parent.email,
                subject: `${schoolName} — ${titles[type]}`,
                html,
              });
            }
          }
        }

        console.log(`✅ Notified: ${student.userId.fullName} — ${titles[type]}`);
      } catch (innerError) {
        console.error(`❌ Error processing fee ${fee._id}:`, innerError.message);
      }
    }

    console.log("✅ Fee notification job completed.");
  } catch (error) {
    console.error("❌ Fee notification job failed:", error.message);
  }
};

// =========================
// SCHEDULE: runs every day at 8:00 AM
// =========================
const startFeeNotificationJob = () => {
  cron.schedule("0 8 * * *", sendFeeNotifications, {
    timezone: "Asia/Kathmandu",
  });
  console.log("📅 Fee notification cron job scheduled — runs daily at 8:00 AM");
};

module.exports = { startFeeNotificationJob, sendFeeNotifications };