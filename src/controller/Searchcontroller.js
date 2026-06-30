const Parent = require("../model/parentSchema");
const Student = require("../model/studentSchema");
const Attendance = require("../model/attendenceSchema");
const Fee = require("../model/feeSchema");
const Notice = require("../model/noticeSchema");

// =========================
// GLOBAL SEARCH (Parent self)
// GET /api/parent/search?q=...
//
// Scoped strictly to:
//   - the parent's own linked students (attendance / fees / academic)
//   - notices addressed to "parents" or "all" for the parent's school
// A parent can never search another family's records — every query below
// filters by parent.students or parent.schoolId, never by raw user input.
// =========================
exports.globalSearch = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) {
      return res.status(200).json({ success: true, count: 0, data: [] });
    }
    if (q.length > 100) {
      return res.status(400).json({ message: "Search query too long" });
    }

    const parent = await Parent.findOne({ userId: req.user._id });
    if (!parent) {
      return res.status(403).json({ message: "Access denied" });
    }

    const studentIds = parent.students || [];
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); // escape regex specials

    const results = [];

    // ── Notices (school-wide, audience: parents/all) ────────────────────────
    const notices = await Notice.find({
      schoolId: parent.schoolId,
      audience: { $in: ["parents", "all"] },
      $or: [{ title: regex }, { description: regex }],
    })
      .sort({ createdAt: -1 })
      .limit(8);

    notices.forEach((n) => {
      results.push({
        id: n._id.toString(),
        category: "notice",
        title: n.title,
        subtitle: new Date(n.createdAt).toLocaleDateString(),
        meta: n.isImportant ? "Important" : "Notice",
        path: `/parent/notices/${n._id}`,
      });
    });

    // ── Academic (students by name / class / admission number) ─────────────
    // Mongo can't regex-match across a populate()'d field in one query, so
    // fetch all linked students once (small set — a parent's own children)
    // and filter name/class/section/admissionNumber together in JS.
    if (studentIds.length > 0) {
      const linkedStudents = await Student.find({ _id: { $in: studentIds } })
        .populate("userId", "fullName");

      linkedStudents
        .filter(
          (s) =>
            regex.test(s.userId?.fullName || "") ||
            regex.test(s.class || "") ||
            regex.test(s.section || "") ||
            regex.test(s.admissionNumber || "")
        )
        .forEach((s) => {
          results.push({
            id: s._id.toString(),
            category: "academic",
            title: s.userId?.fullName || "Student",
            subtitle: `Class ${s.class || ""}${s.section ? " " + s.section : ""}`,
            meta: s.admissionNumber || "",
            path: `/parent/reports/${s._id}`,
          });
        });

      // ── Attendance (status / date string match, e.g. "absent", "2025-11") ─
      const attendance = await Attendance.find({
        studentId: { $in: studentIds },
        $or: [{ status: regex }, { date: regex }],
      })
        .sort({ date: -1 })
        .limit(8);

      attendance.forEach((a) => {
        results.push({
          id: a._id.toString(),
          category: "attendance",
          title: `Attendance — ${a.date}`,
          subtitle: a.status,
          meta: a.date,
          path: `/parent/attendance/${a._id}`,
        });
      });

      // ── Fees (status match, e.g. "pending", "paid") ─────────────────────
      const fees = await Fee.find({
        studentId: { $in: studentIds },
        status: regex,
      })
        .sort({ dueDate: 1 })
        .limit(8);

      fees.forEach((f) => {
        results.push({
          id: f._id.toString(),
          category: "fee",
          title: f.feeType || "Fee",
          subtitle: `${f.status} · Due ${f.dueDate ? new Date(f.dueDate).toLocaleDateString() : "N/A"}`,
          meta: `NPR ${f.remainingAmount ?? f.amount ?? 0}`,
          path: `/parent/fees/${f._id}`,
        });
      });
    }

    res.status(200).json({ success: true, count: results.length, data: results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};