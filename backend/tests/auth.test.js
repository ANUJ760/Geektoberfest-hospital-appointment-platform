process.env.JWT_SECRET = 'test_secret_for_auth_tests_1234567890';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Department = require('../models/Department');
const RefreshToken = require('../models/RefreshToken');
const AuditLog = require('../models/AuditLog');
const { errorHandler } = require('../middlewares/errorHandler');
const { REFRESH_COOKIE_NAME } = require('../utils/tokenUtils');
const { register, login } = require('../controllers/authController');

const makeRequest = (body, originalUrl) => ({
  method: 'POST',
  originalUrl,
  body,
  headers: { 'user-agent': 'auth-test' },
  cookies: {},
  ip: '127.0.0.1',
  requestId: 'auth-test-request',
  get(name) {
    return this.headers[name.toLowerCase()];
  },
});

const execute = async (handler, req) => {
  let status = 200;
  let body;
  const cookies = [];
  const res = {
    status(code) {
      status = code;
      return res;
    },
    json(payload) {
      body = payload;
      return res;
    },
    cookie(name, value, options) {
      cookies.push({ name, value, options });
      return res;
    },
  };
  const error = await new Promise((resolve) => {
    handler(req, res, resolve).then(() => resolve(null)).catch(resolve);
  });
  if (error) errorHandler(error, req, res, () => {});
  return { status, body, cookies };
};

const stub = (t, model, method, implementation) => {
  const original = model[method];
  model[method] = implementation;
  t.after(() => {
    model[method] = original;
  });
};

const stubAuditAndSession = (t) => {
  stub(t, AuditLog, 'create', async (entry) => entry);
  stub(t, RefreshToken, 'create', async (entry) => entry);
};

test('registers a patient and returns an authenticated response', async (t) => {
  stubAuditAndSession(t);
  const user = { _id: '507f1f77bcf86cd799439011', role: 'patient', isActive: true };
  stub(t, User, 'findOne', async () => null);
  stub(t, User, 'create', async (data) => ({ ...user, ...data }));

  const result = await execute(
    register,
    makeRequest(
      { name: 'Test Patient', email: 'patient@example.com', password: 'secret123', role: 'patient' },
      '/api/auth/register'
    )
  );

  assert.equal(result.status, 201);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.user.role, 'patient');
  assert.ok(result.cookies.some(({ name }) => name === REFRESH_COOKIE_NAME));
});

test('registers a doctor with a profile', async (t) => {
  stubAuditAndSession(t);
  const user = { _id: '507f1f77bcf86cd799439011', role: 'doctor', isActive: true };
  const department = { _id: '507f1f77bcf86cd799439022', isActive: true };
  stub(t, User, 'findOne', async () => null);
  stub(t, User, 'create', async (data) => ({ ...user, ...data }));
  stub(t, Department, 'findById', async () => department);
  stub(t, Doctor, 'create', async (data) => ({
    ...data,
    populate: async () => data,
  }));

  const result = await execute(
    register,
    makeRequest(
      {
        name: 'Test Doctor',
        email: 'doctor@example.com',
        password: 'secret123',
        role: 'doctor',
        departmentId: department._id,
        specialization: 'Cardiology',
      },
      '/api/auth/register'
    )
  );

  assert.equal(result.status, 201);
  assert.equal(result.body.data.user.role, 'doctor');
  assert.equal(result.body.data.doctor.specialization, 'Cardiology');
});

test('rejects a duplicate email with 409 Conflict', async (t) => {
  stubAuditAndSession(t);
  stub(t, User, 'findOne', async () => null);
  stub(t, User, 'create', async () => {
    const error = new Error('duplicate email');
    error.code = 11000;
    throw error;
  });

  const result = await execute(
    register,
    makeRequest(
      { name: 'Duplicate', email: 'duplicate@example.com', password: 'secret123', role: 'patient' },
      '/api/auth/register'
    )
  );

  assert.equal(result.status, 409);
  assert.equal(result.body.message, 'Email is already registered');
});

test('rejects invalid credentials with 401 Unauthorized', async (t) => {
  stubAuditAndSession(t);
  stub(t, User, 'findOne', () => ({
    select: async () => ({
      _id: '507f1f77bcf86cd799439011',
      role: 'patient',
      isActive: true,
      comparePassword: async () => false,
    }),
  }));

  const result = await execute(
    login,
    makeRequest({ email: 'patient@example.com', password: 'wrong-password' }, '/api/auth/login')
  );

  assert.equal(result.status, 401);
  assert.equal(result.body.message, 'Invalid email or password');
  assert.equal(result.cookies.length, 0);
});
