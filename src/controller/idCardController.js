const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const Student = require("../model/studentSchema");
const mongoose = require("mongoose");
const sharp = require("sharp");
const axios = require("axios");

// =========================
// HELPER — Download image from URL into buffer
// =========================
const getImageBuffer = async (url) => {
  if (!url) return null;
  try {
    console.log("Fetching image from:", url);   // 👈
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 10000,
    });
    console.log("Fetch status:", response.status, "Size:", response.data.byteLength); // 👈
    const rawBuffer = Buffer.from(response.data);
    const pngBuffer = await sharp(rawBuffer).png().toBuffer();
    console.log("✅ PNG buffer size:", pngBuffer.length);
    return pngBuffer;
  } catch (err) {
    console.log("❌ Image fetch failed:", err.message, err.response?.status); // 👈
    return null;
  }
};

// =========================
// DEFAULT CARD OPTIONS
// =========================
const DEFAULT_OPTIONS = {
  widthInches: 3.375,
  heightInches: 2.125,
  headerColor: "#1A73E8",
  headerTextColor: "#FFFFFF",
  textColor: "#1A1A1A",
  subTextColor: "#555555",
  footerTextColor: "#888888",
  borderColor: "#1A73E8",
  showQrCode: true,
  showPhoto: true,
  showSchoolAddress: true,
  showSchoolPhone: true,
  showValidYear: true,
  cardTitle: "STUDENT IDENTITY CARD",
  fields: ["class", "rollNumber", "admissionNumber", "dob", "phone"],
};

const FIELD_RESOLVERS = {
  class:           (s) => `Class: ${s.class}${s.section ? " - " + s.section : ""}`,
  rollNumber:      (s) => `Roll No: ${s.rollNumber || "N/A"}`,
  admissionNumber: (s) => `Admission No: ${s.admissionNumber || "N/A"}`,
  dob:             (s) => `DOB: ${s.dob ? new Date(s.dob).toLocaleDateString() : "N/A"}`,
  phone:           (s) => `Phone: ${s.phone || "N/A"}`,
  email:           (s) => `Email: ${s.userId?.email || "N/A"}`,
  bloodGroup:      (s) => `Blood Group: ${s.bloodGroup || "N/A"}`,
  address:         (s) => `Address: ${s.address || "N/A"}`,
  guardianName:    (s) => `Guardian: ${s.guardianName || "N/A"}`,
  guardianPhone:   (s) => `Guardian Phone: ${s.guardianPhone || "N/A"}`,
};

const resolveOptions = (input = {}) => {
  const opts = { ...DEFAULT_OPTIONS, ...input };

  ["showQrCode", "showPhoto", "showSchoolAddress", "showSchoolPhone", "showValidYear"].forEach(
    (key) => {
      if (typeof opts[key] === "string") {
        opts[key] = opts[key] === "true";
      }
    }
  );

  if (Array.isArray(input.fields) && input.fields.length) {
    opts.fields = input.fields.filter((f) => FIELD_RESOLVERS[f]);
  } else if (typeof input.fields === "string" && input.fields.length) {
    opts.fields = input.fields.split(",").map((f) => f.trim()).filter((f) => FIELD_RESOLVERS[f]);
  } else {
    opts.fields = DEFAULT_OPTIONS.fields;
  }

  opts.widthInches  = Number(opts.widthInches)  || DEFAULT_OPTIONS.widthInches;
  opts.heightInches = Number(opts.heightInches) || DEFAULT_OPTIONS.heightInches;

  return opts;
};

