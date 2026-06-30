exports.getUsersForStudentPicker = async (req, res) => {
  try {
    const User = require("../model/userSchema");
    const Student = require("../model/studentSchema");
 
    // Get all users that are NOT already students
    const existingStudentUserIds = await Student.find({
      schoolId: req.admin.schoolId,
    }).distinct("userId");
 
    const users = await User.find(
      {
        _id: { $nin: existingStudentUserIds }, // exclude already-linked users
        role: { $in: ["user", "student"] },    // adjust roles as needed
      },
      "fullName email _id"                     // only send what UI needs
    ).limit(100);
 
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};