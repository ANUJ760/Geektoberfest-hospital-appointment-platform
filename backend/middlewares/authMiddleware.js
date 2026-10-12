const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { HttpError, asyncHandler } = require('./errorHandler');

/** Extract client IP, User-Agent, and formatted device label */
const extractClientInfo = (req) => {
  const ipAddress =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown Client';

  let deviceInfo = 'Unknown Device';
  if (/mobile|iphone|ipad|android/i.test(userAgent)) {
    deviceInfo = 'Mobile Device';
  } else if (/windows/i.test(userAgent)) {
    deviceInfo = 'Windows PC';
  } else if (/macintosh|mac os/i.test(userAgent)) {
    deviceInfo = 'Mac';
  } else if (/linux/i.test(userAgent)) {
    deviceInfo = 'Linux PC';
  } else if (/postman/i.test(userAgent)) {
    deviceInfo = 'Postman API Client';
  }

  return { ipAddress, userAgent, deviceInfo };
};

/** Lightweight cookie parser middleware */
const parseCookies = (req, res, next) => {
  req.cookies = req.cookies || {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      const name = parts.shift().trim();
      const val = decodeURIComponent(parts.join('='));
      if (name) req.cookies[name] = val;
    });
  }
  next();
};

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
});

/** Require a valid Bearer token; attaches the user document to req.user. */
const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    throw new HttpError(401, 'Not authenticated: token missing');
  }
  let decoded;
  try {
    decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch (e) {
    throw new HttpError(401, 'Not authenticated: invalid or expired token');
  }
  const user = await User.findById(decoded.id);
  if (!user) throw new HttpError(401, 'Not authenticated: user no longer exists');
  if (!user.isActive) {
    const { ipAddress, userAgent } = extractClientInfo(req);
    AuditLog.log({
      action: 'LOGIN_DEACTIVATED',
      actor: user._id,
      actorRole: user.role,
      status: 'FAILURE',
      ipAddress,
      userAgent,
      details: { path: req.originalUrl },
    });
    throw new HttpError(403, 'Account is deactivated');
  }
  req.user = user;
  next();
});

module.exports = {
  protect,
  extractClientInfo,
  parseCookies,
  getCookieOptions,
};
