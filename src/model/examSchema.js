const mongoose = require("mongoose");

const examSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    className: {
      type: String,
      required: true,
    },
    section: {
      type: String,
      default: null,
    },
    subjects: [
      {
        name: { type: String, required: true },
        fullMarks: { type: Number, required: true },
        passMarks: { type: Number, required: true },
        examDate: { type: Date, required: true },
        examTime: { type: String, default: null }, // "10:00 AM"
        room: { type: String, default: null },
      },
    ],
    examDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["upcoming", "ongoing", "completed", "published"],
      default: "upcoming",
    },
    results: [
      {
        studentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Student",
        },
        marks: [
          {
            subject: String,
            obtainedMarks: Number,
            fullMarks: Number,
            passMarks: Number,
            isPassed: Boolean,
          },
        ],
        totalObtained: Number,
        totalFull: Number,
        percentage: Number,
        grade: String,
        isPassed: Boolean,
        remarks: String,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Exam", examSchema);