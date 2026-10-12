const { HttpError } = require('./errorHandler');
const AuditLog = require('../models/AuditLog');

/** Allow only the listed roles. Must run after `protect`. */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Not authenticated'));
  if (!roles.includes(req.user.role)) {
    AuditLog.log({
      action: 'RBAC_ACCESS_DENIED',
      actor: req.user._id,
      actorRole: req.user.role,
      status: 'WARNING',
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
      details: {
        path: req.originalUrl,
        method: req.method,
        requiredRoles: roles,
      },
    });
    return next(new HttpError(403, `Role '${req.user.role}' is not allowed to access this resource`));
  }
  next();
};

module.exports = { authorize };

