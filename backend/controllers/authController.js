const User = require('../models/User');
const Doctor = require('../models/Doctor');
const generateToken = require('../utils/generateToken');
const { isValidEmail } = require('../utils/validators');
const { HttpError, asyncHandler } = require('../middlewares/errorHandler');
const { createDoctorAccount } = require('./doctorController');
const { clearCache } = require('../config/redis');

const doctorPopulate = [
  { path: 'department', select: 'name' },
];

// POST /api/auth/register  (public: patient or doctor; admins are never self-created)
const register = asyncHandler(async (req, res) => {
  const { name, email, password, role = 'patient', phone } = req.body;

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

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    data: { token: generateToken(user._id), user, doctor },
  });
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!isValidEmail(email) || typeof password !== 'string' || !password) {
    throw new HttpError(400, 'Email and password are required');
  }
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  if (!user.isActive) throw new HttpError(403, 'Account is deactivated');

  const doctor = user.role === 'doctor' ? await Doctor.findOne({ user: user._id }).populate(doctorPopulate) : null;
  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: { token: generateToken(user._id), user, doctor },
  });
});

// GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  const doctor =
    req.user.role === 'doctor' ? await Doctor.findOne({ user: req.user._id }).populate(doctorPopulate) : null;
  res.status(200).json({ success: true, message: 'Current user', data: { user: req.user, doctor } });
});

module.exports = { register, login, getMe };
