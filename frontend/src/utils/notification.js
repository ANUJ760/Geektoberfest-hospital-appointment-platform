/**
 * Format a raw notification payload into a standardized notification item.
 */
export const formatWaitingListNotification = (payload) => ({
  id: payload?.appointmentId || String(Date.now()),
  type: 'waiting_list_assigned',
  title: 'Waiting List Slot Assigned!',
  message:
    payload?.message ||
    (payload?.date && payload?.startTime
      ? `An appointment slot on ${payload.date} at ${payload.startTime} has been assigned to you!`
      : 'An appointment slot has been assigned to you from the waiting list!'),
  data: payload,
  createdAt: payload?.timestamp || new Date().toISOString(),
  read: false,
});
