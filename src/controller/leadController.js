const Lead = require("../model/leadSchema");
const School = require("../model/schoolSchema");
const { sendEmail } = require("../utils/sendEmail");
const { leadStatusTemplate } = require("../services/crmEmailTemplates");

// =========================
// CREATE LEAD (Admin)
// =========================
exports.createLead = async (req, res) => {
  try {
    const {
      studentName, parentName, email, phone,
      address, applyingForClass, source, notes,
      followUpDate,
    } = req.body;

    if (!studentName || !parentName || !email || !phone || !applyingForClass) {
      return res.status(400).json({ message: "studentName, parentName, email, phone and applyingForClass are required" });
    }

    const adminSchoolId = req.admin.schoolId;

    const lead = await Lead.create({
      schoolId: adminSchoolId,
      studentName,
      parentName,
      email,
      phone,
      address: address || null,
      applyingForClass,
      source: source || "walk-in",
      notes: notes || "",
      followUpDate: followUpDate || null,
      createdBy: req.admin._id,
      assignedTo: req.admin._id,
    });

    // Send confirmation email to parent
    const school = await School.findById(adminSchoolId).select("name");
    await sendEmail({
      to: email,
      subject: `Admission Inquiry Received — ${school.name}`,
      html: leadStatusTemplate({
        parentName,
        studentName,
        status: "inquiry",
        schoolName: school.name,
        notes: notes || "",
      }),
    });

    res.status(201).json({
      success: true,
      message: "Lead created successfully",
      data: lead,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET ALL LEADS (Admin)
// =========================
exports.getAllLeads = async (req, res) => {
  try {
    const adminSchoolId = req.admin.schoolId;
    const { status, source, applyingForClass } = req.query;

    let filter = { schoolId: adminSchoolId };
    if (status) filter.status = status;
    if (source) filter.source = source;
    if (applyingForClass) filter.applyingForClass = applyingForClass;

    const leads = await Lead.find(filter)
      .populate("assignedTo", "fullName email")
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 });

    // Pipeline summary
    const pipeline = {
      inquiry: 0, contacted: 0, applied: 0,
      interview: 0, admitted: 0, rejected: 0, dropped: 0,
    };
    leads.forEach((l) => { if (pipeline[l.status] !== undefined) pipeline[l.status]++; });

    res.status(200).json({
      success: true,
      count: leads.length,
      pipeline,
      data: leads,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET SINGLE LEAD (Admin)
// =========================
exports.getLeadById = async (req, res) => {
  try {
    const lead = await Lead.findOne({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
    })
      .populate("assignedTo", "fullName email")
      .populate("createdBy", "fullName email");

    if (!lead) return res.status(404).json({ message: "Lead not found" });

    res.status(200).json({ success: true, data: lead });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// UPDATE LEAD STATUS (Admin)
// Moves lead through pipeline + sends email
// =========================
exports.updateLeadStatus = async (req, res) => {
  try {
    const { status, notes, followUpDate, assignedTo } = req.body;

    const lead = await Lead.findOne({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
    });

    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const oldStatus = lead.status;

    if (status) lead.status = status;
    if (notes) lead.notes = notes;
    if (followUpDate) lead.followUpDate = followUpDate;
    if (assignedTo) lead.assignedTo = assignedTo;

    await lead.save();

    // ✅ Send email only if status changed
    if (status && status !== oldStatus) {
      const school = await School.findById(req.admin.schoolId).select("name");
      await sendEmail({
        to: lead.email,
        subject: `Admission Update: ${status.toUpperCase()} — ${school.name}`,
        html: leadStatusTemplate({
          parentName: lead.parentName,
          studentName: lead.studentName,
          status,
          schoolName: school.name,
          notes: lead.notes,
        }),
      });
    }

    res.status(200).json({
      success: true,
      message: `Lead updated${status && status !== oldStatus ? ` and email sent for status: ${status}` : ""}`,
      data: lead,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// DELETE LEAD (Admin)
// =========================
exports.deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findOneAndDelete({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
    });

    if (!lead) return res.status(404).json({ message: "Lead not found" });

    res.status(200).json({ success: true, message: "Lead deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET LEADS STATS (Admin Dashboard)
// =========================
exports.getLeadStats = async (req, res) => {
  try {
    const adminSchoolId = req.admin.schoolId;

    const [total, thisMonth, admittedTotal, followUpDue] = await Promise.all([
      Lead.countDocuments({ schoolId: adminSchoolId }),
      Lead.countDocuments({
        schoolId: adminSchoolId,
        createdAt: { $gte: new Date(new Date().setDate(1)) },
      }),
      Lead.countDocuments({ schoolId: adminSchoolId, status: "admitted" }),
      Lead.countDocuments({
        schoolId: adminSchoolId,
        followUpDate: { $lte: new Date() },
        status: { $nin: ["admitted", "rejected", "dropped"] },
      }),
    ]);

    const conversionRate = total > 0 ? ((admittedTotal / total) * 100).toFixed(1) : 0;

    const bySource = await Lead.aggregate([
      { $match: { schoolId: req.admin.schoolId } },
      { $group: { _id: "$source", count: { $sum: 1 } } },
    ]);

    const byClass = await Lead.aggregate([
      { $match: { schoolId: req.admin.schoolId } },
      { $group: { _id: "$applyingForClass", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        total,
        thisMonth,
        admitted: admittedTotal,
        followUpDue,
        conversionRate: `${conversionRate}%`,
        bySource,
        byClass,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};