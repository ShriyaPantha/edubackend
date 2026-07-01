const SibApiV3Sdk = require("sib-api-v3-sdk");

const defaultClient = SibApiV3Sdk.ApiClient.instance;
defaultClient.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// =========================
// SEND EMAIL
// =========================
exports.sendEmail = async ({ to, subject, html }) => {
  try {
    await apiInstance.sendTransacEmail({
      sender: { email: process.env.EMAIL_USER, name: "School System" },
      to: [{ email: to }],
      subject,
      htmlContent: html,
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
      <div style="background: #1a73e8; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
        <h2 style="color: white; margin: 0;">📚 ${schoolName}</h2>
      </div>
      <div style="padding: 30px;">
        <h3 style="color: #333;">Dear ${recipientName},</h3>
        <p style="color: #555; font-size: 16px;">
          This is a reminder that a fee payment is due for <strong>${studentName}</strong>.
        </p>
        <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 15px; margin: 20px 0;">
          <table style="width: 100%;">
            <tr>
              <td style="color: #666; padding: 5px 0;"><strong>Fee Title:</strong></td>
              <td style="color: #333;">${feeTitle}</td>
            </tr>
            <tr>
              <td style="color: #666; padding: 5px 0;"><strong>Due Date:</strong></td>
              <td style="color: #dc3545; font-weight: bold;">${dueDate}</td>
            </tr>
            <tr>
              <td style="color: #666; padding: 5px 0;"><strong>Amount Due:</strong></td>
              <td style="color: #dc3545; font-weight: bold;">Rs ${remainingAmount}</td>
            </tr>
          </table>
        </div>
        <p style="color: #555;">Please ensure the payment is made before the due date to avoid any inconvenience.</p>
        <p style="color: #888; font-size: 13px; margin-top: 30px;">
          This is an automated message from ${schoolName}. Please do not reply to this email.
        </p>
      </div>
    </div>
  `;
};

// =========================
// FEE OVERDUE EMAIL TEMPLATE
// =========================
exports.feeOverdueEmailTemplate = ({ recipientName, studentName, feeTitle, dueDate, remainingAmount, schoolName }) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <div style="background: #dc3545; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
        <h2 style="color: white; margin: 0;">⚠️ ${schoolName} — Overdue Fee Alert</h2>
      </div>
      <div style="padding: 30px;">
        <h3 style="color: #333;">Dear ${recipientName},</h3>
        <p style="color: #555; font-size: 16px;">
          The following fee for <strong>${studentName}</strong> is <span style="color: #dc3545; font-weight: bold;">OVERDUE</span>.
        </p>
        <div style="background: #f8d7da; border: 1px solid #dc3545; border-radius: 6px; padding: 15px; margin: 20px 0;">
          <table style="width: 100%;">
            <tr>
              <td style="color: #666; padding: 5px 0;"><strong>Fee Title:</strong></td>
              <td style="color: #333;">${feeTitle}</td>
            </tr>
            <tr>
              <td style="color: #666; padding: 5px 0;"><strong>Was Due On:</strong></td>
              <td style="color: #dc3545; font-weight: bold;">${dueDate}</td>
            </tr>
            <tr>
              <td style="color: #666; padding: 5px 0;"><strong>Amount Due:</strong></td>
              <td style="color: #dc3545; font-weight: bold;">Rs ${remainingAmount}</td>
            </tr>
          </table>
        </div>
        <p style="color: #dc3545; font-weight: bold;">Please make the payment immediately to avoid further action.</p>
        <p style="color: #888; font-size: 13px; margin-top: 30px;">
          This is an automated message from ${schoolName}. Please do not reply to this email.
        </p>
      </div>
    </div>
  `;
};