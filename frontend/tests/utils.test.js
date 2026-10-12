import test from 'node:test';
import assert from 'node:assert/strict';
import {
  todayString,
  nowTimeString,
  formatDate,
  formatTime,
  doctorName,
  getErrorMessage,
  isPastValue,
} from '../src/utils/format.js';
import {
  isValidEmail,
  validateDate,
  validateAvailability,
} from '../src/utils/validation.js';

/* ------------------------------------------------------------------
 * format.js tests
 * ------------------------------------------------------------------ */

test('formatDate formats valid YYYY-MM-DD date string to localized format', () => {
  const formatted = formatDate('2025-01-10');
  assert.equal(formatted, 'Fri, 10 Jan 2025');

  const leapYear = formatDate('2024-02-29');
  assert.equal(leapYear, 'Thu, 29 Feb 2024');
});

test('formatDate returns "-" for falsy or empty inputs', () => {
  assert.equal(formatDate(''), '-');
  assert.equal(formatDate(null), '-');
  assert.equal(formatDate(undefined), '-');
});

test('formatTime converts 24h HH:mm strings into 12h AM/PM strings', () => {
  assert.equal(formatTime('09:05'), '9:05 AM');
  assert.equal(formatTime('00:00'), '12:00 AM');
  assert.equal(formatTime('12:00'), '12:00 PM');
  assert.equal(formatTime('14:30'), '2:30 PM');
  assert.equal(formatTime('23:59'), '11:59 PM');
});

test('formatTime returns "-" for falsy or empty inputs', () => {
  assert.equal(formatTime(''), '-');
  assert.equal(formatTime(null), '-');
  assert.equal(formatTime(undefined), '-');
});

test('doctorName formats names with or without existing Dr. title', () => {
  assert.equal(doctorName({ user: { name: 'Sarah Connor' } }), 'Dr. Sarah Connor');
  assert.equal(doctorName({ user: { name: 'Dr. Sarah Connor' } }), 'Dr. Sarah Connor');
  assert.equal(doctorName({ user: { name: 'dr. Sarah Connor' } }), 'Dr. Sarah Connor');
  assert.equal(doctorName(null), 'Doctor');
  assert.equal(doctorName({}), 'Doctor');
  assert.equal(doctorName({ user: {} }), 'Doctor');
});

test('getErrorMessage extracts proper message across error response structures', () => {
  // Case 1: Server responded with error message payload
  const apiError = {
    response: {
      data: {
        message: 'Invalid credentials provided',
      },
    },
  };
  assert.equal(getErrorMessage(apiError), 'Invalid credentials provided');

  // Case 2: Request was made but no response was received (network failure)
  const networkError = {
    request: {},
  };
  assert.equal(getErrorMessage(networkError), 'Cannot reach the server. Is the API running?');

  // Case 3: Standard JavaScript Error instance
  const genericError = new Error('Client script crashed');
  assert.equal(getErrorMessage(genericError), 'Client script crashed');

  // Case 4: Object with message property
  assert.equal(getErrorMessage({ message: 'Custom error' }), 'Custom error');

  // Case 5: Empty object or falsy
  assert.equal(getErrorMessage({}), 'Something went wrong');
  assert.equal(getErrorMessage(null), 'Something went wrong');
  assert.equal(getErrorMessage(undefined), 'Something went wrong');
});

test('todayString and nowTimeString return valid ISO formatted fragments', () => {
  const today = todayString();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);

  const now = nowTimeString();
  assert.match(now, /^\d{2}:\d{2}$/);
});

test('isPastValue correctly evaluates past and future dates', () => {
  assert.equal(isPastValue('2000-01-01', '10:00'), true);
  assert.equal(isPastValue('2099-12-31', '23:59'), false);
});

/* ------------------------------------------------------------------
 * validation.js tests
 * ------------------------------------------------------------------ */

test('isValidEmail validates standard and complex email addresses', () => {
  assert.equal(isValidEmail('patient@example.com'), true);
  assert.equal(isValidEmail('doctor.specialist+clinic@hospital.org'), true);
  assert.equal(isValidEmail('admin_test123@sub.domain.co.uk'), true);
  assert.equal(isValidEmail('  spaced@domain.com  '), true);
});

test('isValidEmail rejects malformed or invalid email addresses', () => {
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail(null), false);
  assert.equal(isValidEmail(undefined), false);
  assert.equal(isValidEmail('plainaddress'), false);
  assert.equal(isValidEmail('@missinguser.com'), false);
  assert.equal(isValidEmail('missingdomain@'), false);
  assert.equal(isValidEmail('missingdot@domain'), false);
  assert.equal(isValidEmail('spaces in@domain.com'), false);
  assert.equal(isValidEmail('double@@domain.com'), false);
});

test('validateDate enforces requirement and past date rules', () => {
  assert.equal(validateDate(''), 'Date is required');
  assert.equal(validateDate(null), 'Date is required');
  assert.equal(validateDate('2000-01-01'), 'Date cannot be in the past');
  assert.equal(validateDate('2000-01-01', { allowPast: true }), '');
  assert.equal(validateDate('2099-01-01'), '');
});

test('validateAvailability enforces complete scheduling constraints', () => {
  // Valid schedule
  const valid = validateAvailability({
    date: '2099-01-01',
    startTime: '09:00',
    endTime: '17:00',
    slotDuration: 30,
  });
  assert.deepEqual(valid, {});

  // Missing fields
  const missing = validateAvailability({
    date: '',
    startTime: '',
    endTime: '',
    slotDuration: '',
  });
  assert.equal(missing.date, 'Date is required');
  assert.equal(missing.startTime, 'Start time is required');
  assert.equal(missing.endTime, 'End time is required');
  assert.equal(missing.slotDuration, 'Between 10 and 120 minutes');

  // End time before start time
  const inverted = validateAvailability({
    date: '2099-01-01',
    startTime: '14:00',
    endTime: '10:00',
    slotDuration: 15,
  });
  assert.equal(inverted.endTime, 'End time must be after start time');

  // Slot duration out of bounds
  const badDurationLow = validateAvailability({
    date: '2099-01-01',
    startTime: '09:00',
    endTime: '10:00',
    slotDuration: 5,
  });
  assert.equal(badDurationLow.slotDuration, 'Between 10 and 120 minutes');

  const badDurationHigh = validateAvailability({
    date: '2099-01-01',
    startTime: '09:00',
    endTime: '10:00',
    slotDuration: 150,
  });
  assert.equal(badDurationHigh.slotDuration, 'Between 10 and 120 minutes');
});
