const jwt = require("jsonwebtoken");
const Admin = require("../model/adminSchema");
const User = require("../model/userSchema");

exports.protectAdmin = async (req, res, next) => {
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

    const admin = await Admin.findById(decoded.id);

    if (!admin) {
      return res.status(401).json({ message: "Admin not found" });
    }

 

    if (!admin.isActive) {
      return res.status(403).json({ message: "Account deactivated" });
    }

    if (!admin.schoolId) {
      return res.status(403).json({
        message: "Admin has no school assigned",
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// ─── Superadmin middleware ────────────────────────────────────────────────────
exports.protectSuperAdmin = async (req, res, next) => {
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

    // ── Look in User collection, not Admin ────────────────────────────────
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.role !== "superadmin") {
      return res.status(403).json({
        message: "Access denied. Superadmin privileges required.",
      });
    }

    req.user       = user;
    req.superAdmin = user;
    next();

  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};