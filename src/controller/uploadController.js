const Document = require("../model/documentSchema");
const User = require("../model/userSchema");
const Student = require("../model/studentSchema");
const Teacher = require("../model/teacherSchema");
const Parent = require("../model/parentSchema");
const Admin = require("../model/adminSchema");
const { cloudinary } = require("../config/cloudinaryConfig");

// =========================
// UPLOAD DOCUMENT
// =========================
exports.uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uxploaded" });
    }

    const { ownerId, ownerModel, title, documentType } = req.body;

    if (!ownerId || !ownerModel || !title || !documentType) {
      return res.status(400).json({ message: "ownerId, ownerModel, title and documentType are required" });
    }

    const adminSchoolId = req.admin?.schoolId || req.receptionist?.schoolId?._id;

    if (!adminSchoolId) {
      return res.status(403).json({ message: "School context missing for this request" });
    }

    const document = await Document.create({
      schoolId: adminSchoolId,
      ownerId,
      ownerModel,
      title,
      documentType,
      fileUrl: req.file.path,
      publicId: req.file.filename,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedBy: req.admin?._id || req.user?._id,
    });

    res.status(201).json({
      success: true,
      message: "Document uploaded successfully",
      data: document,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// UPLOAD PROFILE PHOTO
// Works for Student, Teacher, Parent, Admin
// =========================
exports.uploadPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No photo uploaded" });
    }

    const { type, id } = req.params;
    const photoUrl = req.file.path;
    let updated;

    if (type === "student") {
      updated = await Student.findByIdAndUpdate(
        id,
        { profileImage: photoUrl },
        { returnDocument: "after" }
      ).populate("userId", "fullName email");
    } else if (type === "teacher") {
      updated = await Teacher.findByIdAndUpdate(
        id,
        { profileImage: photoUrl },
        { returnDocument: "after" }
      ).populate("userId", "fullName email");
    } else if (type === "parent") {
      updated = await Parent.findByIdAndUpdate(
        id,
        { profileImage: photoUrl },
        { returnDocument: "after" }
      ).populate("userId", "fullName email");
    } else if (type === "admin") {
      updated = await Admin.findByIdAndUpdate(
        id,
        { profileImage: photoUrl },
        { returnDocument: "after" }
      );
    } else {
      return res.status(400).json({ message: "Invalid type. Use: student, teacher, parent, admin" });
    }

    if (!updated) {
      return res.status(404).json({ message: `${type} not found` });
    }

    res.status(200).json({
      success: true,
      message: "Photo uploaded successfully",
      photoUrl,
      data: updated,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// UPLOAD MY PHOTO (Self)
// Student/Teacher/Parent uploads own photo
// =========================
exports.uploadMyPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No photo uploaded" });
    }

    const photoUrl = req.file.path;
    const role = req.user.role;
    let updated;

    if (role === "student") {
      updated = await Student.findOneAndUpdate(
        { userId: req.user._id },
        { profileImage: photoUrl },
        { new: true }              // ✅ correct Mongoose option
      );
    } else if (role === "teacher") {
      updated = await Teacher.findOneAndUpdate(
        { userId: req.user._id },
        { profileImage: photoUrl },
        { new: true }              // ✅
      );
    } else if (role === "parent") {
      updated = await Parent.findOneAndUpdate(
        { userId: req.user._id },
        { profileImage: photoUrl },
        { new: true }              // ✅
      );
    } else {
      return res.status(400).json({ message: "Role not supported for self photo upload" });
    }

    if (!updated) {
      return res.status(404).json({ message: `${role} profile not found` });
    }

    res.status(200).json({
      success: true,
      message: "Profile photo updated",
      photoUrl,
      data: updated,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
// =========================
// GET DOCUMENTS (Admin)
// =========================
exports.getDocuments = async (req, res) => {
  try {
    const { ownerId, ownerModel, documentType } = req.query;
    const adminSchoolId = req.admin.schoolId;

    let filter = { schoolId: adminSchoolId };
    if (ownerId) filter.ownerId = ownerId;
    if (ownerModel) filter.ownerModel = ownerModel;
    if (documentType) filter.documentType = documentType;

    const documents = await Document.find(filter)
      .populate("uploadedBy", "fullName role")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: documents.length,
      data: documents,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// =========================
// DELETE DOCUMENT (Admin)
// =========================
exports.deleteDocument = async (req, res) => {
  try {
    const document = await Document.findOne({
      _id: req.params.id,
      schoolId: req.admin.schoolId,
    });

    if (!document) return res.status(404).json({ message: "Document not found" });

    await cloudinary.uploader.destroy(document.publicId, {
      resource_type: document.fileType?.includes("pdf") ? "raw" : "image",
    });

    await Document.findByIdAndDelete(req.params.id);

    res.status(200).json({ success: true, message: "Document deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};