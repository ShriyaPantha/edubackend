// src/controller/auditLogsController.js
const AuditLog = require("../model/AuditLog");

// ─── Get All Audit Logs ───────────────────────────────────────────────────────

const getAuditLogs = async (req, res) => {
  try {
    const { category, status, limit = 200 } = req.query;
    const filter = {};
    if (category && category !== "All") filter.category = category;
    if (status   && status   !== "All") filter.status   = status;

    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    const shaped = logs.map((l) => ({
      _id:      l._id,
      action:   l.action,
      user:     l.user,
      role:     l.role,
      category: l.category,
      status:   l.status,
      ip:       l.ip,
      meta:     l.meta,
      date: new Date(l.createdAt).toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      }),
      time: new Date(l.createdAt).toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit",
      }),
    }));

    return res.status(200).json({ success: true, data: shaped });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── Create Audit Log (manual / internal) ────────────────────────────────────

const createAuditLog = async (req, res) => {
  try {
    const log = await AuditLog.create(req.body);
    return res.status(201).json({ success: true, data: log });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Delete All Audit Logs (superadmin only) ──────────────────────────────────

const clearAuditLogs = async (req, res) => {
  try {
    await AuditLog.deleteMany({});
    return res.status(200).json({ success: true, message: "All audit logs cleared." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Fire-and-forget logger (call from other controllers) ─────────────────────

const logAudit = async ({
  action,
  user     = "System",
  userId   = null,
  role     = "system",
  category = "User",
  status   = "success",
  req      = null,
  meta     = null,
} = {}) => {
  try {
    await AuditLog.create({
      action,
      user,
      userId,
      role,
      category,
      status,
      ip:   req?.ip ?? req?.headers?.["x-forwarded-for"] ?? null,
      meta,
    });
  } catch (err) {
    // Never crash the caller
    console.error("[AuditLog] Failed to write:", err.message);
  }
};

module.exports = {
  getAuditLogs,
  createAuditLog,
  clearAuditLogs,
  logAudit,         // ← import this in other controllers
};