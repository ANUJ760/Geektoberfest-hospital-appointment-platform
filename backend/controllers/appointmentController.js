const Appointment = require('../models/Appointment');
const Availability = require('../models/Availability');
const Doctor = require('../models/Doctor');
const { HttpError, asyncHandler } = require('../middlewares/errorHandler');
const { isValidObjectId, isValidDate, isValidTime, isPastSlot } = require('../utils/validators');
const { assignFromWaitingList } = require('./waitingListController');

const STATUSES = ['booked', 'completed', 'cancelled'];

const loadAppointment = async (id) => {
  if (!isValidObjectId(id)) throw new HttpError(400, 'Invalid appointment id');
  const appointment = await Appointment.findById(id);
  if (!appointment) throw new HttpError(404, 'Appointment not found');
  return appointment;
};

/** Whether the requesting user may see/act on this appointment. Returns role as actor or null. */
const getActor = async (user, appointment) => {
  if (user.role === 'admin') return 'admin';
  if (user.role === 'patient' && String(appointment.patient) === String(user._id)) return 'patient';
  if (user.role === 'doctor') {
    const doctor = await Doctor.findOne({ user: user._id });
    if (doctor && String(doctor._id) === String(appointment.doctor)) return 'doctor';
  }
  return null;
};

const respond = async (res, status, message, appointment, extra = {}) => {
  await appointment.populate(Appointment.populateFields);
  res.status(status).json({ success: true, message, data: appointment, ...extra });
};

// POST /api/appointments  (patient)
const bookAppointment = asyncHandler(async (req, res) => {
  const { doctorId, date, startTime, reason = '' } = req.body;
  if (!isValidObjectId(doctorId)) throw new HttpError(400, 'A valid doctorId is required');
  if (!isValidDate(date)) throw new HttpError(400, 'Date must be a valid YYYY-MM-DD');
  if (!isValidTime(startTime)) throw new HttpError(400, 'Start time must be HH:MM');
  if (typeof reason !== 'string' || reason.length > 500) throw new HttpError(400, 'Reason must be under 500 characters');
  if (isPastSlot(date, startTime)) throw new HttpError(400, 'Cannot book a slot in the past');

  const doctor = await Doctor.findById(doctorId);
  if (!doctor || !doctor.isActive) throw new HttpError(404, 'Doctor not found');

  const found = await Availability.findSlot(doctor._id, date, startTime);
  if (!found) throw new HttpError(400, 'The requested slot is not part of the doctor\'s availability');

  if (await Appointment.exists({ doctor: doctor._id, date, startTime, status: { $in: Appointment.ACTIVE_STATUSES } })) {
    throw new HttpError(409, 'This slot is already booked');
  }
  if (await Appointment.exists({ patient: req.user._id, doctor: doctor._id, date, status: { $in: Appointment.ACTIVE_STATUSES } })) {
    throw new HttpError(409, 'You already have an appointment with this doctor on that date');
  }
  if (await Appointment.exists({ patient: req.user._id, date, startTime, status: { $in: Appointment.ACTIVE_STATUSES } })) {
    throw new HttpError(409, 'You already have another appointment at that time');
  }

  let appointment;
  try {
    appointment = await Appointment.create({
      patient: req.user._id,
      doctor: doctor._id,
      department: doctor.department,
      date,
      startTime,
      endTime: found.slot.endTime,
      reason,
    });
  } catch (err) {
    // Two requests racing for the same slot: the unique index decides the winner.
    if (err.code === 11000) throw new HttpError(409, 'This slot was just booked by someone else');
    throw err;
  }
  await respond(res, 201, 'Appointment booked', appointment);
});

// GET /api/appointments  (admin)  ?status=&doctor=&date=
const listAppointments = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) {
    if (!STATUSES.includes(req.query.status)) throw new HttpError(400, 'Invalid status filter');
    filter.status = req.query.status;
  }
  if (req.query.doctor) {
    if (!isValidObjectId(req.query.doctor)) throw new HttpError(400, 'Invalid doctor id');
    filter.doctor = req.query.doctor;
  }
  if (req.query.date) {
    if (!isValidDate(req.query.date)) throw new HttpError(400, 'Invalid date filter');
    filter.date = req.query.date;
  }
  const items = await Appointment.find(filter)
    .populate(Appointment.populateFields)
    .sort({ date: -1, startTime: -1 });
  res.status(200).json({ success: true, message: 'Appointments retrieved', data: items });
});

