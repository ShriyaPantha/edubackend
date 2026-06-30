const Notification = require("../model/notificationSchema");
const { sendEmail } = require("../utils/sendEmail");

// =========================
// SEND TO ONE USER
// =========================
exports.notify = async ({ recipient, schoolId, title, message, type, refId, refModel, email, emailHtml }) => {
  try {
    // Save to DB
    await Notification.create({
      recipient,
      schoolId,
      title,
      message,
      type,
      refId: refId || null,
      refModel: refModel || null,
    });

    //  Send email if provided
    if (email && emailHtml) {
      await sendEmail({ to: email, subject: title, html: emailHtml });
    }
  } catch (err) {
    console.error(`❌ Notify error for ${recipient}:`, err.message);
  }
};

// =========================
// SEND TO MULTIPLE USERS
// =========================
exports.notifyMany = async (recipients, { schoolId, title, message, type, refId, refModel }) => {
  try {
    const docs = recipients.map((recipient) => ({
      recipient,
      schoolId,
      title,
      message,
      type,
      refId: refId || null,
      refModel: refModel || null,
    }));

    await Notification.insertMany(docs);
  } catch (err) {
    console.error("❌ NotifyMany error:", err.message);
  }
};

// =========================
// EMAIL TEMPLATES
// =========================
exports.examNotificationTemplate = ({ recipientName, examTitle, className, section, subjects, examDate, schoolName }) => {
  const subjectRows = subjects
    .map(
      (s) => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${s.name}</td>
        <td style="padding:8px;border:1px solid #ddd;">${new Date(s.examDate).toLocaleDateString("en-NP", { year: "numeric", month: "long", day: "numeric" })}</td>
        <td style="padding:8px;border:1px solid #ddd;">${s.examTime || "—"}</td>
        <td style="padding:8px;border:1px solid #ddd;">${s.fullMarks} / ${s.passMarks}</td>
      </tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;">
      <div style="background:#1a73e8;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
        <h2 style="color:white;margin:0;">📝 Exam Schedule — ${schoolName}</h2>
      </div>
      <div style="padding:30px;">
        <p>Dear <strong>${recipientName}</strong>,</p>
        <p>An exam has been scheduled for <strong>Class ${className}${section ? `-${section}` : ""}</strong>.</p>
        <div style="background:#e8f0fe;border-radius:6px;padding:15px;margin:15px 0;">
          <strong>Exam:</strong> ${examTitle}<br/>
          <strong>Starting Date:</strong> ${new Date(examDate).toLocaleDateString("en-NP", { year: "numeric", month: "long", day: "numeric" })}
        </div>
        <table style="width:100%;border-collapse:collapse;margin-top:15px;">
          <thead>
            <tr style="background:#1a73e8;color:white;">
              <th style="padding:8px;text-align:left;">Subject</th>
              <th style="padding:8px;text-align:left;">Date</th>
              <th style="padding:8px;text-align:left;">Time</th>
              <th style="padding:8px;text-align:left;">Full/Pass Marks</th>
            </tr>
          </thead>
          <tbody>${subjectRows}</tbody>
        </table>
        <p style="margin-top:20px;color:#555;">Please ensure proper preparation. Best of luck!</p>
        <p style="color:#888;font-size:12px;">This is an automated message from ${schoolName}.</p>
      </div>
    </div>`;
};

exports.resultNotificationTemplate = ({ recipientName, studentName, examTitle, totalObtained, totalFull, percentage, grade, isPassed, schoolName }) => {
  const color = isPassed ? "#28a745" : "#dc3545";
  const statusText = isPassed ? "PASSED ✅" : "FAILED ❌";

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;">
      <div style="background:${color};padding:20px;border-radius:8px 8px 0 0;text-align:center;">
        <h2 style="color:white;margin:0;">📊 Result Published — ${schoolName}</h2>
      </div>
      <div style="padding:30px;">
        <p>Dear <strong>${recipientName}</strong>,</p>
        <p>The result for <strong>${studentName}</strong> has been published for <strong>${examTitle}</strong>.</p>
        <div style="background:#f8f9fa;border-radius:6px;padding:20px;margin:15px 0;text-align:center;">
          <h2 style="color:${color};margin:0;">${statusText}</h2>
          <table style="width:100%;margin-top:15px;">
            <tr>
              <td style="color:#666;padding:5px 0;"><strong>Marks Obtained:</strong></td>
              <td>${totalObtained} / ${totalFull}</td>
            </tr>
            <tr>
              <td style="color:#666;padding:5px 0;"><strong>Percentage:</strong></td>
              <td>${percentage}%</td>
            </tr>
            <tr>
              <td style="color:#666;padding:5px 0;"><strong>Grade:</strong></td>
              <td><strong>${grade}</strong></td>
            </tr>
          </table>
        </div>
        <p style="color:#555;">Login to the portal for the full detailed report.</p>
        <p style="color:#888;font-size:12px;">This is an automated message from ${schoolName}.</p>
      </div>
    </div>`;
};

exports.noticeEmailTemplate = ({ recipientName, noticeTitle, description, isImportant, publishDate, schoolName }) => {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;">
      <div style="background:${isImportant ? "#dc3545" : "#1a73e8"};padding:20px;border-radius:8px 8px 0 0;text-align:center;">
        <h2 style="color:white;margin:0;">${isImportant ? "🔴 Important Notice" : "📢 Notice"} — ${schoolName}</h2>
      </div>
      <div style="padding:30px;">
        <p>Dear <strong>${recipientName}</strong>,</p>
        ${isImportant ? '<p style="color:#dc3545;font-weight:bold;">⚠️ This is an important notice. Please read carefully.</p>' : ""}
        <div style="background:#f8f9fa;border-radius:6px;padding:20px;margin:15px 0;">
          <h3 style="margin:0 0 10px 0;">${noticeTitle}</h3>
          <p style="color:#555;">${description}</p>
          <small style="color:#888;">Published: ${new Date(publishDate).toLocaleDateString()}</small>
        </div>
        <p style="color:#888;font-size:12px;">This is an automated message from ${schoolName}.</p>
      </div>
    </div>`;
};