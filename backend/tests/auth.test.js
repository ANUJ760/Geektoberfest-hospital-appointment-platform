process.env.JWT_SECRET = 'test_secret_for_unit_tests_1234567890';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Department = require('../models/Department');
const { register, login, getMe } = require('../controllers/authController');
const { errorHandler } = require('../middlewares/errorHandler');

/**
 * Helper to simulate an Express HTTP invocation for a controller handler.
 */
const executeHandler = async (handler, req) => {
  let statusCode = 200;
  let responsePayload = null;

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      responsePayload = data;
      return res;
    },
  };

  return new Promise((resolve) => {
    const next = (err) => {
      if (err) {
        errorHandler(err, req, res, () => {});
      }
      resolve({ status: statusCode, body: responsePayload, error: err });
    };

    Promise.resolve(handler(req, res, next))
      .then(() => {
        resolve({ status: statusCode, body: responsePayload, error: null });
      })
      .catch(next);
  });
};

test('Patient registration with valid inputs returns 201 Created and valid JWT', async (t) => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;

  t.after(() => {
    User.findOne = originalFindOne;
    User.create = originalCreate;
  });

  User.findOne = async () => null;
  User.create = async ({ name, email, role, phone }) => ({
    _id: '60d0fe4f5311236168a109ca',
    name,
    email,
    role,
    phone,
    toJSON() {
      return { _id: this._id, name: this.name, email: this.email, role: this.role, phone: this.phone };
    },
  });

  const req = {
    body: {
      name: 'John Patient',
      email: 'john.patient@example.com',
      password: 'StrongPassword123!',
      role: 'patient',
      phone: '+1-555-1234',
    },
  };

  const res = await executeHandler(register, req);
  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data.token, 'Token must be present in response');

  // Verify JWT token payload
  const decoded = jwt.verify(res.body.data.token, process.env.JWT_SECRET);
  assert.equal(decoded.id, '60d0fe4f5311236168a109ca');

  // Verify password is not in the response
  assert.equal(res.body.data.user.password, undefined);
  assert.equal(res.body.data.user.name, 'John Patient');
});

test('Doctor registration requires valid departmentId and specialization', async (t) => {
  const originalFindOne = User.findOne;
  t.after(() => {
    User.findOne = originalFindOne;
  });
  User.findOne = async () => null;

  // Case 1: Missing departmentId
  const reqMissingDept = {
    body: {
      name: 'Dr. Jane Smith',
      email: 'jane.smith@example.com',
      password: 'DoctorPassword123!',
      role: 'doctor',
      specialization: 'Cardiology',
    },
  };
  const resMissingDept = await executeHandler(register, reqMissingDept);
  assert.equal(resMissingDept.status, 400);
  assert.equal(resMissingDept.body.success, false);
  assert.match(resMissingDept.body.message, /departmentId/i);

  // Case 2: Missing specialization
  const reqMissingSpec = {
    body: {
      name: 'Dr. Jane Smith',
      email: 'jane.smith@example.com',
      password: 'DoctorPassword123!',
      role: 'doctor',
      departmentId: '507f1f77bcf86cd799439011',
    },
  };
  const resMissingSpec = await executeHandler(register, reqMissingSpec);
  assert.equal(resMissingSpec.status, 400);
  assert.equal(resMissingSpec.body.success, false);
  assert.match(resMissingSpec.body.message, /Specialization is required/i);
});

test('Admin account registration via public endpoint is rejected with 403 Forbidden', async () => {
  const req = {
    body: {
      name: 'Admin User',
      email: 'admin@hospital.com',
      password: 'AdminPassword123!',
      role: 'admin',
    },
  };

  const res = await executeHandler(register, req);
  assert.equal(res.status, 403);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /Admin accounts cannot be created via registration/i);
});

test('Duplicate email registration returns 409 Conflict', async (t) => {
  const originalFindOne = User.findOne;
  t.after(() => {
    User.findOne = originalFindOne;
  });

  User.findOne = async () => ({ _id: 'existing_user_id', email: 'existing@example.com' });

  const req = {
    body: {
      name: 'Duplicate Person',
      email: 'existing@example.com',
      password: 'Password123!',
      role: 'patient',
    },
  };

  const res = await executeHandler(register, req);
  assert.equal(res.status, 409);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /Email is already registered/i);
});