// =========================
// CORE — Draw the ID card
// =========================
const drawIdCard = async (doc, student, school, cardWidth, cardHeight, studentName, options) => {
  const opts = options;

  // QR code
  let qrBuffer = null;
  if (opts.showQrCode) {
    const qrData = JSON.stringify({
      studentId:       student._id.toString(),
      admissionNumber: student.admissionNumber,
      name:            studentName,
      class:           student.class,
      section:         student.section,
      school:          school.name,
    });
    const qrImage = await QRCode.toDataURL(qrData, { width: 200, margin: 1 });
    qrBuffer = Buffer.from(qrImage.split(",")[1], "base64");
  }

  // Photo
  let photoBuffer = null;
  if (opts.showPhoto) {
    console.log("🖼️  profileImage value:", student.profileImage);
    photoBuffer = await getImageBuffer(student.profileImage);
    console.log("🖼️  photoBuffer is:", photoBuffer ? `Buffer(${photoBuffer.length} bytes)` : "null");
  }

  // Background
  doc.rect(0, 0, cardWidth, cardHeight).fill("#FFFFFF");

  // Header
  doc.rect(0, 0, cardWidth, 38).fill(opts.headerColor);
  doc
    .fillColor(opts.headerTextColor)
    .fontSize(10)
    .font("Helvetica-Bold")
    .text(school.name.toUpperCase(), 8, 6, { width: cardWidth - 16, align: "center" });
  doc
    .fontSize(6)
    .font("Helvetica")
    .text(opts.cardTitle, 8, 22, { width: cardWidth - 16, align: "center" });

  // Photo box
  const photoX    = 10;
  const photoY    = 46;
  const photoSize = 60;
  const detailsX  = opts.showPhoto ? photoX + photoSize + 10 : photoX;

  if (opts.showPhoto) {
    if (photoBuffer) {
      try {
        doc.image(photoBuffer, photoX, photoY, { width: photoSize, height: photoSize });
        console.log("✅ doc.image() succeeded");
      } catch (imgErr) {
        console.log("❌ doc.image() threw error:", imgErr.message);
        doc.rect(photoX, photoY, photoSize, photoSize).fill("#E0E0E0");
        doc.fillColor("#999999").fontSize(7).text("NO PHOTO", photoX, photoY + 25, { width: photoSize, align: "center" });
      }
    } else {
      doc.rect(photoX, photoY, photoSize, photoSize).fill("#E0E0E0");
      doc.fillColor("#999999").fontSize(7).text("NO PHOTO", photoX, photoY + 25, { width: photoSize, align: "center" });
    }
    doc.rect(photoX, photoY, photoSize, photoSize).lineWidth(1).stroke(opts.borderColor);
  }

  // Details
  let detailsY = photoY;
  const qrSize = 55;
  const detailsWidth = cardWidth - detailsX - (opts.showQrCode ? 70 : 10);

  doc
    .fillColor(opts.textColor)
    .fontSize(11)
    .font("Helvetica-Bold")
    .text(studentName, detailsX, detailsY, { width: detailsWidth });

  detailsY += 16;
  doc.fontSize(7).font("Helvetica").fillColor(opts.subTextColor);

  for (const fieldKey of opts.fields) {
    const resolver = FIELD_RESOLVERS[fieldKey];
    if (!resolver) continue;
    doc.text(resolver(student), detailsX, detailsY, { width: detailsWidth });
    detailsY += 11;
  }

  // QR code
  if (opts.showQrCode && qrBuffer) {
    doc.image(qrBuffer, cardWidth - qrSize - 8, cardHeight - qrSize - 8, {
      width: qrSize,
      height: qrSize,
    });
  }

  // Footer
  doc
    .moveTo(0, cardHeight - 22)
    .lineTo(cardWidth, cardHeight - 22)
    .lineWidth(0.5)
    .stroke("#E0E0E0");

  const footerWidth = cardWidth - (opts.showQrCode ? qrSize : 0) - 16;

  if (opts.showSchoolAddress) {
    doc
      .fillColor(opts.footerTextColor)
      .fontSize(6)
      .text(school.address || "", 8, cardHeight - 18, { width: footerWidth });
  }

  if (opts.showSchoolPhone) {
    doc
      .fillColor(opts.footerTextColor)
      .fontSize(6)
      .text(school.phone || "", 8, cardHeight - 10, { width: footerWidth });
  }

  if (opts.showValidYear) {
    doc
      .fontSize(6)
      .font("Helvetica-Bold")
      .fillColor(opts.headerColor)
      .text(`Valid: ${new Date().getFullYear()}`, cardWidth - 60, cardHeight - 18, {
        width: 50,
        align: "right",
      });
  }
};

