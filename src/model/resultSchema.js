const mongoose = require("mongoose");

const resultSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    className: {
      type: String,
      required: true,
    },
    section: {
      type: String,
      default: null,
    },
    marks: [
      {
        subject: { type: String, required: true },
        fullMarks: { type: Number, required: true },
        passMarks: { type: Number, required: true },
        obtainedMarks: { type: Number, required: true },
        isPassed: { type: Boolean },
        grade: { type: String },
      },
    ],
    totalObtained: { type: Number, default: 0 },
    totalFull: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    grade: { type: String, default: null },
    isPassed: { type: Boolean, default: false },
    rank: { type: Number, default: null },
    remarks: { type: String, default: "" },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// One result per student per exam
resultSchema.index({ examId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model("Result", resultSchema);