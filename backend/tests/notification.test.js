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

test('notificationService.subscribe sets headers, sends handshake, and manages active client count', (t) => {
  notificationService.reset();

  const mockUserId = '507f1f77bcf86cd799439011';
  let closedCallback = null;
  const writtenChunks = [];
  const headersSet = {};

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
    flushHeaders() {},
  };

  notificationService.subscribe(req, res);

  assert.equal(headersSet['Content-Type'], 'text/event-stream');
  assert.equal(headersSet['Cache-Control'], 'no-cache');
  assert.equal(headersSet['Connection'], 'keep-alive');
  assert.equal(notificationService.getSubscriberCount(mockUserId), 1);
  assert.equal(notificationService.getSubscriberCount(), 1);

  // Initial handshake event
  assert.ok(writtenChunks.length >= 1);
  assert.match(writtenChunks[0], /event: connected/);
  assert.match(writtenChunks[0], /"status":"connected"/);

  // Trigger client disconnect
  assert.ok(typeof closedCallback === 'function');
  closedCallback();
  assert.equal(notificationService.getSubscriberCount(mockUserId), 0);
  assert.equal(notificationService.getSubscriberCount(), 0);
});

test('notificationService.notifyPatient broadcasts SSE payload to connected recipient', () => {
  notificationService.reset();

  const mockUserId = '507f1f77bcf86cd799439022';
  const receivedMessages = [];

  const req = {
    user: { _id: mockUserId },
    on() {},
  };

  const res = {
    setHeader() {},
    write(msg) {
      receivedMessages.push(msg);
    },
  };

  notificationService.subscribe(req, res);

  // Sending to offline user returns false
  const notSent = notificationService.notifyPatient('507f1f77bcf86cd799439099', { test: true });
  assert.equal(notSent, false);

  // Sending to connected user sends event: waiting_list_assigned
  const payload = {
    appointmentId: 'appt_123',
    date: '2025-05-20',
    startTime: '11:00',
    message: 'Slot assigned!',
  };
  const sent = notificationService.notifyPatient(mockUserId, payload);
  assert.equal(sent, true);

  const lastMsg = receivedMessages[receivedMessages.length - 1];
  assert.match(lastMsg, /event: waiting_list_assigned/);
  assert.match(lastMsg, /"appointmentId":"appt_123"/);
  assert.match(lastMsg, /"startTime":"11:00"/);
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

test('protect middleware supports token from query param for EventSource connections', async (t) => {
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

  const req = {
    headers: {},
    query: { token: validToken },
  };

  let nextCalled = false;
  await protect(req, {}, (err) => {
    assert.equal(err, undefined);
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(String(req.user._id), mockUserId);
});
