const Assignment = require("../model/assignmentSchema");
const AssignmentSubmission = require("../model/assignmentSubmissionSchema ");
const Teacher = require("../model/teacherSchema");
const Student = require("../model/studentSchema");
const User = require("../model/userSchema");
const { sendEmail } = require("../utils/sendEmail");

// ======================
// CREATE ASSIGNMENT
// Teacher creates assignment → emails all students in that class/section
// ======================
exports.createAssignment = async (req, res) => {
  try {
    const { title, description, class: className, section, subject, dueDate, attachment } = req.body;

    if (!title || !description || !className || !section || !subject || !dueDate) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Get teacher from logged-in user
    const teacher = await Teacher.findOne({ userId: req.user._id });
    if (!teacher) {
      return res.status(403).json({ message: "Only teachers can create assignments" });
    }

    const assignment = await Assignment.create({
      title,
      description,
      class: className,
      section,
      subject,
      dueDate,
      attachment: attachment || "",
      teacherId: teacher._id,
      schoolId: teacher.schoolId,
    });

    const assignmentData = await Assignment.findById(assignment._id)
      .populate("teacherId", "employeeId department")
      .populate("schoolId", "name");

    // ── Fetch all active students in this class + section + school ──────────
    const students = await Student.find({
      schoolId: teacher.schoolId,
      class: className,
      section,
      status: "active",
    }).select("email userId");

    // Collect emails — prefer student.email (mirrored), fall back to User.email
    // Build a map of userId → student.email for those without a direct email
    const missingUserIds = students
      .filter((s) => !s.email && s.userId)
      .map((s) => s.userId);

    let userEmailMap = {};
    if (missingUserIds.length > 0) {
      const users = await User.find(
        { _id: { $in: missingUserIds } },
        "email"
      );
      users.forEach((u) => {
        userEmailMap[u._id.toString()] = u.email;
      });
    }

    const schoolName = assignmentData.schoolId?.name ?? "Your School";

    const formattedDueDate = new Date(dueDate).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // ── Send email to each student (fire-and-forget, don't block response) ──
    const emailPromises = students.map(async (student) => {
      const recipientEmail =
        student.email || userEmailMap[student.userId?.toString()] || null;

      if (!recipientEmail) return; // skip if no email found

      try {
        await sendEmail({
          to: recipientEmail,
          subject: `New Assignment: ${title} — ${schoolName}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px;">
              <div style="background:#4f46e5;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
                <h2 style="color:white;margin:0;">📝 New Assignment — ${schoolName}</h2>
              </div>
              <div style="padding:30px;">
                <p style="color:#555;font-size:15px;margin-top:0;">
                  A new assignment has been posted for <strong>Class ${className} – ${section}</strong>.
                </p>

                <div style="background:#f0f4ff;border:1px solid #c7d7ff;border-radius:8px;padding:18px;margin:20px 0;">
                  <table style="width:100%;border-collapse:collapse;">
                    <tr>
                      <td style="color:#666;padding:6px 0;font-size:14px;width:40%;"><strong>Assignment:</strong></td>
                      <td style="color:#1a1a2e;font-size:14px;font-weight:bold;">${title}</td>
                    </tr>
                    <tr>
                      <td style="color:#666;padding:6px 0;font-size:14px;"><strong>Subject:</strong></td>
                      <td style="color:#333;font-size:14px;">${subject}</td>
                    </tr>
                    <tr>
                      <td style="color:#666;padding:6px 0;font-size:14px;"><strong>Class:</strong></td>
                      <td style="color:#333;font-size:14px;">Class ${className} – Section ${section}</td>
                    </tr>
                    <tr>
                      <td style="color:#666;padding:6px 0;font-size:14px;"><strong>Due Date:</strong></td>
                      <td style="color:#dc2626;font-size:14px;font-weight:bold;">📅 ${formattedDueDate}</td>
                    </tr>
                  </table>
                </div>

                ${description ? `
                <div style="background:#f8fafc;border-left:4px solid #4f46e5;border-radius:0 6px 6px 0;padding:14px 16px;margin:16px 0;">
                  <p style="margin:0;color:#444;font-size:13px;font-weight:bold;margin-bottom:6px;">Instructions:</p>
                  <p style="margin:0;color:#555;font-size:13px;line-height:1.6;">${description}</p>
                </div>
                ` : ""}

                <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:12px;margin:16px 0;">
                  <p style="margin:0;color:#795548;font-size:13px;">
                    ⏰ Please submit your assignment before the due date.
                    Late submissions may not be accepted.
                  </p>
                </div>

                <p style="color:#888;font-size:12px;margin-top:28px;">
                  This is an automated notification from ${schoolName}. Please do not reply to this email.
                </p>
              </div>
            </div>
          `,
        });
      } catch (emailErr) {
        // Log but don't fail the whole request
        console.error(`[createAssignment] Email failed for ${recipientEmail}:`, emailErr.message);
      }
    });

    // Run all emails in parallel, don't await — respond immediately
    Promise.allSettled(emailPromises).then((results) => {
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        console.warn(`[createAssignment] ${failed}/${students.length} notification emails failed`);
      } else {
        console.log(`[createAssignment] Notified ${students.length} students in Class ${className}-${section}`);
      }
    });

    res.status(201).json({
      success: true,
      message: `Assignment created. Notifying ${students.length} student(s) in Class ${className}–${section}.`,
      data: assignmentData,
    });
  } catch (error) {
    console.error("[createAssignment]", error);
    res.status(500).json({ message: error.message });
  }
};
// ======================
// GET ALL ASSIGNMENTS
// Teacher sees only their own assignments
// Admin sees all assignments in their school
// ======================
exports.getAllAssignments = async (req, res) => {
  try {
    let filter = {};
 
    if (req.admin) {
      // Admin sees all assignments in their school
      filter.schoolId = req.admin.schoolId;
 
    } else if (req.user) {
      // Determine role by looking up profile docs
      const teacher = await Teacher.findOne({ userId: req.user._id });
 
      if (teacher) {
        // Teacher sees only their own
        filter.teacherId = teacher._id;
        filter.schoolId  = teacher.schoolId;
 
      } else {
        // Try parent
        const Parent = require("../model/parentSchema");
        const parent = await Parent.findOne({ userId: req.user._id })
          .populate("students", "class section schoolId");
 
        if (parent && parent.students.length > 0) {
          // Build OR filter — one condition per child
          const classFilters = parent.students.map((s) => ({
            class:   s.class,
            section: s.section,
          }));
 
          filter.schoolId = parent.schoolId;
          filter.$or      = classFilters;
          filter.status   = "active"; // parents only see active assignments
 
        } else {
          // Fallback: student view
          const student = await Student.findOne({ userId: req.user._id });
          if (!student) {
            return res.status(403).json({ message: "Access denied" });
          }
          filter.class    = student.class;
          filter.section  = student.section;
          filter.schoolId = student.schoolId;
          filter.status   = "active";
        }
      }
    }
 
    const assignments = await Assignment.find(filter)
      .populate("teacherId", "employeeId department")
      .populate("schoolId", "name")
      .sort({ dueDate: 1 }); // soonest due first for parent view
 
    res.status(200).json({
      success: true,
      count: assignments.length,
      data: assignments,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ======================
// GET ASSIGNMENTS BY CLASS
// Students see assignments for their class
// ======================
exports.getAssignmentsByClass = async (req, res) => {
  try {
    const { class: className, section } = req.params;

    //  Get student's school from their profile
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(403).json({ message: "Access denied" });
    }

    const assignments = await Assignment.find({
      class: className,
      section,
      schoolId: student.schoolId,
      status: "active",
    })
      .populate("teacherId", "employeeId department")
      .sort({ dueDate: 1 });

    res.status(200).json({
      success: true,
      count: assignments.length,
      data: assignments,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ======================
// GET SINGLE ASSIGNMENT
// ======================
exports.getAssignmentById = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate("teacherId", "employeeId department")
      .populate("schoolId", "name");

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    res.status(200).json({ success: true, data: assignment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ======================
// UPDATE ASSIGNMENT
// Only the teacher who created it can update
// ======================
exports.updateAssignment = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ userId: req.user._id });
    if (!teacher) {
      return res.status(403).json({ message: "Only teachers can update assignments" });
    }

    // Make sure teacher owns this assignment
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      teacherId: teacher._id,
    });

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found or access denied" });
    }

    const { title, description, class: className, section, subject, dueDate, attachment, status } = req.body;

    if (title) assignment.title = title;
    if (description) assignment.description = description;
    if (className) assignment.class = className;
    if (section) assignment.section = section;
    if (subject) assignment.subject = subject;
    if (dueDate) assignment.dueDate = dueDate;
    if (attachment) assignment.attachment = attachment;
    if (status) assignment.status = status;

    await assignment.save();

    res.status(200).json({
      success: true,
      message: "Assignment updated successfully",
      data: assignment,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ======================
// DELETE ASSIGNMENT
// Teacher or Admin can delete
// ======================
exports.deleteAssignment = async (req, res) => {
  try {
    let assignment;

    if (req.admin) {
      //  Admin can delete any assignment in their school
      assignment = await Assignment.findOne({
        _id: req.params.id,
        schoolId: req.admin.schoolId,
      });
    } else {
      // Teacher can only delete their own
      const teacher = await Teacher.findOne({ userId: req.user._id });
      if (!teacher) {
        return res.status(403).json({ message: "Access denied" });
      }
      assignment = await Assignment.findOne({
        _id: req.params.id,
        teacherId: teacher._id,
      });
    }

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found or access denied" });
    }

    // Also delete all submissions for this assignment
    await AssignmentSubmission.deleteMany({ assignmentId: req.params.id });
    await Assignment.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Assignment and its submissions deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ======================
// SUBMIT ASSIGNMENT
// Only students can submit
// ======================
exports.submitAssignment = async (req, res) => {
  try {
    const { assignmentId, submissionText, attachment } = req.body;

    if (!assignmentId) {
      return res.status(400).json({ message: "assignmentId is required" });
    }

    //  Get student profile from logged-in user
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(403).json({ message: "Only students can submit assignments" });
    }

    // Check assignment exists and is active
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }
    if (assignment.status === "closed") {
      return res.status(400).json({ message: "This assignment is closed for submissions" });
    }

    // Check due date
    if (new Date() > new Date(assignment.dueDate)) {
      return res.status(400).json({ message: "Assignment due date has passed" });
    }

    // Check already submitted (unique index handles this too)
    const alreadySubmitted = await AssignmentSubmission.findOne({
      assignmentId,
      studentId: student._id,
    });
    if (alreadySubmitted) {
      return res.status(400).json({ message: "You have already submitted this assignment" });
    }

    const submission = await AssignmentSubmission.create({
      assignmentId,
      studentId: student._id,        //  auto-set from logged-in student
      schoolId: student.schoolId,    //  auto-set from student's school
      submissionText: submissionText || "",
      attachment: attachment || "",
    });

    res.status(201).json({
      success: true,
      message: "Assignment submitted successfully",
      data: submission,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ======================
// GET SUBMISSIONS FOR AN ASSIGNMENT
// Teacher sees all submissions for their assignment
// ======================
exports.getAssignmentSubmissions = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ userId: req.user._id });
    if (!teacher) {
      return res.status(403).json({ message: "Only teachers can view submissions" });
    }

    //  Make sure the assignment belongs to this teacher
    const assignment = await Assignment.findOne({
      _id: req.params.assignmentId,
      teacherId: teacher._id,
    });
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found or access denied" });
    }

    const submissions = await AssignmentSubmission.find({
      assignmentId: req.params.assignmentId,
    })
      .populate("studentId", "admissionNumber rollNumber class section")
      .populate({
        path: "studentId",
        populate: { path: "userId", select: "fullName email" },
      });

    res.status(200).json({
      success: true,
      count: submissions.length,
      data: submissions,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ======================
// GRADE SUBMISSION
// Teacher grades a student's submission
// ======================
exports.gradeSubmission = async (req, res) => {
  try {
    const { marks, remarks } = req.body;
    const { submissionId } = req.params;

    const teacher = await Teacher.findOne({ userId: req.user._id });
    if (!teacher) {
      return res.status(403).json({ message: "Only teachers can grade submissions" });
    }

    const submission = await AssignmentSubmission.findById(submissionId)
      .populate("assignmentId");

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    //  Make sure it's this teacher's assignment
    if (submission.assignmentId.teacherId.toString() !== teacher._id.toString()) {
      return res.status(403).json({ message: "You can only grade your own assignments" });
    }

    submission.marks = marks;
    submission.remarks = remarks || "";
    submission.gradedBy = teacher._id;
    submission.gradedAt = new Date();
    await submission.save();

    res.status(200).json({
      success: true,
      message: "Submission graded successfully",
      data: submission,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ======================
// GET MY SUBMISSIONS
// Student sees their own submissions
// ======================
exports.getMySubmissions = async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) {
      return res.status(403).json({ message: "Access denied" });
    }

    const submissions = await AssignmentSubmission.find({ studentId: student._id })
      .populate("assignmentId", "title subject class section dueDate status");

    res.status(200).json({
      success: true,
      count: submissions.length,
      data: submissions,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};