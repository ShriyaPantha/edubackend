const Complaint = require("../model/complaintSchema");
const Admin = require("../model/adminSchema");
const School = require("../model/schoolSchema");
const Teacher = require("../model/teacherSchema");
const Student = require("../model/studentSchema");
const Parent = require("../model/parentSchema");
const { sendEmail } = require("../utils/sendEmail");
const { complaintStatusTemplate, newComplaintAdminTemplate } = require("../services/crmEmailTemplates");

// Helper — get schoolId from any role
const getSchoolId = async (user) => {
  if (user.role === "student") {
    const s = await Student.findOne({ userId: user._id });
    return s?.schoolId;
  }
  if (user.role === "teacher") {
    const t = await Teacher.findOne({ userId: user._id });
    return t?.schoolId;
  }
  if (user.role === "parent") {
    const p = await Parent.findOne({ userId: user._id });
    return p?.schoolId;
  }
  return null;
};

// =========================
// RAISE COMPLAINT (Student/Parent/Teacher)
// =========================
exports.raiseComplaint = async (req, res) => {
  try {
    const { title, description, category, priority } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: "title and description are required" });
    }

    const schoolId = await getSchoolId(req.user);
    if (!schoolId) return res.status(403).json({ message: "Access denied" });

    const complaint = await Complaint.create({
      schoolId,
      raisedBy: req.user._id,
      raisedByRole: req.user.role,
      title,
      description,
      category: category || "other",
      priority: priority || "medium",
    });

    const school = await School.findById(schoolId).select("name");

    // ✅ Notify all admins of this school
    const admins = await Admin.find({ schoolId }).select("fullName email");
    for (const admin of admins) {
      if (admin.email) {
        await sendEmail({
          to: admin.email,
          subject: `New Complaint [${complaint.ticketNumber}] — ${school.name}`,
          html: newComplaintAdminTemplate({
            adminName: admin.fullName,
            ticketNumber: complaint.ticketNumber,
            title,
            raisedByName: req.user.fullName,
            raisedByRole: req.user.role,
            priority: complaint.priority,
            category: complaint.category,
            schoolName: school.name,
          }),
        });
      }
    }

    // ✅ Confirm to the person who raised it
    await sendEmail({
      to: req.user.email,
      subject: `Complaint Received [${complaint.ticketNumber}] — ${school.name}`,
      html: complaintStatusTemplate({
        recipientName: req.user.fullName,
        ticketNumber: complaint.ticketNumber,
        title,
        status: "open",
        resolution: "",
        schoolName: school.name,
      }),
    });

    res.status(201).json({
      success: true,
      message: `Complaint raised. Ticket: ${complaint.ticketNumber}`,
      data: complaint,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET MY COMPLAINTS (Student/Parent/Teacher)
// =========================
exports.getMyComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({ raisedBy: req.user._id })
      .select("-comments")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: complaints.length,
      data: complaints,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET SINGLE COMPLAINT WITH THREAD
// =========================
exports.getComplaintById = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id)
      .populate("raisedBy", "fullName email role")
      .populate("assignedTo", "fullName email")
      .populate("resolvedBy", "fullName email")
      .populate("comments.author", "fullName role");

    if (!complaint) return res.status(404).json({ message: "Complaint not found" });

    // ✅ Only the person who raised it or admin can view
    const isOwner = complaint.raisedBy._id.toString() === req.user?._id?.toString();
    const isAdmin = !!req.admin;
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.status(200).json({ success: true, data: complaint });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET ALL COMPLAINTS (Admin)
// =========================
exports.getAllComplaints = async (req, res) => {
  try {
    const adminSchoolId = req.admin.schoolId;
    const { status, category, priority, raisedByRole } = req.query;

    let filter = { schoolId: adminSchoolId };
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;
    if (raisedByRole) filter.raisedByRole = raisedByRole;

    const complaints = await Complaint.find(filter)
      .populate("raisedBy", "fullName email")
      .populate("assignedTo", "fullName email")
      .select("-comments")
      .sort({ priority: -1, createdAt: -1 });

    const summary = {
      open: complaints.filter((c) => c.status === "open").length,
      inProgress: complaints.filter((c) => c.status === "in-progress").length,
      resolved: complaints.filter((c) => c.status === "resolved").length,
      closed: complaints.filter((c) => c.status === "closed").length,
    };

    res.status(200).json({
      success: true,
      count: complaints.length,
      summary,
      data: complaints,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// UPDATE COMPLAINT STATUS (Admin)
// =========================
exports.updateComplaintStatus = async (req, res) => {
  try {
    const { status, resolution, assignedTo } = req.body;

    const complaint = await Complaint.findOne({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
    }).populate("raisedBy", "fullName email");

    if (!complaint) return res.status(404).json({ message: "Complaint not found" });

    const oldStatus = complaint.status;

    if (status) complaint.status = status;
    if (resolution) complaint.resolution = resolution;
    if (assignedTo) complaint.assignedTo = assignedTo;

    // ✅ Mark resolved details
    if (status === "resolved" || status === "closed") {
      complaint.resolvedAt = new Date();
      complaint.resolvedBy = req.admin._id;
    }

    await complaint.save();

    // ✅ Email the person who raised it if status changed
    if (status && status !== oldStatus && complaint.raisedBy?.email) {
      const school = await School.findById(req.admin.schoolId).select("name");
      await sendEmail({
        to: complaint.raisedBy.email,
        subject: `Complaint Update [${complaint.ticketNumber}] — ${school.name}`,
        html: complaintStatusTemplate({
          recipientName: complaint.raisedBy.fullName,
          ticketNumber: complaint.ticketNumber,
          title: complaint.title,
          status,
          resolution: resolution || complaint.resolution,
          schoolName: school.name,
        }),
      });
    }

    res.status(200).json({
      success: true,
      message: `Complaint updated to "${status}"`,
      data: complaint,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// ADD COMMENT TO THREAD
// Both admin and the person who raised can comment
// =========================
exports.addComment = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ message: "message is required" });

    const complaint = await Complaint.findById(req.params.id)
      .populate("raisedBy", "fullName email");

    if (!complaint) return res.status(404).json({ message: "Complaint not found" });

    // ✅ Access check
    const isOwner = complaint.raisedBy._id.toString() === req.user?._id?.toString();
    const isAdmin = !!req.admin;
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "Access denied" });
    }

    const authorId = req.admin ? req.admin._id : req.user._id;
    const authorRole = req.admin ? "admin" : req.user.role;

    complaint.comments.push({
      author: authorId,
      authorRole,
      message,
    });

    // ✅ Auto move to in-progress when admin replies
    if (isAdmin && complaint.status === "open") {
      complaint.status = "in-progress";
    }

    await complaint.save();

    // ✅ Notify the other party
    const school = await School.findById(complaint.schoolId).select("name");

    if (isAdmin && complaint.raisedBy?.email) {
      // Admin replied — notify the person who raised it
      await sendEmail({
        to: complaint.raisedBy.email,
        subject: `New Reply on [${complaint.ticketNumber}] — ${school.name}`,
        html: complaintStatusTemplate({
          recipientName: complaint.raisedBy.fullName,
          ticketNumber: complaint.ticketNumber,
          title: complaint.title,
          status: complaint.status,
          resolution: `Admin replied: ${message}`,
          schoolName: school.name,
        }),
      });
    } else if (isOwner) {
      // User replied — notify assigned admin
      if (complaint.assignedTo) {
        const admin = await Admin.findById(complaint.assignedTo).select("email fullName");
        if (admin?.email) {
          await sendEmail({
            to: admin.email,
            subject: `New Reply on [${complaint.ticketNumber}] — ${school.name}`,
            html: newComplaintAdminTemplate({
              adminName: admin.fullName,
              ticketNumber: complaint.ticketNumber,
              title: `Reply on: ${complaint.title}`,
              raisedByName: complaint.raisedBy.fullName,
              raisedByRole: complaint.raisedByRole,
              priority: complaint.priority,
              category: complaint.category,
              schoolName: school.name,
            }),
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      message: "Comment added",
      data: complaint.comments[complaint.comments.length - 1],
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// DELETE COMPLAINT (Admin)
// =========================
exports.deleteComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findOneAndDelete({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
    });

    if (!complaint) return res.status(404).json({ message: "Complaint not found" });

    res.status(200).json({ success: true, message: "Complaint deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};