const cloudinary = require("cloudinary").v2;
const CloudinaryStorage  = require("multer-storage-cloudinary");
const multer = require("multer");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

//Photo upload (jpg/png only, max 2MB)
const photoStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: `school-saas/photos/${req.params.type || "general"}`,
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 400, height: 400, crop: "fill" }],
    public_id: `${Date.now()}-${file.originalname.split(".")[0]}`,
  }),
});

//Document upload (pdf/doc/docx/jpg/png, max 5MB)
const documentStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: `school-saas/documents/${req.params.type || "general"}`,
    allowed_formats: ["pdf", "jpg", "jpeg", "png", "doc", "docx"],
    resource_type: "auto",
    public_id: `${Date.now()}-${file.originalname.split(".")[0]}`,
  }),
});

const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

const documentUpload = multer({
  storage: documentStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

module.exports = { cloudinary, photoUpload, documentUpload };