test('Invalid email formats and short passwords return 400 Bad Request', async () => {
  // Invalid email
  const reqBadEmail = {
    body: {
      name: 'Test User',
      email: 'not-an-email',
      password: 'Password123!',
      role: 'patient',
    },
  };
  const resBadEmail = await executeHandler(register, reqBadEmail);
  assert.equal(resBadEmail.status, 400);
  assert.equal(resBadEmail.body.success, false);
  assert.match(resBadEmail.body.message, /valid email/i);

  // Short password (< 6 chars)
  const reqShortPass = {
    body: {
      name: 'Test User',
      email: 'valid@example.com',
      password: '123',
      role: 'patient',
    },
  };
  const resShortPass = await executeHandler(register, reqShortPass);
  assert.equal(resShortPass.status, 400);
  assert.equal(resShortPass.body.success, false);
  assert.match(resShortPass.body.message, /at least 6 characters/i);

  // Empty name
  const reqEmptyName = {
    body: {
      name: '   ',
      email: 'valid@example.com',
      password: 'Password123!',
      role: 'patient',
    },
  };
  const resEmptyName = await executeHandler(register, reqEmptyName);
  assert.equal(resEmptyName.status, 400);
  assert.equal(resEmptyName.body.success, false);
  assert.match(resEmptyName.body.message, /Name is required/i);
});

test('Passwords are never leaked in JSON responses', async (t) => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;

  t.after(() => {
    User.findOne = originalFindOne;
    User.create = originalCreate;
  });

  User.findOne = async () => null;
  User.create = async () => {
    const userInstance = new User({
      name: 'Security Test User',
      email: 'security@example.com',
      password: 'SecretPassword999!',
      role: 'patient',
    });
    return userInstance;
  };

  const req = {
    body: {
      name: 'Security Test User',
      email: 'security@example.com',
      password: 'SecretPassword999!',
      role: 'patient',
    },
  };

  const res = await executeHandler(register, req);
  assert.equal(res.status, 201);
  const serialized = JSON.stringify(res.body);
  assert.equal(serialized.includes('SecretPassword999!'), false);
  assert.equal(res.body.data.user.password, undefined);
});

test('Login with valid credentials returns 200 OK and JWT', async (t) => {
  const originalFindOne = User.findOne;
  t.after(() => {
    User.findOne = originalFindOne;
  });

  User.findOne = () => ({
    select: () => ({
      _id: '60d0fe4f5311236168a109ca',
      name: 'John Patient',
      email: 'john.patient@example.com',
      role: 'patient',
      isActive: true,
      comparePassword: async (pwd) => pwd === 'CorrectPassword123!',
      toJSON() {
        return { _id: this._id, name: this.name, email: this.email, role: this.role };
      },
    }),
  });

  const req = {
    body: {
      email: 'john.patient@example.com',
      password: 'CorrectPassword123!',
    },
  };

  const res = await executeHandler(login, req);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data.token);
  assert.equal(res.body.data.user.password, undefined);
});

test('Login with invalid credentials or deactivated account is properly rejected', async (t) => {
  const originalFindOne = User.findOne;
  t.after(() => {
    User.findOne = originalFindOne;
  });

  // Nonexistent user
  User.findOne = () => ({
    select: () => null,
  });

  const resNonexistent = await executeHandler(login, {
    body: { email: 'nonexistent@example.com', password: 'Password123!' },
  });
  assert.equal(resNonexistent.status, 401);
  assert.equal(resNonexistent.body.success, false);

  // Wrong password
  User.findOne = () => ({
    select: () => ({
      _id: 'user123',
      isActive: true,
      comparePassword: async () => false,
    }),
  });

  const resWrongPass = await executeHandler(login, {
    body: { email: 'user@example.com', password: 'WrongPassword' },
  });
  assert.equal(resWrongPass.status, 401);
  assert.equal(resWrongPass.body.success, false);

  // Deactivated user
  User.findOne = () => ({
    select: () => ({
      _id: 'user123',
      isActive: false,
      comparePassword: async () => true,
    }),
  });

  const resDeactivated = await executeHandler(login, {
    body: { email: 'user@example.com', password: 'Password123!' },
  });
  assert.equal(resDeactivated.status, 403);
  assert.match(resDeactivated.body.message, /Account is deactivated/i);
});

test('getMe returns the authenticated user data', async () => {
  const req = {
    user: {
      _id: 'user_authenticated_id',
      name: 'Auth User',
      email: 'auth@example.com',
      role: 'patient',
    },
  };

  const res = await executeHandler(getMe, req);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.user.name, 'Auth User');
  assert.equal(res.body.data.doctor, null);
});