// GET /api/appointments/my  (patient)  ?status=
const getMyAppointments = asyncHandler(async (req, res) => {
  const filter = { patient: req.user._id };
  if (req.query.status) {
    if (!STATUSES.includes(req.query.status)) throw new HttpError(400, 'Invalid status filter');
    filter.status = req.query.status;
  }
  const items = await Appointment.find(filter)
    .populate(Appointment.populateFields)
    .sort({ date: -1, startTime: -1 });
  res.status(200).json({ success: true, message: 'Appointments retrieved', data: items });
});

// GET /api/appointments/:id
const getAppointment = asyncHandler(async (req, res) => {
  const appointment = await loadAppointment(req.params.id);
  if (!(await getActor(req.user, appointment))) {
    throw new HttpError(403, 'You are not allowed to view this appointment');
  }
  await respond(res, 200, 'Appointment retrieved', appointment);
});

/** Cancel a booked appointment, then offer the freed slot to the waiting list. */
const cancelAndReassign = async (appointment, actor) => {
  if (appointment.status !== 'booked') {
    throw new HttpError(409, `Only booked appointments can be cancelled (current status: ${appointment.status})`);
  }
  appointment.status = 'cancelled';
  appointment.cancelledBy = actor;
  await appointment.save();
  return assignFromWaitingList(appointment);
};

// PATCH /api/appointments/:id/cancel  (patient own / doctor own / admin)
const cancelAppointment = asyncHandler(async (req, res) => {
  const appointment = await loadAppointment(req.params.id);
  const actor = await getActor(req.user, appointment);
  if (!actor) throw new HttpError(403, 'You are not allowed to cancel this appointment');
  const reassigned = await cancelAndReassign(appointment, actor);
  await respond(res, 200, 'Appointment cancelled', appointment, {
    reassignedAppointmentId: reassigned ? reassigned._id : null,
  });
});

// PATCH /api/appointments/:id/status  (doctor own / admin)  body: { status, reason, notes, prescription }
const updateAppointmentStatus = asyncHandler(async (req, res) => {
  const { status, reason, notes, prescription } = req.body;
  if (!['completed', 'cancelled'].includes(status)) {
    throw new HttpError(400, 'Status must be completed or cancelled');
  }
  if (notes !== undefined && (typeof notes !== 'string' || notes.length > 1000)) {
    throw new HttpError(400, 'Notes must be under 1000 characters');
  }
  if (reason !== undefined && (typeof reason !== 'string' || reason.length > 500)) {
    throw new HttpError(400, 'Reason must be under 500 characters');
  }
  if (prescription !== undefined && (typeof prescription !== 'string' || prescription.length > 2000)) {
    throw new HttpError(400, 'Prescription must be under 2000 characters');
  }
  const appointment = await loadAppointment(req.params.id);
  const actor = await getActor(req.user, appointment);
  if (actor !== 'doctor' && actor !== 'admin') {
    throw new HttpError(403, 'Only the treating doctor or an admin can update the status');
  }
  if (notes !== undefined) appointment.notes = notes;
  if (reason !== undefined) appointment.reason = reason;
  if (prescription !== undefined) appointment.prescription = prescription;

  let reassigned = null;
  if (status === 'cancelled') {
    reassigned = await cancelAndReassign(appointment, actor);
  } else {
    if (appointment.status !== 'booked') {
      throw new HttpError(409, `Only booked appointments can be completed (current status: ${appointment.status})`);
    }
    appointment.status = 'completed';
    await appointment.save();
  }
  await respond(res, 200, `Appointment ${status}`, appointment, {
    reassignedAppointmentId: reassigned ? reassigned._id : null,
  });
});

module.exports = {
  bookAppointment,
  listAppointments,
  getMyAppointments,
  getAppointment,
  cancelAppointment,
  updateAppointmentStatus,
};
