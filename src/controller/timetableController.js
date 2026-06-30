const Timetable = require("../model/timetableSchema");
const Teacher = require("../model/teacherSchema");
const Student = require("../model/studentSchema");

const getWeekNumber = (date = new Date()) => {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date - start;
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.ceil((diff / oneWeek) + start.getDay() / 7);
};

// =========================
// CREATE / UPDATE TIMETABLE (Admin)
// =========================
exports.createTimetable = async (req, res) => {
  try {
    const { className, section, type, weekNumber, year, schedule } = req.body;

    if (!className || !section || !schedule?.length) {
      return res.status(400).json({ message: "className, section and schedule are required" });
    }

    const adminSchoolId = req.admin.schoolId;

    for (const day of schedule) {
      for (const period of day.periods) {
        if (period.teacherId) {
          const teacher = await Teacher.findOne({ _id: period.teacherId, schoolId: adminSchoolId });
          if (!teacher) {
            return res.status(404).json({ message: `Teacher ${period.teacherId} not found in your school` });
          }
        }
      }
    }

    const filter = {
      schoolId: adminSchoolId,
      className,
      section,
      type: type || "fixed",
      weekNumber: type === "dynamic" ? (weekNumber || getWeekNumber()) : null,
      year: year || new Date().getFullYear(),
    };

    const timetable = await Timetable.findOneAndUpdate(
      filter,
      { ...filter, schedule, createdBy: req.admin._id, isActive: true },
      { upsert: true, new: true }
    ).populate("schedule.periods.teacherId", "employeeId department")
     .populate({ path: "schedule.periods.teacherId", populate: { path: "userId", select: "fullName" } });

    res.status(201).json({
      success: true,
      message: `${type === "dynamic" ? "Dynamic" : "Fixed"} timetable saved successfully`,
      data: timetable,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET TIMETABLE (Admin)
// =========================
exports.getTimetable = async (req, res) => {
  try {
    const { className, section, type, weekNumber, year } = req.query;
    const adminSchoolId = req.admin.schoolId;

    let filter = { schoolId: adminSchoolId };
    if (className)  filter.className  = className;
    if (section)    filter.section    = section;
    if (type)       filter.type       = type;
    if (weekNumber) filter.weekNumber = Number(weekNumber);
    if (year)       filter.year       = Number(year);

    const timetables = await Timetable.find(filter)
      .populate({ path: "schedule.periods.teacherId", populate: { path: "userId", select: "fullName" } })
      .sort({ className: 1, section: 1 });

    res.status(200).json({ success: true, count: timetables.length, data: timetables });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET MY TIMETABLE (Student)
// Returns 200 with empty schedule when no timetable exists — never 404
// =========================
exports.getMyTimetable = async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id });
    if (!student) return res.status(403).json({ message: "Access denied" });

    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayName   = days[new Date().getDay()];
    const currentWeek = getWeekNumber();
    const currentYear = new Date().getFullYear();

    // Try dynamic first, fall back to fixed
    let timetable = await Timetable.findOne({
      schoolId:   student.schoolId,
      className:  student.class,
      section:    student.section,
      type:       "dynamic",
      weekNumber: currentWeek,
      year:       currentYear,
    }).populate({ path: "schedule.periods.teacherId", populate: { path: "userId", select: "fullName" } });

    if (!timetable) {
      timetable = await Timetable.findOne({
        schoolId:  student.schoolId,
        className: student.class,
        section:   student.section,
        type:      "fixed",
      }).populate({ path: "schedule.periods.teacherId", populate: { path: "userId", select: "fullName" } });
    }

    // ── No timetable yet — return empty shell instead of 404 ──────────────
    if (!timetable) {
      return res.status(200).json({
        success:       true,
        empty:         true,               // frontend can check this flag
        type:          "fixed",
        weekNumber:    null,
        today:         todayName,
        todaySchedule: { day: todayName, periods: [] },
        fullSchedule:  [],
      });
    }

    const todaySchedule = timetable.schedule.find((s) => s.day === todayName);

    res.status(200).json({
      success:       true,
      empty:         false,
      type:          timetable.type,
      weekNumber:    timetable.weekNumber,
      today:         todayName,
      todaySchedule: todaySchedule || { day: todayName, periods: [] },
      fullSchedule:  timetable.schedule,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET TEACHER TIMETABLE (Teacher)
// =========================
exports.getTeacherTimetable = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ userId: req.user._id });
    if (!teacher) return res.status(403).json({ message: "Access denied" });

    const currentWeek = getWeekNumber();
    const currentYear = new Date().getFullYear();

    const timetables = await Timetable.find({
      schoolId: teacher.schoolId,
      "schedule.periods.teacherId": teacher._id,
      $or: [
        { type: "fixed" },
        { type: "dynamic", weekNumber: currentWeek, year: currentYear },
      ],
    });

    const mySchedule = [];
    for (const tt of timetables) {
      for (const day of tt.schedule) {
        const myPeriods = day.periods.filter(
          (p) => p.teacherId?.toString() === teacher._id.toString()
        );
        if (myPeriods.length > 0) {
          mySchedule.push({
            className: tt.className,
            section:   tt.section,
            type:      tt.type,
            day:       day.day,
            periods:   myPeriods,
          });
        }
      }
    }

    res.status(200).json({ success: true, count: mySchedule.length, data: mySchedule });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// DELETE TIMETABLE (Admin)
// =========================
exports.deleteTimetable = async (req, res) => {
  try {
    const timetable = await Timetable.findOneAndDelete({
      _id:      req.params.id,
      schoolId: req.admin.schoolId,
    });

    if (!timetable) return res.status(404).json({ message: "Timetable not found" });

    res.status(200).json({ success: true, message: "Timetable deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};