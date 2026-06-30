// Lead status changed
exports.leadStatusTemplate = ({ parentName, studentName, status, schoolName, notes }) => {
  const statusColors = {
    inquiry: "#6c757d",
    contacted: "#17a2b8",
    applied: "#007bff",
    interview: "#fd7e14",
    admitted: "#28a745",
    rejected: "#dc3545",
    dropped: "#6c757d",
  };

  const statusMessages = {
    inquiry: "We have received your inquiry and will contact you shortly.",
    contacted: "Our admissions team has reviewed your inquiry and will be in touch.",
    applied: "Your application has been received and is under review.",
    interview: "Congratulations! You have been shortlisted for an interview. We will contact you with details.",
    admitted: `🎉 Congratulations! ${studentName} has been admitted to ${schoolName}.`,
    rejected: `We regret to inform you that ${studentName}'s application was not successful at this time.`,
    dropped: "Your inquiry has been closed. Feel free to contact us again in the future.",
  };

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;">
      <div style="background:${statusColors[status] || "#1a73e8"};padding:20px;border-radius:8px 8px 0 0;text-align:center;">
        <h2 style="color:white;margin:0;">📋 Admission Update — ${schoolName}</h2>
      </div>
      <div style="padding:30px;">
        <p>Dear <strong>${parentName}</strong>,</p>
        <p>${statusMessages[status] || "Your application status has been updated."}</p>
        <div style="background:#f8f9fa;border-radius:6px;padding:15px;margin:15px 0;">
          <strong>Student Name:</strong> ${studentName}<br/>
          <strong>Status:</strong> <span style="color:${statusColors[status]};font-weight:bold;text-transform:uppercase;">${status}</span><br/>
          ${notes ? `<strong>Note:</strong> ${notes}` : ""}
        </div>
        <p style="color:#555;">For any queries please contact the school admissions office.</p>
        <p style="color:#888;font-size:12px;">This is an automated message from ${schoolName}.</p>
      </div>
    </div>`;
};

// Complaint status changed
exports.complaintStatusTemplate = ({ recipientName, ticketNumber, title, status, resolution, schoolName }) => {
  const statusColors = {
    open: "#17a2b8",
    "in-progress": "#fd7e14",
    resolved: "#28a745",
    closed: "#6c757d",
    rejected: "#dc3545",
  };

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;">
      <div style="background:${statusColors[status] || "#1a73e8"};padding:20px;border-radius:8px 8px 0 0;text-align:center;">
        <h2 style="color:white;margin:0;">🎫 Complaint Update — ${schoolName}</h2>
      </div>
      <div style="padding:30px;">
        <p>Dear <strong>${recipientName}</strong>,</p>
        <p>Your complaint ticket has been updated.</p>
        <div style="background:#f8f9fa;border-radius:6px;padding:15px;margin:15px 0;">
          <strong>Ticket:</strong> ${ticketNumber}<br/>
          <strong>Title:</strong> ${title}<br/>
          <strong>Status:</strong> <span style="color:${statusColors[status]};font-weight:bold;text-transform:uppercase;">${status}</span><br/>
          ${resolution ? `<br/><strong>Resolution:</strong><br/>${resolution}` : ""}
        </div>
        <p style="color:#555;">Login to the portal to view full details or add a comment.</p>
        <p style="color:#888;font-size:12px;">This is an automated message from ${schoolName}.</p>
      </div>
    </div>`;
};

// New complaint raised — notify admin
exports.newComplaintAdminTemplate = ({ adminName, ticketNumber, title, raisedByName, raisedByRole, priority, category, schoolName }) => {
  const priorityColors = {
    low: "#28a745",
    medium: "#fd7e14",
    high: "#dc3545",
    urgent: "#721c24",
  };

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;">
      <div style="background:#dc3545;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
        <h2 style="color:white;margin:0;">🎫 New Complaint — ${schoolName}</h2>
      </div>
      <div style="padding:30px;">
        <p>Dear <strong>${adminName}</strong>,</p>
        <p>A new complaint has been raised and requires your attention.</p>
        <div style="background:#f8f9fa;border-radius:6px;padding:15px;margin:15px 0;">
          <strong>Ticket:</strong> ${ticketNumber}<br/>
          <strong>Title:</strong> ${title}<br/>
          <strong>Raised By:</strong> ${raisedByName} (${raisedByRole})<br/>
          <strong>Category:</strong> ${category}<br/>
          <strong>Priority:</strong> <span style="color:${priorityColors[priority]};font-weight:bold;text-transform:uppercase;">${priority}</span>
        </div>
        <p style="color:#555;">Please login to the admin portal to review and respond.</p>
        <p style="color:#888;font-size:12px;">This is an automated message from ${schoolName}.</p>
      </div>
    </div>`;
};