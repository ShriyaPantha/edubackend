// utils/emailService.js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // true for port 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  family: 4, // force IPv4 — fixes ENETUNREACH on Render
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

// =========================
// SEND EMAIL
// =========================
exports.sendEmail = async ({ to, subject, html }) => {
  try {
    const info = await transporter.sendMail({
      from: `"School System" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`✅ Email sent to ${to}:`, info.messageId);
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
      <h2 style="color: #333;">Fee Payment Reminder</h2>
      <p>Dear ${recipientName},</p>
      <p>This is a reminder that the fee for <strong>${studentName}</strong> is due.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 0;"><strong>Fee Title:</strong></td>
          <td style="padding: 8px 0;">${feeTitle}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Due Date:</strong></td>
          <td style="padding: 8px 0;">${dueDate}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Amount Due:</strong></td>
          <td style="padding: 8px 0;">${remainingAmount}</td>
        </tr>
      </table>
      <p>Please make the payment before the due date to avoid any inconvenience.</p>
      <p style="margin-top: 24px; color: #777; font-size: 13px;">— ${schoolName}</p>
    </div>
  `;
};

// =========================
// FEE OVERDUE EMAIL TEMPLATE
// =========================
exports.feeOverdueEmailTemplate = ({ recipientName, studentName, feeTitle, dueDate, remainingAmount, schoolName }) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e74c3c; border-radius: 8px;">
      <h2 style="color: #e74c3c;">Fee Payment Overdue</h2>
      <p>Dear ${recipientName},</p>
      <p>The fee for <strong>${studentName}</strong> is now <strong>overdue</strong>. Please make the payment immediately.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px 0;"><strong>Fee Title:</strong></td>
          <td style="padding: 8px 0;">${feeTitle}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Due Date:</strong></td>
          <td style="padding: 8px 0; color: #e74c3c;">${dueDate}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Outstanding Amount:</strong></td>
          <td style="padding: 8px 0;">${remainingAmount}</td>
        </tr>
      </table>
      <p>Kindly clear the dues at the earliest to avoid further action.</p>
      <p style="margin-top: 24px; color: #777; font-size: 13px;">— ${schoolName}</p>
    </div>
  `;
};