const User = require('../models/User');
const Doctor = require('../models/Doctor');
const RefreshToken = require('../models/RefreshToken');
const AuditLog = require('../models/AuditLog');
const generateToken = require('../utils/generateToken');
const { isValidEmail } = require('../utils/validators');
const { HttpError, asyncHandler } = require('../middlewares/errorHandler');
const { extractClientInfo, getCookieOptions } = require('../middlewares/authMiddleware');
const { createDoctorAccount } = require('./doctorController');
const { clearCache } = require('../config/redis');

const doctorPopulate = [{ path: 'department', select: 'name' }];

// POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const { name, email, password, role = 'patient', phone } = req.body;
  const clientInfo = extractClientInfo(req);

  if (role === 'admin') throw new HttpError(403, 'Admin accounts cannot be created via registration');
  if (!['patient', 'doctor'].includes(role)) throw new HttpError(400, 'Role must be patient or doctor');
  if (!name || !String(name).trim()) throw new HttpError(400, 'Name is required');
  if (!isValidEmail(email)) throw new HttpError(400, 'A valid email is required');
  if (typeof password !== 'string' || password.length < 6) {
    throw new HttpError(400, 'Password must be at least 6 characters');
  }
  if (await User.findOne({ email: email.toLowerCase().trim() })) {
    throw new HttpError(409, 'Email is already registered');
  }

  let user;
  let doctor = null;
  if (role === 'doctor') {
    ({ user, doctor } = await createDoctorAccount({ ...req.body, name, email, password, phone }));
    await clearCache('doctors:*');
  } else {
    user = await User.create({ name, email, password, role: 'patient', phone });
  }

  const accessToken = generateToken(user._id);
  const refreshTokenDoc = await RefreshToken.createToken({
    user: user._id,
    ...clientInfo,
  });

  res.cookie('refreshToken', refreshTokenDoc.token, getCookieOptions());

  await AuditLog.log({
    action: 'REGISTER',
    actor: user._id,
    actorRole: user.role,
    status: 'SUCCESS',
    ipAddress: clientInfo.ipAddress,
    userAgent: clientInfo.userAgent,
    targetResource: 'User',
    targetId: user._id,
  });

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    data: {
      token: accessToken,
      refreshToken: refreshTokenDoc.token,
      user,
      doctor,
    },
  });
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const clientInfo = extractClientInfo(req);

  if (!isValidEmail(email) || typeof password !== 'string' || !password) {
    throw new HttpError(400, 'Email and password are required');
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    await AuditLog.log({
      action: 'LOGIN_FAILURE',
      actorRole: 'anonymous',
      status: 'FAILURE',
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
      details: { email },
    });
    throw new HttpError(401, 'Invalid email or password');
  }

  if (!user.isActive) {
    await AuditLog.log({
      action: 'LOGIN_DEACTIVATED',
      actor: user._id,
      actorRole: user.role,
      status: 'FAILURE',
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });
    throw new HttpError(403, 'Account is deactivated');
  }

  const doctor = user.role === 'doctor' ? await Doctor.findOne({ user: user._id }).populate(doctorPopulate) : null;
  const accessToken = generateToken(user._id);
  const refreshTokenDoc = await RefreshToken.createToken({
    user: user._id,
    ...clientInfo,
  });

  res.cookie('refreshToken', refreshTokenDoc.token, getCookieOptions());

  await AuditLog.log({
    action: 'LOGIN',
    actor: user._id,
    actorRole: user.role,
    status: 'SUCCESS',
    ipAddress: clientInfo.ipAddress,
    userAgent: clientInfo.userAgent,
    targetResource: 'User',
    targetId: user._id,
  });

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: {
      token: accessToken,
      refreshToken: refreshTokenDoc.token,
      user,
      doctor,
    },
  });
});

