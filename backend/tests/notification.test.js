process.env.JWT_SECRET = 'test_secret_for_unit_tests_1234567890';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const notificationService = require('../services/notificationService');
const { assignFromWaitingList } = require('../controllers/waitingListController');
const { protect } = require('../middlewares/authMiddleware');
const Appointment = require('../models/Appointment');
const Availability = require('../models/Availability');
const Doctor = require('../models/Doctor');
const WaitingList = require('../models/WaitingList');
const User = require('../models/User');

test('notificationService.subscribe sets headers, sends handshake with recent history, and tracks clients', (t) => {
  notificationService.reset();

  const mockUserId = '507f1f77bcf86cd799439011';
  let closedCallback = null;
  const writtenChunks = [];
  const headersSet = {};

  // Pre-populate a recent notification
  notificationService.notifyPatient(mockUserId, { appointmentId: 'old_123', message: 'Earlier note' });

  const req = {
    user: { _id: mockUserId },
    on(event, cb) {
      if (event === 'close') closedCallback = cb;
    },
  };

  const res = {
    setHeader(name, val) {
      headersSet[name] = val;
    },
    write(chunk) {
      writtenChunks.push(chunk);
    },
    on() {},
    flushHeaders() {},
  };

  notificationService.subscribe(req, res);

  assert.equal(headersSet['Content-Type'], 'text/event-stream');
  assert.equal(headersSet['Cache-Control'], 'no-cache');
  assert.equal(headersSet['Connection'], 'keep-alive');
  assert.equal(notificationService.getSubscriberCount(mockUserId), 1);
  assert.equal(notificationService.getSubscriberCount(), 1);

  // Initial handshake event includes recent history
  assert.ok(writtenChunks.length >= 1);
  assert.match(writtenChunks[0], /event: connected/);
  assert.match(writtenChunks[0], /"status":"connected"/);
  assert.match(writtenChunks[0], /"appointmentId":"old_123"/);

  // Trigger client disconnect
  assert.ok(typeof closedCallback === 'function');
  closedCallback();
  assert.equal(notificationService.getSubscriberCount(mockUserId), 0);
  assert.equal(notificationService.getSubscriberCount(), 0);
});

test('notificationService.subscribe rejects unauthenticated requests', () => {
  let statusSet = 200;
  let jsonSent = null;

  const req = { user: null };
  const res = {
    status(code) {
      statusSet = code;
      return res;
    },
    json(data) {
      jsonSent = data;
      return res;
    },
    setHeader() {},
  };

  notificationService.subscribe(req, res);
  assert.equal(statusSet, 401);
  assert.equal(jsonSent.success, false);
});

test('notificationService.notifyPatient delivers to multiple open tabs for the same user', () => {
  notificationService.reset();

  const mockUserId = '507f1f77bcf86cd799439022';
  const tab1Messages = [];
  const tab2Messages = [];

  const res1 = {
    setHeader() {},
    write: (msg) => tab1Messages.push(msg),
    on() {},
  };
  const res2 = {
    setHeader() {},
    write: (msg) => tab2Messages.push(msg),
    on() {},
  };

  notificationService.subscribe({ user: { _id: mockUserId }, on() {} }, res1);
  notificationService.subscribe({ user: { _id: mockUserId }, on() {} }, res2);

  assert.equal(notificationService.getSubscriberCount(mockUserId), 2);

  const payload = { appointmentId: 'appt_multi', date: '2025-06-01', startTime: '09:00' };
  const delivered = notificationService.notifyPatient(mockUserId, payload);

  assert.equal(delivered, true);
  assert.equal(tab1Messages.length, 2); // 1 handshake + 1 event
  assert.equal(tab2Messages.length, 2);
  assert.match(tab1Messages[1], /"appointmentId":"appt_multi"/);
  assert.match(tab2Messages[1], /"appointmentId":"appt_multi"/);
});

test('notificationService.notifyPatient gracefully handles socket write errors and prunes dead clients', () => {
  notificationService.reset();

  const mockUserId = '507f1f77bcf86cd799439033';
  const healthyMessages = [];

  let handshakeDone = false;
  const brokenRes = {
    setHeader() {},
    write: () => {
      if (!handshakeDone) {
        handshakeDone = true;
        return;
      }
      throw new Error('EPIPE: broken pipe');
    },
    on() {},
  };
  const healthyRes = {
    setHeader() {},
    write: (msg) => healthyMessages.push(msg),
    on() {},
  };

  notificationService.subscribe({ user: { _id: mockUserId }, on() {} }, brokenRes);
  notificationService.subscribe({ user: { _id: mockUserId }, on() {} }, healthyRes);

  assert.equal(notificationService.getSubscriberCount(mockUserId), 2);

  const delivered = notificationService.notifyPatient(mockUserId, { appointmentId: 'test_epipe' });

  assert.equal(delivered, true);
  assert.equal(notificationService.getSubscriberCount(mockUserId), 1);
  assert.match(healthyMessages[1], /"appointmentId":"test_epipe"/);
});

