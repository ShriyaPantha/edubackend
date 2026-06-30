const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    // Who owns this document
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "ownerModel",
    },
    ownerModel: {
      type: String,
      enum: ["Student", "Teacher", "Parent", "Admin", "School"],
      required: true,
    },
    // Document details
    title: { type: String, required: true, trim: true },
    documentType: {
      type: String,
      enum: [
        // Student
        "marksheet", "certificate", "id_card", "birth_certificate",
        "transfer_certificate", "character_certificate",
        // Teacher
        "cv", "teaching_license", "academic_certificate", "experience_letter",
        // School
        "school_license", "registration", "tax_document",
        // General
        "photo", "other",
      ],
      required: true,
    },
    fileUrl: { type: String, required: true },
    publicId: { type: String, required: true }, // cloudinary public_id for deletion
    fileType: { type: String }, // pdf, jpg, png etc
    fileSize: { type: Number }, // in bytes
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Document", documentSchema);