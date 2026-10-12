const AuditLog = require('../models/AuditLog');
const { asyncHandler } = require('../middlewares/errorHandler');

// GET /api/admin/audit-logs
const getAuditLogs = asyncHandler(async (req, res) => {
  const { action, actorRole, status, page = 1, limit = 50 } = req.query;
  const filter = {};

  if (action) filter.action = action;
  if (actorRole) filter.actorRole = actorRole;
  if (status) filter.status = status;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('actor', 'name email role'),
    AuditLog.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    message: 'Audit logs retrieved',
    data: {
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
  });
});

module.exports = { getAuditLogs };
