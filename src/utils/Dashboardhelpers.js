const Admin = require("../model/adminSchema");

// JWT payload for an admin only contains { id: admin._id, role }.
// Most dashboard queries need schoolId (and some need the linked User._id),
// so resolve those once per request here.
exports.getAdminContext = async (req) => {
  const admin = req.admin; // set by protectAdmin — no extra DB query
  if (!admin) {
    const err = new Error("Admin not found");
    err.status = 404;
    throw err;
  }
  return {
    adminId: admin._id,
    schoolId: admin.schoolId,
    userId: admin.userId,
  };
};
exports.getAdminDasboardContext = async (req) => {
  const admin = req.user; // was req.admin
  if (!admin) {
    const err = new Error("Admin not found");
    err.status = 404;
    throw err;
  }
  return {
    adminId: admin._id,
    schoolId: admin.schoolId,
    userId: admin.userId,
  };
};
// Counts documents matching `filter` as of right now, and as of the end of
// last month, then returns a % change. Used for "growth" badges on stat cards.
exports.computeGrowth = async (Model, filter, dateField = "createdAt") => {
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfLastMonth = new Date(startOfThisMonth.getTime() - 1);

  const [currentTotal, lastMonthTotal] = await Promise.all([
    Model.countDocuments(filter),
    Model.countDocuments({ ...filter, [dateField]: { $lte: endOfLastMonth } }),
  ]);

  let changePercent = 0;
  if (lastMonthTotal > 0) {
    changePercent = ((currentTotal - lastMonthTotal) / lastMonthTotal) * 100;
  } else if (currentTotal > 0) {
    changePercent = 100;
  }

  return {
    total: currentTotal,
    changePercent: Math.round(changePercent * 10) / 10,
    positive: changePercent >= 0,
  };
};

// Sums a numeric field for documents matching filter, comparing this month vs last month.
exports.computeSumGrowth = async (Model, filter, sumField, dateField = "createdAt") => {
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [thisMonthAgg, lastMonthAgg] = await Promise.all([
    Model.aggregate([
      { $match: { ...filter, [dateField]: { $gte: startOfThisMonth } } },
      { $group: { _id: null, sum: { $sum: `$${sumField}` } } },
    ]),
    Model.aggregate([
      { $match: { ...filter, [dateField]: { $gte: startOfLastMonth, $lt: startOfThisMonth } } },
      { $group: { _id: null, sum: { $sum: `$${sumField}` } } },
    ]),
  ]);

  const thisMonthSum = thisMonthAgg[0]?.sum || 0;
  const lastMonthSum = lastMonthAgg[0]?.sum || 0;

  let changePercent = 0;
  if (lastMonthSum > 0) {
    changePercent = ((thisMonthSum - lastMonthSum) / lastMonthSum) * 100;
  } else if (thisMonthSum > 0) {
    changePercent = 100;
  }

  return {
    thisMonthSum,
    changePercent: Math.round(changePercent * 10) / 10,
    positive: changePercent >= 0,
  };
};