const Notice = require("../model/noticeSchema");
const User = require("../model/userSchema");
const Student = require("../model/studentSchema");
const Teacher = require("../model/teacherSchema");
const Parent = require("../model/parentSchema");
const School = require("../model/schoolSchema");
const { notify, notifyMany, noticeEmailTemplate } = require("../services/notificationService");

// =========================
// CREATE NOTICE + NOTIFY
// Admin creates notice → notifies target audience
// =========================
exports.createNotice = async (req, res) => {
  try {
    const { title, description, audience, isImportant, expiryDate } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: "title and description are required" });
    }

    const adminSchoolId = req.admin.schoolId;
    const school = await School.findById(adminSchoolId).select("name");

    const notice = await Notice.create({
      title,
      description,
      audience: audience || "all",
      isImportant: isImportant || false,
      expiryDate: expiryDate || null,
      schoolId: adminSchoolId,
      createdBy: req.admin._id,
    });

    const notifyTitle = `${isImportant ? "⚠️ Important Notice" : "📢 Notice"}: ${title}`;
    const shouldNotifyStudents = audience === "students" || audience === "all";
    const shouldNotifyTeachers = audience === "teachers" || audience === "all";
    const shouldNotifyParents  = audience === "parents"  || audience === "all";

    const sendToGroup = async (docs) => {
      for (const doc of docs) {
        if (!doc.userId) continue;
        await notify({
          recipient: doc.userId._id,
          schoolId: adminSchoolId,
          title: notifyTitle,
          message: description.substring(0, 200),
          type: "general",
          refId: notice._id,
          refModel: null,
          email: doc.userId.email,
          emailHtml: noticeEmailTemplate({
            recipientName: doc.userId.fullName,
            noticeTitle: title,
            description,
            isImportant,
            publishDate: notice.createdAt,
            schoolName: school.name,
          }),
        });
      }
    };

    if (shouldNotifyStudents) {
      const students = await Student.find({ schoolId: adminSchoolId }).populate("userId", "_id email fullName");
      await sendToGroup(students);
    }
    if (shouldNotifyTeachers) {
      const teachers = await Teacher.find({ schoolId: adminSchoolId }).populate("userId", "_id email fullName");
      await sendToGroup(teachers);
    }
    if (shouldNotifyParents) {
      const parents = await Parent.find({ schoolId: adminSchoolId }).populate("userId", "_id email fullName");
      await sendToGroup(parents);
    }

    res.status(201).json({
      success: true,
      message: `Notice created and notifications sent.`,
      data: notice,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET ALL NOTICES (Admin)
// =========================
exports.getNotices = async (req, res) => {
  try {
    const adminSchoolId = req.admin.schoolId;
    const { audience } = req.query;

    let filter = { schoolId: adminSchoolId };
    if (audience) filter.audience = audience;

    const notices = await Notice.find(filter)
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: notices.length,
      data: notices,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET MY NOTICES (Student/Teacher/Parent)
// =========================
exports.getMyNotices = async (req, res) => {
  try {
    let userRole = req.user.role;
    let schoolId;

    // Determine schoolId based on role
    if (userRole === "student") {
      const student = await Student.findOne({ userId: req.user._id });
      schoolId = student?.schoolId;
    } else if (userRole === "teacher") {
      const teacher = await Teacher.findOne({ userId: req.user._id });
      schoolId = teacher?.schoolId;
    } else if (userRole === "parent") {
      const parent = await Parent.findOne({ userId: req.user._id });
      schoolId = parent?.schoolId;
    }

    if (!schoolId) return res.status(403).json({ message: "Access denied" });

    // Filter by audience relevant to this user's role
    const audienceFilter = [userRole + "s", "all"];

    const notices = await Notice.find({
      schoolId,
      audience: { $in: audienceFilter },
      $or: [
        { expiryDate: null },
        { expiryDate: { $gte: new Date() } }, // not expired
      ],
    }).sort({ isImportant: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: notices.length,
      data: notices,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GET SINGLE NOTICE
// =========================
exports.getNoticeById = async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id)
      .populate("createdBy", "fullName email");

    if (!notice) return res.status(404).json({ message: "Notice not found" });

    res.status(200).json({ success: true, data: notice });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// UPDATE NOTICE (Admin)
// =========================
exports.updateNotice = async (req, res) => {
  try {
    const notice = await Notice.findOneAndUpdate(
      { _id: req.params.id, schoolId: req.admin.schoolId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!notice) return res.status(404).json({ message: "Notice not found" });

    res.status(200).json({ success: true, message: "Notice updated", data: notice });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// DELETE NOTICE (Admin)
// =========================
exports.deleteNotice = async (req, res) => {
  try {
    const notice = await Notice.findOneAndDelete({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
    });

    if (!notice) return res.status(404).json({ message: "Notice not found" });

    res.status(200).json({ success: true, message: "Notice deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
