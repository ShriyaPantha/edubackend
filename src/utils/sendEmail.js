const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

// =========================
// SEND EMAIL
// =========================
exports.sendEmail = async ({ to, subject, html }) => {
  try {
    await resend.emails.send({
      from: "School System <onboarding@resend.dev>",
      to,
      subject,
      html,
    });
    console.log(`✅ Email sent to ${to}`);
  } catch (error) {
    console.error(`❌ Email failed to ${to}:`, error.message);
  }
};

// =========================
// FEE DUE EMAIL TEMPLATE
// =========================
exports.feeDueEmailTemplate = ({ recipientName, studentName, feeTitle, dueDate, remainingAmount, schoolName }) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      ...
    </div>
  `;
};

// =========================
// FEE OVERDUE EMAIL TEMPLATE
// =========================
exports.feeOverdueEmailTemplate = ({ recipientName, studentName, feeTitle, dueDate, remainingAmount, schoolName }) => {
  return `
    ...
  `;
};