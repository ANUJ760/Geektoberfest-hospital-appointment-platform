import test from 'node:test';
import assert from 'node:assert/strict';
import { formatWaitingListNotification } from '../src/utils/notification.js';

test('formatWaitingListNotification formats valid payload with custom message and metadata', () => {
  const payload = {
    appointmentId: 'appt_123',
    doctorId: 'doc_456',
    date: '2025-08-10',
    startTime: '10:00',
    endTime: '10:30',
    message: 'A slot on 2025-08-10 at 10:00 has been assigned to you!',
    timestamp: '2025-08-01T12:00:00.000Z',
  };

  const notification = formatWaitingListNotification(payload);

  assert.equal(notification.id, 'appt_123');
  assert.equal(notification.type, 'waiting_list_assigned');
  assert.equal(notification.title, 'Waiting List Slot Assigned!');
  assert.equal(notification.message, 'A slot on 2025-08-10 at 10:00 has been assigned to you!');
  assert.equal(notification.createdAt, '2025-08-01T12:00:00.000Z');
  assert.equal(notification.read, false);
  assert.deepEqual(notification.data, payload);
});

test('formatWaitingListNotification constructs fallback message when message property is omitted', () => {
  const payload = {
    appointmentId: 'appt_789',
    date: '2025-09-15',
    startTime: '14:00',
  };

  const notification = formatWaitingListNotification(payload);

  assert.equal(notification.id, 'appt_789');
  assert.match(notification.message, /2025-09-15/);
  assert.match(notification.message, /14:00/);
  assert.equal(notification.read, false);
});

test('formatWaitingListNotification handles empty or null payload gracefully', () => {
  const notificationNull = formatWaitingListNotification(null);
  assert.ok(notificationNull.id);
  assert.equal(notificationNull.type, 'waiting_list_assigned');
  assert.match(notificationNull.message, /waiting list/i);
  assert.equal(notificationNull.read, false);

  const notificationEmpty = formatWaitingListNotification({});
  assert.ok(notificationEmpty.id);
  assert.equal(notificationEmpty.type, 'waiting_list_assigned');
  assert.match(notificationEmpty.message, /waiting list/i);
  assert.equal(notificationEmpty.read, false);
});