// =========================
// GENERATE SINGLE STUDENT ID CARD (Admin)
// =========================
exports.generateStudentIdCard = async (req, res) => {
  try {
    const adminSchoolId = req.admin.schoolId;
    const options = resolveOptions({ ...req.query, ...req.body });

    const student = await Student.findOne({
      _id: req.params.id,
      schoolId: adminSchoolId,
    })
      .populate("userId", "fullName email")
      .populate("schoolId", "name address phone email");

    if (!student) {
      return res.status(404).json({ message: "Student not found for this school" });
    }

    const school      = student.schoolId;
    const studentName = student.userId.fullName;
    const cardWidth   = options.widthInches * 72;
    const cardHeight  = options.heightInches * 72;

    const doc = new PDFDocument({ size: [cardWidth, cardHeight], margin: 0 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ID-${student.admissionNumber || student._id}.pdf"`
    );

    doc.pipe(res);
    await drawIdCard(doc, student, school, cardWidth, cardHeight, studentName, options);
    doc.end();
  } catch (err) {
    console.error("❌ generateStudentIdCard error:", err);
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GENERATE BULK ID CARDS (Admin)
// =========================
exports.generateBulkIdCards = async (req, res) => {
  try {
    const adminSchoolId = req.admin.schoolId;
    const { class: className, section, ...rest } = req.query;
    const options = resolveOptions({ ...rest, ...req.body });

    if (!className) {
      return res.status(400).json({ message: "class query param is required" });
    }

    let filter = { schoolId: adminSchoolId, class: className };
    if (section) filter.section = section;

    const students = await Student.find(filter)
      .populate("userId", "fullName")
      .populate("schoolId", "name address phone");

    if (!students.length) {
      return res.status(404).json({ message: "No students found" });
    }

    const school     = students[0].schoolId;
    const cardWidth  = options.widthInches * 72;
    const cardHeight = options.heightInches * 72;

    const doc = new PDFDocument({
      size: [cardWidth, cardHeight],
      margin: 0,
      autoFirstPage: false,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ID-Cards-${className}${section ? "-" + section : ""}.pdf"`
    );

    doc.pipe(res);

    for (const student of students) {
      doc.addPage();
      await drawIdCard(doc, student, school, cardWidth, cardHeight, student.userId.fullName, options);
    }

    doc.end();
  } catch (err) {
    console.error("❌ generateBulkIdCards error:", err);
    res.status(500).json({ message: err.message });
  }
};

// =========================
// GENERATE MY ID CARD (Student self)
// =========================
exports.generateMyIdCard = async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user._id })
      .populate("userId", "fullName email")
      .populate("schoolId", "name address phone email");

    if (!student) {
      return res.status(404).json({ message: "Student profile not found" });
    }
    console.log("profileImage from DB:", student.profileImage);

    // Allow overriding photo URL via query param
    if (req.query.profileImage) {
      student.profileImage = req.query.profileImage;
    }

    const options    = resolveOptions({ ...req.query, ...req.body });
    const school     = student.schoolId;
    const cardWidth  = options.widthInches * 72;
    const cardHeight = options.heightInches * 72;

    const doc = new PDFDocument({ size: [cardWidth, cardHeight], margin: 0 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ID-${student.admissionNumber ?? student._id}.pdf"`
    );

    doc.pipe(res);
    await drawIdCard(doc, student, school, cardWidth, cardHeight, student.userId.fullName, options);
    doc.end();
  } catch (err) {
    console.error("❌ generateMyIdCard error:", err);
    res.status(500).json({ message: err.message });
  }
};