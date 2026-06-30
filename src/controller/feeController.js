const Fee = require("../model/feeSchema");
const Student = require("../model/studentSchema");
const User = require("../model/userSchema");
const School = require("../model/schoolSchema");
const Notification = require("../model/notificationSchema");
const { sendEmail } = require("../utils/sendEmail");

// =========================
// CREATE FEE (Admin only)
// =========================
exports.createFee = async (req, res) => {
  try {
    const { studentId, title, description, totalAmount, dueDate, notifyWho } = req.body;

    if (!studentId || !title || !totalAmount || !dueDate) {
      return res.status(400).json({ message: "studentId, title, totalAmount and dueDate are required" });
    }

    // ✅ Validate notifyWho — defaults to "both" if not provided
    const validOptions = ["student", "parent", "both", "none"];
    const notifyTarget = notifyWho && validOptions.includes(notifyWho) ? notifyWho : "both";

    const adminSchoolId = req.admin.schoolId;

    // Make sure student belongs to this school
    const student = await Student.findOne({ _id: studentId, schoolId: adminSchoolId })
      .populate("userId", "fullName email");

    if (!student) {
      return res.status(404).json({ message: "Student not found in your school" });
    }

    const fee = await Fee.create({
      studentId,
      schoolId: adminSchoolId,
      createdBy: req.admin._id,
      title,
      description: description || "",
      totalAmount,
      remainingAmount: totalAmount,
      dueDate,
    });

    const school = await School.findById(adminSchoolId).select("name");

    const dueDateFormatted = new Date(dueDate).toLocaleDateString("en-NP", {
      year: "numeric", month: "long", day: "numeric",
    });

    const notifyTitle = `New Fee Added: ${title}`;
    let notifiedCount = 0;

    // ================================
    // NOTIFY STUDENT — only if notifyTarget is "student" or "both"
    // ================================
    if (notifyTarget === "student" || notifyTarget === "both") {
      await Notification.create({
        recipient: student.userId._id,
        schoolId: adminSchoolId,
        title: notifyTitle,
        message: `A new fee "${title}" of Rs ${totalAmount} has been added. Due date: ${dueDateFormatted}.`,
        type: "fee",
        refId: fee._id,
        refModel: "Fee",
      });

      if (student.userId.email) {
        await sendEmail({
          to: student.userId.email,
          subject: `${school.name} — ${notifyTitle}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;">
              <div style="background:#1a73e8;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
                <h2 style="color:white;margin:0;">💰 New Fee — ${school.name}</h2>
              </div>
              <div style="padding:30px;">
                <p>Dear <strong>${student.userId.fullName}</strong>,</p>
                <p>A new fee has been added to your account.</p>
                <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:15px;margin:15px 0;">
                  <strong>Fee Title:</strong> ${title}<br/>
                  <strong>Amount:</strong> Rs ${totalAmount}<br/>
                  <strong>Due Date:</strong> <span style="color:#dc3545;font-weight:bold;">${dueDateFormatted}</span><br/>
                  ${description ? `<strong>Description:</strong> ${description}` : ""}
                </div>
                <p style="color:#555;">Please ensure payment before the due date.</p>
                <p style="color:#888;font-size:12px;">This is an automated message from ${school.name}.</p>
              </div>
            </div>`,
        });
      }
      notifiedCount++;
    }

    // ================================
    // NOTIFY PARENT — only if notifyTarget is "parent" or "both", and parentId exists
    // ================================
    if ((notifyTarget === "parent" || notifyTarget === "both") && student.parentId) {
      const parent = await User.findById(student.parentId).select("fullName email");

      if (parent) {
        await Notification.create({
          recipient: parent._id,
          schoolId: adminSchoolId,
          title: notifyTitle,
          message: `A new fee "${title}" of Rs ${totalAmount} has been added for ${student.userId.fullName}. Due date: ${dueDateFormatted}.`,
          type: "fee",
          refId: fee._id,
          refModel: "Fee",
        });

        if (parent.email) {
          await sendEmail({
            to: parent.email,
            subject: `${school.name} — ${notifyTitle}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;">
                <div style="background:#1a73e8;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
                  <h2 style="color:white;margin:0;">💰 New Fee — ${school.name}</h2>
                </div>
                <div style="padding:30px;">
                  <p>Dear <strong>${parent.fullName}</strong>,</p>
                  <p>A new fee has been added for your child <strong>${student.userId.fullName}</strong>.</p>
                  <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:15px;margin:15px 0;">
                    <strong>Fee Title:</strong> ${title}<br/>
                    <strong>Amount:</strong> Rs ${totalAmount}<br/>
                    <strong>Due Date:</strong> <span style="color:#dc3545;font-weight:bold;">${dueDateFormatted}</span><br/>
                    ${description ? `<strong>Description:</strong> ${description}` : ""}
                  </div>
                  <p style="color:#555;">Please ensure payment is made before the due date.</p>
                  <p style="color:#888;font-size:12px;">This is an automated message from ${school.name}.</p>
                </div>
              </div>`,
          });
        }
        notifiedCount++;
      }
    } else if (notifyTarget === "parent" && !student.parentId) {
      console.log(`⚠️ notifyWho="parent" requested but no parent linked for student ${student._id}`);
    }

    res.status(201).json({
      success: true,
      message: `Fee created successfully. Notified: ${notifyTarget} (${notifiedCount} recipient${notifiedCount !== 1 ? "s" : ""})`,
      notifiedTarget: notifyTarget,
      data: fee,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// GET ALL FEES (Admin only)
// =========================
exports.getAllFees = async (req, res) => {
  try {
    const adminSchoolId = req.admin.schoolId;
    const { status } = req.query;

    let filter = { schoolId: adminSchoolId };
    if (status) filter.status = status;

    const fees = await Fee.find(filter)
      .populate("studentId", "admissionNumber rollNumber class section")
      .populate({ path: "studentId", populate: { path: "userId", select: "fullName email" } })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: fees.length,
      data: fees,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// GET STUDENT FEES
// =========================
exports.getStudentFees = async (req, res) => {
  try {
    const fees = await Fee.find({ studentId: req.params.studentId })
      .sort({ dueDate: 1 });

    const summary = {
      total: fees.length,
      pending: fees.filter((f) => f.status === "pending").length,
      partial: fees.filter((f) => f.status === "partial").length,
      paid: fees.filter((f) => f.status === "paid").length,
      totalDue: fees.reduce((sum, f) => sum + f.remainingAmount, 0),
    };

    res.status(200).json({
      success: true,
      summary,
      data: fees,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// GET SINGLE FEE
// =========================
exports.getFeeById = async (req, res) => {
  try {
    const fee = await Fee.findById(req.params.id)
      .populate("studentId", "admissionNumber class section");

    if (!fee) {
      return res.status(404).json({ message: "Fee not found" });
    }

    res.status(200).json({ success: true, data: fee });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// UPDATE FEE (Admin only)
// =========================
exports.updateFee = async (req, res) => {
  try {
    const adminSchoolId = req.admin.schoolId;

    const fee = await Fee.findOne({ _id: req.params.id, schoolId: adminSchoolId });
    if (!fee) {
      return res.status(404).json({ message: "Fee not found" });
    }

    const { title, description, totalAmount, dueDate } = req.body;
    if (title) fee.title = title;
    if (description) fee.description = description;
    if (dueDate) fee.dueDate = dueDate;
    if (totalAmount) {
      fee.totalAmount = totalAmount;
      fee.remainingAmount = totalAmount - fee.paidAmount;
    }

    await fee.save();

    res.status(200).json({
      success: true,
      message: "Fee updated successfully",
      data: fee,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================
// DELETE FEE (Admin only)
// =========================
exports.deleteFee = async (req, res) => {
  try {
    const adminSchoolId = req.admin.schoolId;

    const fee = await Fee.findOneAndDelete({ _id: req.params.id, schoolId: adminSchoolId });
    if (!fee) {
      return res.status(404).json({ message: "Fee not found" });
    }

    res.status(200).json({
      success: true,
      message: "Fee deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};