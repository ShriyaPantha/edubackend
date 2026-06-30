// Calculate grade from percentage
exports.calculateGrade = (percentage) => {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C+";
  if (percentage >= 40) return "C";
  return "F";
};

// Calculate subject grade
exports.calculateSubjectGrade = (obtained, full) => {
  const pct = (obtained / full) * 100;
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B+";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C+";
  if (pct >= 40) return "C";
  return "F";
};

// Process raw marks into full result object
exports.processResult = (studentId, schoolId, exam, rawMarks, remarks) => {
  const { calculateGrade, calculateSubjectGrade } = module.exports;

  const processedMarks = rawMarks.map((m) => ({
    subject: m.subject,
    fullMarks: m.fullMarks,
    passMarks: m.passMarks,
    obtainedMarks: m.obtainedMarks,
    isPassed: m.obtainedMarks >= m.passMarks,
    grade: calculateSubjectGrade(m.obtainedMarks, m.fullMarks),
  }));

  const totalObtained = processedMarks.reduce((s, m) => s + m.obtainedMarks, 0);
  const totalFull = processedMarks.reduce((s, m) => s + m.fullMarks, 0);
  const percentage = Number(((totalObtained / totalFull) * 100).toFixed(2));
  const isPassed = processedMarks.every((m) => m.isPassed);
  const grade = calculateGrade(percentage);

  return {
    examId: exam._id,
    studentId,
    schoolId,
    className: exam.className,
    section: exam.section,
    marks: processedMarks,
    totalObtained,
    totalFull,
    percentage,
    grade,
    isPassed,
    remarks: remarks || "",
  };
};