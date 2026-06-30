const Exam = require("../model/examSchema");
const Student = require("../model/studentSchema");
const Parent = require("../model/parentSchema");
const Teacher = require("../model/teacherSchema");
const User = require("../model/userSchema");
const School = require("../model/schoolSchema");
const { notify, notifyMany, examNotificationTemplate, resultNotificationTemplate } = require("../services/notificationService");
const { sendEmail } = require("../utils/sendEmail");
// =========================
// CREATE EXAM + NOTIFY ALL
// Admin creates exam → notifies students, parents, teachers
// =========================
exports.createExam = async (req, res) => {
  try {
    const { title, className, section, subjects, examDate } = req.body;

    if (!title || !className || !examDate || !subjects?.length) {
      return res.status(400).json({ message: "title, className, examDate and subjects are required" });
    }

    const adminSchoolId = req.admin.schoolId;
    const school = await School.findById(adminSchoolId).select("name");

    const exam = await Exam.create({
      title,
      className,
      section: section || null,
      subjects,
      examDate,
      schoolId: adminSchoolId,
      createdBy: req.admin._id,
    });

    // Get all students in this class
    const studentFilter = { schoolId: adminSchoolId, class: className };
    if (section) studentFilter.section = section;

    const students = await Student.find(studentFilter)
      .populate("userId", "fullName email");

    // Get all teachers in this school
    const teachers = await Teacher.find({ schoolId: adminSchoolId })
      .populate("userId", "fullName email");

    const examDateFormatted = new Date(examDate).toLocaleDateString("en-NP", {
      year: "numeric", month: "long", day: "numeric",
    });

    const notifyTitle = `Exam Scheduled: ${title}`;
    const notifyMessage = `${title} for Class ${className}${section ? `-${section}` : ""} is scheduled from ${examDateFormatted}.`;

    // ================================
    // NOTIFY STUDENTS + THEIR PARENTS
    // ================================
    for (const student of students) {
      if (!student.userId) continue;

      // Notify student
      await notify({
        recipient: student.userId._id,
        schoolId: adminSchoolId,
        title: notifyTitle,
        message: notifyMessage,
        type: "general",
        refId: exam._id,
        refModel: "Exam",
        email: student.userId.email,
        emailHtml: examNotificationTemplate({
          recipientName: student.userId.fullName,
          examTitle: title,
          className,
          section,
          subjects,
          examDate,
          schoolName: school.name,
        }),
      });

      // Notify parent if linked
      if (student.parentId) {
        const parent = await User.findById(student.parentId).select("fullName email");
        if (parent) {
          await notify({
            recipient: parent._id,
            schoolId: adminSchoolId,
            title: notifyTitle,
            message: `Your child's exam "${title}" is scheduled from ${examDateFormatted}.`,
            type: "general",
            refId: exam._id,
            refModel: "Exam",
            email: parent.email,
            emailHtml: examNotificationTemplate({
              recipientName: parent.fullName,
              examTitle: title,
              className,
              section,
              subjects,
              examDate,
              schoolName: school.name,
            }),
          });
        }
      }
    }

    // ================================
    // NOTIFY TEACHERS
    // ================================
    const teacherUserIds = teachers
      .filter((t) => t.userId)
      .map((t) => t.userId._id);

    await notifyMany(teacherUserIds, {
      schoolId: adminSchoolId,
      title: notifyTitle,
      message: notifyMessage,
      type: "general",
      refId: exam._id,
      refModel: "Exam",
    });

    // Send emails to teachers
    for (const teacher of teachers) {
      if (!teacher.userId?.email) continue;
      await sendEmail({
        to: teacher.userId.email,
        subject: notifyTitle,
        html: examNotificationTemplate({
          recipientName: teacher.userId.fullName,
          examTitle: title,
          className,
          section,
          subjects,
          examDate,
          schoolName: school.name,
        }),
      });
    }

    res.status(201).json({
      success: true,
      message: `Exam created. Notified ${students.length} students and ${teachers.length} teachers.`,
      data: exam,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// PUBLISH RESULTS + NOTIFY STUDENTS & PARENTS
// =========================
exports.publishResults = async (req, res) => {
  try {
    const { examId, results } = req.body;
    // results = [{ studentId, marks: [{subject, obtainedMarks, fullMarks, passMarks}], remarks }]

    if (!examId || !results?.length) {
      return res.status(400).json({ message: "examId and results are required" });
    }

    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const school = await School.findById(exam.schoolId).select("name");

    // ✅ Calculate totals and grades
    const processedResults = results.map((r) => {
      const totalObtained = r.marks.reduce((sum, m) => sum + m.obtainedMarks, 0);
      const totalFull = r.marks.reduce((sum, m) => sum + m.fullMarks, 0);
      const percentage = ((totalObtained / totalFull) * 100).toFixed(1);
      const isPassed = r.marks.every((m) => m.obtainedMarks >= m.passMarks);

      // ✅ Grade calculation
      let grade;
      if (percentage >= 90) grade = "A+";
      else if (percentage >= 80) grade = "A";
      else if (percentage >= 70) grade = "B+";
      else if (percentage >= 60) grade = "B";
      else if (percentage >= 50) grade = "C+";
      else if (percentage >= 40) grade = "C";
      else grade = "F";

      return {
        ...r,
        marks: r.marks.map((m) => ({
          ...m,
          isPassed: m.obtainedMarks >= m.passMarks,
        })),
        totalObtained,
        totalFull,
        percentage: Number(percentage),
        grade,
        isPassed,
      };
    });

    exam.results = processedResults;
    exam.status = "published";
    await exam.save();

    // ================================
    // NOTIFY EACH STUDENT + PARENT
    // ================================
    let notifiedCount = 0;

    for (const result of processedResults) {
      const student = await Student.findById(result.studentId)
        .populate("userId", "fullName email");

      if (!student?.userId) continue;

      const resultTitle = `Result Published: ${exam.title}`;
      const resultMessage = `Your result for ${exam.title} has been published. Grade: ${result.grade} | ${result.percentage}% | ${result.isPassed ? "Passed ✅" : "Failed ❌"}`;

      // Notify student
      await notify({
        recipient: student.userId._id,
        schoolId: exam.schoolId,
        title: resultTitle,
        message: resultMessage,
        type: "general",
        refId: exam._id,
        refModel: "Exam",
        email: student.userId.email,
        emailHtml: resultNotificationTemplate({
          recipientName: student.userId.fullName,
          studentName: student.userId.fullName,
          examTitle: exam.title,
          totalObtained: result.totalObtained,
          totalFull: result.totalFull,
          percentage: result.percentage,
          grade: result.grade,
          isPassed: result.isPassed,
          schoolName: school.name,
        }),
      });

      // Notify parent
      if (student.parentId) {
        const parent = await User.findById(student.parentId).select("fullName email");
        if (parent) {
          await notify({
            recipient: parent._id,
            schoolId: exam.schoolId,
            title: resultTitle,
            message: `${student.userId.fullName}'s result for ${exam.title}: Grade ${result.grade} | ${result.percentage}% | ${result.isPassed ? "Passed ✅" : "Failed ❌"}`,
            type: "general",
            refId: exam._id,
            refModel: "Exam",
            email: parent.email,
            emailHtml: resultNotificationTemplate({
              recipientName: parent.fullName,
              studentName: student.userId.fullName,
              examTitle: exam.title,
              totalObtained: result.totalObtained,
              totalFull: result.totalFull,
              percentage: result.percentage,
              grade: result.grade,
              isPassed: result.isPassed,
              schoolName: school.name,
            }),
          });
        }
      }

      notifiedCount++;
    }

    res.status(200).json({
      success: true,
      message: `Results published. Notified ${notifiedCount} students and their parents.`,
      data: exam,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET ALL EXAMS (Admin)
// =========================
exports.getExams = async (req, res) => {
  try {
    const adminSchoolId = req.admin.schoolId;
    const { status, className } = req.query;

    let filter = { schoolId: adminSchoolId };
    if (status) filter.status = status;
    if (className) filter.className = className;

    const exams = await Exam.find(filter).sort({ examDate: 1 });

    res.status(200).json({
      success: true,
      count: exams.length,
      data: exams,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET MY EXAMS (Student/Teacher)
// =========================
exports.getMyExams = async (req, res) => {
  try {
    let filter = {};

    const student = await Student.findOne({ userId: req.user._id });
    if (student) {
      filter = {
        schoolId: student.schoolId,
        className: student.class,
        $or: [{ section: student.section }, { section: null }],
      };
    } else {
      const teacher = await Teacher.findOne({ userId: req.user._id });
      if (teacher) {
        filter = { schoolId: teacher.schoolId };
      } else {
        // Parent — get exams for all children
        const Parent = require("../model/parentSchema");
        const parent = await Parent.findOne({ userId: req.user._id })
          .populate("students", "class section schoolId");

        if (!parent) return res.status(403).json({ message: "Access denied" });

        const classFilters = parent.students.map((s) => ({
          className: s.class,
          $or: [{ section: s.section }, { section: null }],
        }));

        filter = {
          schoolId: parent.schoolId,
          $or: classFilters,
        };
      }
    }

    const exams = await Exam.find(filter)
      .select("-results") // don't expose other students' results
      .sort({ examDate: 1 });

    res.status(200).json({
      success: true,
      count: exams.length,
      data: exams,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET MY RESULT (Student)
// =========================
exports.getMyResult = async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(403).json({ message: "Access denied" });

    const exam = await Exam.findOne({
      _id: req.params.examId,
      status: "published",
    });

    if (!exam) return res.status(404).json({ message: "Exam not found or results not published yet" });

    const result = exam.results.find(
      (r) => r.studentId.toString() === student._id.toString()
    );

    if (!result) return res.status(404).json({ message: "Your result not found for this exam" });

    res.status(200).json({
      success: true,
      data: {
        exam: { title: exam.title, className: exam.className, section: exam.section },
        result,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET SINGLE EXAM
// =========================
exports.getExamById = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate("results.studentId", "admissionNumber class section");

    if (!exam) return res.status(404).json({ message: "Exam not found" });

    res.status(200).json({ success: true, data: exam });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// UPDATE EXAM (Admin)
// =========================
exports.updateExam = async (req, res) => {
  try {
    const exam = await Exam.findOneAndUpdate(
      { _id: req.params.id, schoolId: req.admin.schoolId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!exam) return res.status(404).json({ message: "Exam not found" });

    res.status(200).json({ success: true, message: "Exam updated", data: exam });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// DELETE EXAM (Admin)
// =========================
exports.deleteExam = async (req, res) => {
  try {
    const exam = await Exam.findOneAndDelete({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
    });

    if (!exam) return res.status(404).json({ message: "Exam not found" });

    res.status(200).json({ success: true, message: "Exam deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};





// =========================
// SUBMIT SUBJECT MARKS (Teacher)
// Teacher enters marks for their own subject in an existing exam
// =========================
exports.submitSubjectMarks = async (req, res) => {
  try {
    const { examId, subject, fullMarks, passMarks, studentMarks } = req.body;
    // studentMarks = [{ studentId, obtainedMarks }]

    if (!examId || !subject || !fullMarks || !passMarks || !studentMarks?.length) {
      return res.status(400).json({
        message: "examId, subject, fullMarks, passMarks and studentMarks are required",
      });
    }

    const teacher = await Teacher.findOne({ userId: req.user._id });
    if (!teacher) {
      return res.status(403).json({ message: "Only teachers can submit marks" });
    }

    const exam = await Exam.findOne({ _id: examId, schoolId: teacher.schoolId });
    if (!exam) {
      return res.status(404).json({ message: "Exam not found in your school" });
    }
    if (exam.status === "published") {
      return res.status(400).json({
        message: "This exam is already published. Contact admin to make changes.",
      });
    }

    // Upsert marks per student for this subject
    for (const sm of studentMarks) {
      const obtained = Number(sm.obtainedMarks);
      const isPassed = obtained >= Number(passMarks);

      const subjectEntry = {
        subject,
        obtainedMarks: obtained,
        fullMarks:     Number(fullMarks),
        passMarks:     Number(passMarks),
        isPassed,
      };

      const existingResultIdx = exam.results.findIndex(
        (r) => r.studentId.toString() === sm.studentId.toString()
      );

      if (existingResultIdx >= 0) {
        // Student already has a result row — update or push subject entry
        const subjectIdx = exam.results[existingResultIdx].marks.findIndex(
          (m) => m.subject === subject
        );
        if (subjectIdx >= 0) {
          exam.results[existingResultIdx].marks[subjectIdx] = subjectEntry;
        } else {
          exam.results[existingResultIdx].marks.push(subjectEntry);
        }
      } else {
        // First result row for this student
        exam.results.push({
          studentId: sm.studentId,
          marks: [subjectEntry],
        });
      }
    }

    exam.markModified("results");
    await exam.save();

    // ── Notify students of marks entry (not full publish) ──────────────────
    const school = await School.findById(teacher.schoolId).select("name");
    const schoolName = school?.name ?? "Your School";

    const notifyPromises = studentMarks.map(async (sm) => {
      try {
        const student = await Student.findById(sm.studentId)
          .populate("userId", "fullName email");
        if (!student?.userId?.email) return;

        await sendEmail({
          to: student.userId.email,
          subject: `Marks Updated — ${exam.title} (${subject})`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px;">
              <div style="background:#4f46e5;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
                <h2 style="color:white;margin:0;">📊 Marks Updated — ${schoolName}</h2>
              </div>
              <div style="padding:30px;">
                <h3 style="color:#333;margin-top:0;">Dear ${student.userId.fullName},</h3>
                <p style="color:#555;">Your marks for <strong>${subject}</strong> in <strong>${exam.title}</strong> have been entered.</p>
                <div style="background:#f0f4ff;border:1px solid #c7d7ff;border-radius:8px;padding:18px;margin:20px 0;">
                  <table style="width:100%;border-collapse:collapse;">
                    <tr>
                      <td style="color:#666;padding:5px 0;font-size:14px;"><strong>Exam:</strong></td>
                      <td style="color:#333;font-size:14px;">${exam.title}</td>
                    </tr>
                    <tr>
                      <td style="color:#666;padding:5px 0;font-size:14px;"><strong>Subject:</strong></td>
                      <td style="color:#333;font-size:14px;">${subject}</td>
                    </tr>
                    <tr>
                      <td style="color:#666;padding:5px 0;font-size:14px;"><strong>Marks Obtained:</strong></td>
                      <td style="color:#1a73e8;font-size:14px;font-weight:bold;">${sm.obtainedMarks} / ${fullMarks}</td>
                    </tr>
                    <tr>
                      <td style="color:#666;padding:5px 0;font-size:14px;"><strong>Status:</strong></td>
                      <td style="font-size:14px;font-weight:bold;color:${Number(sm.obtainedMarks) >= Number(passMarks) ? "#16a34a" : "#dc2626"};">
                        ${Number(sm.obtainedMarks) >= Number(passMarks) ? "✅ Passed" : "❌ Failed"}
                      </td>
                    </tr>
                  </table>
                </div>
                <p style="color:#888;font-size:12px;">This is an automated notification from ${schoolName}.</p>
              </div>
            </div>
          `,
        });
      } catch (e) {
        console.error("[submitSubjectMarks] email failed:", e.message);
      }
    });

    Promise.allSettled(notifyPromises); // fire-and-forget

    res.status(200).json({
      success: true,
      message: `Marks saved for ${studentMarks.length} students in ${subject}.`,
      data: exam,
    });
  } catch (err) {
    console.error("[submitSubjectMarks]", err);
    res.status(500).json({ message: err.message });
  }
};