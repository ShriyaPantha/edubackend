const jwt = require("jsonwebtoken");
const Receptionist = require("../model/receptionistSchema");

exports.protectReceptionist = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const receptionist = await Receptionist.findOne({ userId: decoded.id })
      .populate("userId", "fullName email role")
      .populate("schoolId", "name");

    if (!receptionist) {
      return res.status(401).json({ message: "Receptionist not found" });
    }

    if (receptionist.status === "inactive") {
      return res.status(403).json({ message: "Account deactivated. Contact admin." });
    }

    req.receptionist = receptionist;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

// Permission checker middleware
exports.checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.receptionist.permissions[permission]) {
      return res.status(403).json({
        message: `Access denied. You don't have permission to ${permission}.`,
      });
    }
    next();
  };
};