test('assignFromWaitingList triggers real-time notification on slot assignment', async (t) => {
  const origFindSlot = Availability.findSlot;
  const origWaitingFind = WaitingList.find;
  const origDoctorFind = Doctor.findById;
  const origExists = Appointment.exists;
  const origCreate = Appointment.create;
  const origNotify = notificationService.notifyPatient;

  t.after(() => {
    Availability.findSlot = origFindSlot;
    WaitingList.find = origWaitingFind;
    Doctor.findById = origDoctorFind;
    Appointment.exists = origExists;
    Appointment.create = origCreate;
    notificationService.notifyPatient = origNotify;
  });

  const mockDoctorId = '507f1f77bcf86cd799439011';
  const mockWaitingPatientId = '507f1f77bcf86cd799439033';
  const mockDeptId = '507f1f77bcf86cd799439044';

  Availability.findSlot = async () => ({ slot: { startTime: '14:00', endTime: '14:30' } });
  Doctor.findById = async () => ({ _id: mockDoctorId, department: mockDeptId });
  Appointment.exists = async () => false;

  const mockWaitingEntry = {
    _id: 'wait_entry_1',
    patient: mockWaitingPatientId,
    doctor: mockDoctorId,
    desiredDate: '2099-09-01',
    status: 'waiting',
    notes: 'Urgent checkup',
    save: async () => {},
  };

  WaitingList.find = () => ({
    sort: () => [mockWaitingEntry],
  });

  const mockNewAppt = {
    _id: 'appt_new_456',
    patient: mockWaitingPatientId,
    doctor: mockDoctorId,
    date: '2099-09-01',
    startTime: '14:00',
    endTime: '14:30',
  };
  Appointment.create = async () => mockNewAppt;

  let notifiedPatientId = null;
  let notifiedPayload = null;
  notificationService.notifyPatient = (patientId, payload) => {
    notifiedPatientId = patientId;
    notifiedPayload = payload;
    return true;
  };

  const cancelledAppt = {
    _id: 'appt_cancelled_123',
    doctor: mockDoctorId,
    patient: '507f1f77bcf86cd799439088',
    date: '2099-09-01',
    startTime: '14:00',
    endTime: '14:30',
  };

  const result = await assignFromWaitingList(cancelledAppt);
  assert.equal(result._id, 'appt_new_456');
  assert.equal(mockWaitingEntry.status, 'assigned');
  assert.equal(mockWaitingEntry.appointment, 'appt_new_456');

  // Verify notification was dispatched to the assigned patient
  assert.equal(String(notifiedPatientId), String(mockWaitingPatientId));
  assert.equal(notifiedPayload.appointmentId, 'appt_new_456');
  assert.equal(notifiedPayload.date, '2099-09-01');
  assert.equal(notifiedPayload.startTime, '14:00');
  assert.match(notifiedPayload.message, /assigned to you from the waiting list/i);
});

test('assignFromWaitingList does not notify when slot is in the past or no waiting entry exists', async (t) => {
  let notifyCalled = false;
  notificationService.notifyPatient = () => {
    notifyCalled = true;
  };

  // Case 1: Past slot
  const pastAppt = {
    doctor: '507f1f77bcf86cd799439011',
    date: '2000-01-01',
    startTime: '09:00',
  };
  const resPast = await assignFromWaitingList(pastAppt);
  assert.equal(resPast, null);
  assert.equal(notifyCalled, false);

  // Case 2: No waiting list entries found
  const origFindSlot = Availability.findSlot;
  const origWaitingFind = WaitingList.find;
  const origDoctorFind = Doctor.findById;
  t.after(() => {
    Availability.findSlot = origFindSlot;
    WaitingList.find = origWaitingFind;
    Doctor.findById = origDoctorFind;
  });

  Availability.findSlot = async () => ({ slot: { startTime: '10:00', endTime: '10:30' } });
  WaitingList.find = () => ({
    sort: () => [], // empty
  });
  Doctor.findById = async () => ({ _id: '507f1f77bcf86cd799439011' });

  const futureAppt = {
    doctor: '507f1f77bcf86cd799439011',
    date: '2099-10-10',
    startTime: '10:00',
  };
  const resEmpty = await assignFromWaitingList(futureAppt);
  assert.equal(resEmpty, null);
  assert.equal(notifyCalled, false);
});

test('protect middleware supports token from query param and rejects invalid tokens', async (t) => {
  const origFindById = User.findById;
  t.after(() => {
    User.findById = origFindById;
  });

  const mockUserId = '507f1f77bcf86cd799439055';
  User.findById = async () => ({
    _id: mockUserId,
    name: 'Patient Tester',
    isActive: true,
  });

  const validToken = jwt.sign({ id: mockUserId }, process.env.JWT_SECRET);

  // Valid query token
  const reqValid = { headers: {}, query: { token: validToken } };
  let nextCalled = false;
  await protect(reqValid, {}, (err) => {
    assert.equal(err, undefined);
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(String(reqValid.user._id), mockUserId);

  // Invalid query token
  const reqInvalid = { headers: {}, query: { token: 'invalid_token_string' } };
  let invalidErr = null;
  await protect(reqInvalid, {}, (err) => {
    invalidErr = err;
  });
  assert.ok(invalidErr);
  assert.equal(invalidErr.status, 401);
  assert.match(invalidErr.message, /invalid or expired token/i);

  // Missing token
  const reqMissing = { headers: {}, query: {} };
  let missingErr = null;
  await protect(reqMissing, {}, (err) => {
    missingErr = err;
  });
  assert.ok(missingErr);
  assert.equal(missingErr.status, 401);
  assert.match(missingErr.message, /token missing/i);
});