// POST /api/auth/refresh (Refresh Token Rotation with Replay Attack Detection)
const refreshToken = asyncHandler(async (req, res) => {
  const clientInfo = extractClientInfo(req);
  const tokenStr =
    req.cookies?.refreshToken || req.body?.refreshToken || req.headers['x-refresh-token'];

  if (!tokenStr) {
    throw new HttpError(401, 'Refresh token required');
  }

  const tokenDoc = await RefreshToken.findOne({ token: tokenStr });

  if (!tokenDoc) {
    await AuditLog.log({
      action: 'TOKEN_REFRESH_FAILURE',
      status: 'FAILURE',
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
      details: { reason: 'Token not found' },
    });
    throw new HttpError(401, 'Invalid refresh token');
  }

  // Token reuse detection (compromise / replay attack)
  if (tokenDoc.isRevoked) {
    await RefreshToken.updateMany(
      { family: tokenDoc.family },
      { isRevoked: true, revokedAt: new Date() }
    );
    res.clearCookie('refreshToken', { path: '/' });

    await AuditLog.log({
      action: 'TOKEN_REUSE_DETECTED',
      actor: tokenDoc.user,
      status: 'WARNING',
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
      details: {
        family: tokenDoc.family,
        revokedToken: tokenStr,
      },
    });

    throw new HttpError(403, 'Compromised session detected: all related sessions revoked');
  }

  if (tokenDoc.expiresAt < new Date()) {
    throw new HttpError(401, 'Refresh token has expired');
  }

  const user = await User.findById(tokenDoc.user);
  if (!user || !user.isActive) {
    throw new HttpError(401, 'User account is no longer active');
  }

  // Rotate token: create new token in the same family, revoke old token
  const newTokenDoc = await RefreshToken.createToken({
    user: user._id,
    family: tokenDoc.family,
    ...clientInfo,
  });

  await tokenDoc.revoke(newTokenDoc.token);

  const newAccessToken = generateToken(user._id);
  res.cookie('refreshToken', newTokenDoc.token, getCookieOptions());

  await AuditLog.log({
    action: 'TOKEN_REFRESH',
    actor: user._id,
    actorRole: user.role,
    status: 'SUCCESS',
    ipAddress: clientInfo.ipAddress,
    userAgent: clientInfo.userAgent,
    details: { family: tokenDoc.family },
  });

  res.status(200).json({
    success: true,
    message: 'Token refreshed successfully',
    data: {
      token: newAccessToken,
      refreshToken: newTokenDoc.token,
    },
  });
});

// POST /api/auth/logout
const logout = asyncHandler(async (req, res) => {
  const clientInfo = extractClientInfo(req);
  const tokenStr =
    req.cookies?.refreshToken || req.body?.refreshToken || req.headers['x-refresh-token'];

  if (tokenStr) {
    const tokenDoc = await RefreshToken.findOne({ token: tokenStr });
    if (tokenDoc && !tokenDoc.isRevoked) {
      await tokenDoc.revoke();
    }
  }

  res.clearCookie('refreshToken', { path: '/' });

  if (req.user) {
    await AuditLog.log({
      action: 'LOGOUT',
      actor: req.user._id,
      actorRole: req.user.role,
      status: 'SUCCESS',
      ipAddress: clientInfo.ipAddress,
      userAgent: clientInfo.userAgent,
    });
  }

  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

// GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  const doctor =
    req.user.role === 'doctor' ? await Doctor.findOne({ user: req.user._id }).populate(doctorPopulate) : null;
  res.status(200).json({ success: true, message: 'Current user', data: { user: req.user, doctor } });
});

// GET /api/auth/sessions (List active device sessions for current user)
const getSessions = asyncHandler(async (req, res) => {
  const currentToken =
    req.cookies?.refreshToken || req.body?.refreshToken || req.headers['x-refresh-token'];

  const sessions = await RefreshToken.find({
    user: req.user._id,
    isRevoked: false,
    expiresAt: { $gt: new Date() },
  })
    .sort({ updatedAt: -1 })
    .select('deviceInfo ipAddress userAgent createdAt updatedAt expiresAt family');

  res.status(200).json({
    success: true,
    message: 'Active sessions retrieved',
    data: sessions,
  });
});

// DELETE /api/auth/sessions/:sessionId (Revoke a single session)
const revokeSession = asyncHandler(async (req, res) => {
  const clientInfo = extractClientInfo(req);
  const session = await RefreshToken.findById(req.params.sessionId);

  if (!session) {
    throw new HttpError(404, 'Session not found');
  }

  if (String(session.user) !== String(req.user._id) && req.user.role !== 'admin') {
    throw new HttpError(403, 'Cannot revoke session belonging to another user');
  }

  await session.revoke();

  await AuditLog.log({
    action: 'SESSION_REVOKED',
    actor: req.user._id,
    actorRole: req.user.role,
    targetResource: 'Session',
    targetId: session._id,
    status: 'SUCCESS',
    ipAddress: clientInfo.ipAddress,
    userAgent: clientInfo.userAgent,
  });

  res.status(200).json({ success: true, message: 'Session revoked successfully' });
});

// DELETE /api/auth/sessions (Revoke all active sessions for current user)
const revokeAllSessions = asyncHandler(async (req, res) => {
  const clientInfo = extractClientInfo(req);

  await RefreshToken.updateMany(
    { user: req.user._id, isRevoked: false },
    { isRevoked: true, revokedAt: new Date() }
  );

  res.clearCookie('refreshToken', { path: '/' });

  await AuditLog.log({
    action: 'ALL_SESSIONS_REVOKED',
    actor: req.user._id,
    actorRole: req.user.role,
    targetResource: 'Session',
    status: 'SUCCESS',
    ipAddress: clientInfo.ipAddress,
    userAgent: clientInfo.userAgent,
  });

  res.status(200).json({ success: true, message: 'All active sessions revoked successfully' });
});

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  getSessions,
  revokeSession,
  revokeAllSessions,
};
