const Result = require("../model/resultSchema");
const Exam = require("../model/examSchema");
const Student = require("../model/studentSchema");
const Parent = require("../model/parentSchema");
const User = require("../model/userSchema");
const School = require("../model/schoolSchema");
const { processResult } = require("../services/resultService");
const {
  notify,
  resultNotificationTemplate,
} = require("../services/notificationService");

// =========================
// PUBLISH RESULTS (Admin)
// =========================
exports.publishResults = async (req, res) => {
  try {
    const { examId, results } = req.body;

    if (!examId || !results?.length) {
      return res.status(400).json({ message: "examId and results array are required" });
    }

    const exam = await Exam.findOne({ _id: examId, schoolId: req.admin.schoolId });
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    if (exam.status === "published") {
      return res.status(400).json({ message: "Results already published for this exam" });
    }

    const school = await School.findById(req.admin.schoolId).select("name");

    const savedResults = [];
    const failed = [];

    for (const r of results) {
      try {
        // ✅ Validate marks array
        if (!r.marks || !Array.isArray(r.marks) || r.marks.length === 0) {
          failed.push({ studentId: r.studentId, reason: "marks array is required" });
          continue;
        }

        const student = await Student.findOne({
          _id: r.studentId,
          schoolId: req.admin.schoolId,
        }).populate("userId", "fullName email");

        if (!student) {
          failed.push({ studentId: r.studentId, reason: "Student not found" });
          continue;
        }

        if (!student.userId) {
          failed.push({ studentId: r.studentId, reason: "Student has no linked user account" });
          continue;
        }

        const processed = processResult(
          student._id,
          req.admin.schoolId,
          exam,
          r.marks,
          r.remarks
        );

        const result = await Result.findOneAndUpdate(
          { examId, studentId: student._id },
          { ...processed, publishedBy: req.admin._id, isPublished: true },
          { upsert: true, returnDocument: "after" }
        );

        savedResults.push(result);

        // ✅ Notify student
        await notify({
          recipient: student.userId._id,
          schoolId: req.admin.schoolId,
          title: `Result Published: ${exam.title}`,
          message: `Your result for ${exam.title} — Grade: ${result.grade} | ${result.percentage}% | ${result.isPassed ? "Passed ✅" : "Failed ❌"}`,
          type: "general",
          refId: result._id,
          refModel: "Result",
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

        // ✅ Notify parent
        if (student.parentId) {
          const parent = await User.findById(student.parentId).select("fullName email");
          if (parent) {
            await notify({
              recipient: parent._id,
              schoolId: req.admin.schoolId,
              title: `Result Published: ${exam.title}`,
              message: `${student.userId.fullName}'s result — Grade: ${result.grade} | ${result.percentage}% | ${result.isPassed ? "Passed ✅" : "Failed ❌"}`,
              type: "general",
              refId: result._id,
              refModel: "Result",
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
      } catch (innerErr) {
        failed.push({ studentId: r.studentId, reason: innerErr.message });
      }
    }

    // ✅ Only update ranks + mark published if at least one result saved
    if (savedResults.length > 0) {
      await updateRanks(examId, req.admin.schoolId);
      exam.status = "published";
      await exam.save();
    }

    res.status(200).json({
      success: true,
      message: `Results published: ${savedResults.length} success, ${failed.length} failed`,
      data: { published: savedResults.length, failed },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// UPDATE SINGLE RESULT (Admin)
// =========================
exports.updateResult = async (req, res) => {
  try {
    const { marks, remarks } = req.body;

    // ✅ Validate marks
    if (!marks || !Array.isArray(marks) || marks.length === 0) {
      return res.status(400).json({ message: "marks array is required" });
    }

    const result = await Result.findOne({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
    });

    if (!result) return res.status(404).json({ message: "Result not found" });

    const exam = await Exam.findById(result.examId);
    if (!exam) return res.status(404).json({ message: "Associated exam not found" });

    const processed = processResult(
      result.studentId,
      req.admin.schoolId,
      exam,
      marks,
      remarks
    );

    Object.assign(result, processed);
    await result.save();

    await updateRanks(result.examId, req.admin.schoolId);

    const updated = await Result.findById(result._id).populate("studentId");

    res.status(200).json({
      success: true,
      message: "Result updated and ranks recalculated",
      data: updated,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET ALL RESULTS FOR AN EXAM (Admin)
// =========================
exports.getExamResults = async (req, res) => {
  try {
    const { examId } = req.params;

    const exam = await Exam.findOne({ _id: examId, schoolId: req.admin.schoolId });
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const results = await Result.find({ examId, isPublished: true })
      .populate({
        path: "studentId",
        populate: { path: "userId", select: "fullName email" },
        select: "admissionNumber rollNumber class section userId",
      })
      .sort({ rank: 1 });

    // ✅ Class summary
    const total = results.length;
    const passed = results.filter((r) => r.isPassed).length;
    const failed = total - passed;
    const avgPercentage =
      total > 0
        ? (results.reduce((s, r) => s + r.percentage, 0) / total).toFixed(2)
        : 0;

    const gradeDistribution = results.reduce((acc, r) => {
      acc[r.grade] = (acc[r.grade] || 0) + 1;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      exam: { title: exam.title, className: exam.className, section: exam.section },
      summary: { total, passed, failed, avgPercentage, gradeDistribution },
      data: results,
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

    const { examId } = req.params;

    const result = await Result.findOne({
      examId,
      studentId: student._id,
      isPublished: true,
    }).populate("examId", "title className section examDate");

    if (!result) {
      return res.status(404).json({ message: "Result not found or not published yet" });
    }

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET ALL MY RESULTS (Student)
// All exam results for logged-in student
// =========================
exports.getAllMyResults = async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(403).json({ message: "Access denied" });

    const results = await Result.find({
      studentId: student._id,
      isPublished: true,
    })
      .populate("examId", "title className section examDate status")
      .sort({ createdAt: -1 });

    // ✅ Overall academic summary
    const summary = {
      totalExams: results.length,
      passed: results.filter((r) => r.isPassed).length,
      failed: results.filter((r) => !r.isPassed).length,
      averagePercentage:
        results.length > 0
          ? (results.reduce((s, r) => s + r.percentage, 0) / results.length).toFixed(2)
          : 0,
      bestGrade: results.reduce(
        (best, r) => (r.percentage > (best?.percentage || 0) ? r : best),
        null
      )?.grade || null,
    };

    res.status(200).json({
      success: true,
      summary,
      data: results,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET CHILD RESULTS (Parent)
// =========================
exports.getChildResults = async (req, res) => {
  try {
    const parent = await Parent.findOne({ userId: req.user._id });
    if (!parent) return res.status(403).json({ message: "Access denied" });

    const { studentId } = req.params;

    // ✅ Make sure student belongs to this parent
    if (!parent.students.map((s) => s.toString()).includes(studentId)) {
      return res.status(403).json({ message: "This student is not linked to your account" });
    }

    const results = await Result.find({
      studentId,
      isPublished: true,
    })
      .populate("examId", "title className section examDate")
      .sort({ createdAt: -1 });

    const summary = {
      totalExams: results.length,
      passed: results.filter((r) => r.isPassed).length,
      failed: results.filter((r) => !r.isPassed).length,
      averagePercentage:
        results.length > 0
          ? (results.reduce((s, r) => s + r.percentage, 0) / results.length).toFixed(2)
          : 0,
    };

    res.status(200).json({
      success: true,
      summary,
      data: results,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET REPORT CARD (Student or Parent)
// Full printable report card for one exam
// =========================
exports.getReportCard = async (req, res) => {
  try {
    const { examId, studentId } = req.params;

    // ✅ Access check
    if (req.user.role === "parent") {
      const parent = await Parent.findOne({ userId: req.user._id });
      if (!parent?.students.map((s) => s.toString()).includes(studentId)) {
        return res.status(403).json({ message: "Access denied" });
      }
    } else {
      const student = await Student.findOne({ userId: req.user._id });
      if (student?._id.toString() !== studentId) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const result = await Result.findOne({ examId, studentId, isPublished: true })
      .populate("examId", "title className section examDate subjects")
      .populate({
        path: "studentId",
        populate: { path: "userId", select: "fullName email" },
        select: "admissionNumber rollNumber class section userId",
      })
      .populate("schoolId", "name address phone email");

    if (!result) {
      return res.status(404).json({ message: "Result not found" });
    }

    res.status(200).json({
      success: true,
      data: {
        school: result.schoolId,
        exam: result.examId,
        student: {
          name: result.studentId.userId.fullName,
          admissionNumber: result.studentId.admissionNumber,
          rollNumber: result.studentId.rollNumber,
          class: result.className,
          section: result.section,
        },
        marks: result.marks,
        summary: {
          totalObtained: result.totalObtained,
          totalFull: result.totalFull,
          percentage: result.percentage,
          grade: result.grade,
          rank: result.rank,
          isPassed: result.isPassed,
          remarks: result.remarks,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// UPDATE SINGLE RESULT (Admin)
// Correct a mistake after publishing
// =========================
exports.updateResult = async (req, res) => {
  try {
    const { marks, remarks } = req.body;

    const result = await Result.findOne({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
    });

    if (!result) return res.status(404).json({ message: "Result not found" });

    const exam = await Exam.findById(result.examId);

    const processed = processResult(
      result.studentId,
      req.admin.schoolId,
      exam,
      marks,
      remarks
    );

    Object.assign(result, processed);
    await result.save();

    // ✅ Re-calculate ranks for this exam
    await updateRanks(result.examId, req.admin.schoolId);

    const updated = await Result.findById(result._id).populate("studentId");

    res.status(200).json({
      success: true,
      message: "Result updated and ranks recalculated",
      data: updated,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// DELETE RESULT (Admin)
// =========================
exports.deleteResult = async (req, res) => {
  try {
    const result = await Result.findOneAndDelete({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
    });

    if (!result) return res.status(404).json({ message: "Result not found" });

    await updateRanks(result.examId, req.admin.schoolId);

    res.status(200).json({ success: true, message: "Result deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};