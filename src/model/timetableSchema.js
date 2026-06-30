const mongoose = require("mongoose");

const timetableSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    className: { type: String, required: true },
    section: { type: String, required: true },
    type: {
      type: String,
      enum: ["fixed", "dynamic"],
      default: "fixed",
    },
    // ✅ For fixed: weekNumber is null
    // ✅ For dynamic: weekNumber is the week number of the year
    weekNumber: { type: Number, default: null },
    year: { type: Number, default: () => new Date().getFullYear() },
    schedule: [
      {
        day: {
          type: String,
          enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
          required: true,
        },
        periods: [
          {
            periodNumber: { type: Number, required: true },
            subject: { type: String, required: true },
            teacherId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Teacher",
              default: null,
            },
            startTime: { type: String, required: true }, // "10:00 AM"
            endTime: { type: String, required: true },   // "11:00 AM"
            room: { type: String, default: null },
          },
        ],
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

//One fixed timetable per class/section
//One dynamic timetable per class/section per week
timetableSchema.index(
  { schoolId: 1, className: 1, section: 1, type: 1, weekNumber: 1, year: 1 },
  { unique: true }
);

module.exports = mongoose.model("Timetable", timetableSchema);