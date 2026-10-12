const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { HttpError, asyncHandler } = require('./errorHandler');

/** Require a valid Bearer token; attaches the user document to req.user. */
const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  let token = '';
  if (header.startsWith('Bearer ')) {
    token = header.slice(7);
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    throw new HttpError(401, 'Not authenticated: token missing');
  }
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    throw new HttpError(401, 'Not authenticated: invalid or expired token');
  }
  const user = await User.findById(decoded.id);
  if (!user) throw new HttpError(401, 'Not authenticated: user no longer exists');
  if (!user.isActive) throw new HttpError(403, 'Account is deactivated');
  req.user = user;
  next();
});

module.exports = { protect };
