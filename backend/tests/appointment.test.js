process.env.JWT_SECRET = 'test_secret_for_unit_tests_1234567890';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const Appointment = require('../models/Appointment');
const Availability = require('../models/Availability');
const Doctor = require('../models/Doctor');
const WaitingList = require('../models/WaitingList');
const { bookAppointment, cancelAppointment } = require('../controllers/appointmentController');
const { errorHandler } = require('../middlewares/errorHandler');

/**
 * Helper to simulate Express request/response pipeline.
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

test('Appointment model defines compound partial indexes for slot exclusivity', () => {
  const indexes = Appointment.schema.indexes();

  // 1. Verify unique_active_doctor_slot
  const doctorSlotIndex = indexes.find(
    ([fields, opts]) => fields.doctor === 1 && fields.date === 1 && fields.startTime === 1 && opts.name === 'unique_active_doctor_slot'
  );
  assert.ok(doctorSlotIndex, 'unique_active_doctor_slot index must be defined');
  assert.equal(doctorSlotIndex[1].unique, true);
  assert.deepEqual(doctorSlotIndex[1].partialFilterExpression, {
    status: { $in: ['booked', 'completed'] },
  });

  // 2. Verify unique_active_patient_slot
  const patientSlotIndex = indexes.find(
    ([fields, opts]) => fields.patient === 1 && fields.date === 1 && fields.startTime === 1 && opts.name === 'unique_active_patient_slot'
  );
  assert.ok(patientSlotIndex, 'unique_active_patient_slot index must be defined');
  assert.equal(patientSlotIndex[1].unique, true);
  assert.deepEqual(patientSlotIndex[1].partialFilterExpression, {
    status: { $in: ['booked', 'completed'] },
  });
});

test('Successful booking for valid doctor availability window returns 201 Created', async (t) => {
  const origDoctorFindById = Doctor.findById;
  const origFindSlot = Availability.findSlot;
  const origExists = Appointment.exists;
  const origCreate = Appointment.create;

  t.after(() => {
    Doctor.findById = origDoctorFindById;
    Availability.findSlot = origFindSlot;
    Appointment.exists = origExists;
    Appointment.create = origCreate;
  });

  const mockDoctorId = '507f1f77bcf86cd799439011';
  const mockPatientId = '507f1f77bcf86cd799439022';
  const mockDeptId = '507f1f77bcf86cd799439033';

  Doctor.findById = async () => ({
    _id: mockDoctorId,
    isActive: true,
    department: mockDeptId,
  });

  Availability.findSlot = async () => ({
    slot: { startTime: '10:00', endTime: '10:30' },
  });

  Appointment.exists = async () => false;

  Appointment.create = async (data) => ({
    _id: '507f1f77bcf86cd799439099',
    ...data,
    status: 'booked',
    populate: async () => {},
  });

  const req = {
    user: { _id: mockPatientId, role: 'patient' },
    body: {
      doctorId: mockDoctorId,
      date: '2099-06-15',
      startTime: '10:00',
      reason: 'General checkup',
    },
  };

  const res = await executeHandler(bookAppointment, req);
  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.message, 'Appointment booked');
  assert.equal(res.body.data.status, 'booked');
  assert.equal(res.body.data.startTime, '10:00');
  assert.equal(res.body.data.endTime, '10:30');
});

test('Attempting to book an already-booked slot returns 409 Conflict', async (t) => {
  const origDoctorFindById = Doctor.findById;
  const origFindSlot = Availability.findSlot;
  const origExists = Appointment.exists;
  const origCreate = Appointment.create;

  t.after(() => {
    Doctor.findById = origDoctorFindById;
    Availability.findSlot = origFindSlot;
    Appointment.exists = origExists;
    Appointment.create = origCreate;
  });

  const mockDoctorId = '507f1f77bcf86cd799439011';
  const mockPatientId = '507f1f77bcf86cd799439022';

  Doctor.findById = async () => ({
    _id: mockDoctorId,
    isActive: true,
  });

  Availability.findSlot = async () => ({
    slot: { startTime: '10:00', endTime: '10:30' },
  });

  // Pre-check identifies slot is already occupied
  Appointment.exists = async (query) => {
    if (query.doctor && query.startTime === '10:00') return true;
    return false;
  };

  const req = {
    user: { _id: mockPatientId, role: 'patient' },
    body: {
      doctorId: mockDoctorId,
      date: '2099-06-15',
      startTime: '10:00',
    },
  };

  const res = await executeHandler(bookAppointment, req);
  assert.equal(res.status, 409);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /This slot is already booked/i);

  // Concurrent race condition handling: pre-check passed, but Appointment.create hits duplicate index (code 11000)
  Appointment.exists = async () => false;
  Appointment.create = async () => {
    const err = new Error('E11000 duplicate key error collection: appointments index: unique_active_doctor_slot');
    err.code = 11000;
    throw err;
  };

  const resRace = await executeHandler(bookAppointment, req);
  assert.equal(resRace.status, 409);
  assert.equal(resRace.body.success, false);
  assert.match(resRace.body.message, /This slot was just booked by someone else/i);
});

test('Patient attempting to book overlapping appointments returns 409 Conflict', async (t) => {
  const origDoctorFindById = Doctor.findById;
  const origFindSlot = Availability.findSlot;
  const origExists = Appointment.exists;

  t.after(() => {
    Doctor.findById = origDoctorFindById;
    Availability.findSlot = origFindSlot;
    Appointment.exists = origExists;
  });

  const mockDoctorId = '507f1f77bcf86cd799439011';
  const mockPatientId = '507f1f77bcf86cd799439022';

  Doctor.findById = async () => ({
    _id: mockDoctorId,
    isActive: true,
  });

  Availability.findSlot = async () => ({
    slot: { startTime: '10:00', endTime: '10:30' },
  });

  // Overlapping appointment at same time with another doctor
  Appointment.exists = async (query) => {
    if (query.patient && query.startTime === '10:00' && !query.doctor) return true;
    return false;
  };

  const req = {
    user: { _id: mockPatientId, role: 'patient' },
    body: {
      doctorId: mockDoctorId,
      date: '2099-06-15',
      startTime: '10:00',
    },
  };

  const res = await executeHandler(bookAppointment, req);
  assert.equal(res.status, 409);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /You already have another appointment at that time/i);
});

test('Cancelling appointment marks status as cancelled and reassigns freed slot to waiting list entry', async (t) => {
  const origFindById = Appointment.findById;
  const origDoctorFindById = Doctor.findById;
  const origFindSlot = Availability.findSlot;
  const origWaitingFind = WaitingList.find;
  const origExists = Appointment.exists;
  const origCreate = Appointment.create;

  t.after(() => {
    Appointment.findById = origFindById;
    Doctor.findById = origDoctorFindById;
    Availability.findSlot = origFindSlot;
    WaitingList.find = origWaitingFind;
    Appointment.exists = origExists;
    Appointment.create = origCreate;
  });

  const mockApptId = '507f1f77bcf86cd799439099';
  const mockDoctorId = '507f1f77bcf86cd799439011';
  const mockPatientId = '507f1f77bcf86cd799439022';
  const mockWaitingPatientId = '507f1f77bcf86cd799439088';

  const appointmentDoc = {
    _id: mockApptId,
    doctor: mockDoctorId,
    patient: mockPatientId,
    date: '2099-06-15',
    startTime: '10:00',
    endTime: '10:30',
    status: 'booked',
    cancelledBy: '',
    async save() {
      return this;
    },
    async populate() {
      return this;
    },
  };

  Appointment.findById = async () => appointmentDoc;
  Doctor.findById = async () => ({ _id: mockDoctorId, isActive: true });
  Availability.findSlot = async () => ({ slot: { startTime: '10:00', endTime: '10:30' } });

  const waitingEntry = {
    _id: '507f1f77bcf86cd799439077',
    doctor: mockDoctorId,
    patient: mockWaitingPatientId,
    desiredDate: '2099-06-15',
    status: 'waiting',
    notes: 'Urgent consultation needed',
    async save() {
      return this;
    },
  };

  WaitingList.find = () => ({
    sort: () => [waitingEntry],
  });

  Appointment.exists = async () => false;

  const reassignedApptId = '507f1f77bcf86cd799439055';
  Appointment.create = async (data) => ({
    _id: reassignedApptId,
    ...data,
    status: 'booked',
  });

  const req = {
    params: { id: mockApptId },
    user: { _id: mockPatientId, role: 'patient' },
  };

  const res = await executeHandler(cancelAppointment, req);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.message, 'Appointment cancelled');
  assert.equal(appointmentDoc.status, 'cancelled');
  assert.equal(appointmentDoc.cancelledBy, 'patient');
  assert.equal(waitingEntry.status, 'assigned');
  assert.equal(res.body.reassignedAppointmentId, reassignedApptId);
});
