const subscribers = new Map();
const recentNotifications = new Map();
const MAX_RECENT_PER_USER = 10;

/**
 * Handle incoming SSE stream connection for an authenticated user.
 */
const subscribe = (req, res) => {
  if (!req.user || !req.user._id) {
    if (typeof res.status === 'function') {
      res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    return;
  }

  const userId = String(req.user._id);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  if (!subscribers.has(userId)) {
    subscribers.set(userId, new Set());
  }
  subscribers.get(userId).add(res);

  const recent = recentNotifications.get(userId) || [];

  // Send initial handshake with status and recent notifications
  try {
    res.write(
      `event: connected\ndata: ${JSON.stringify({
        status: 'connected',
        timestamp: new Date().toISOString(),
        recent,
      })}\n\n`
    );
  } catch (err) {
    // Client dropped early
    const set = subscribers.get(userId);
    if (set) {
      set.delete(res);
      if (set.size === 0) subscribers.delete(userId);
    }
    return;
  }

  const cleanup = () => {
    const userSet = subscribers.get(userId);
    if (userSet) {
      userSet.delete(res);
      if (userSet.size === 0) {
        subscribers.delete(userId);
      }
    }
  };

  req.on('close', cleanup);
  res.on('error', cleanup);
};

/**
 * Send an event payload to a specific patient/user.
 */
const notifyPatient = (userId, payload) => {
  if (!userId) return false;
  const targetId = String(userId);
  const data = payload || {};

  // Store in recent buffer
  if (!recentNotifications.has(targetId)) {
    recentNotifications.set(targetId, []);
  }
  const history = recentNotifications.get(targetId);
  history.unshift({ ...data, timestamp: new Date().toISOString() });
  if (history.length > MAX_RECENT_PER_USER) {
    history.pop();
  }

  const userSet = subscribers.get(targetId);
  if (!userSet || userSet.size === 0) {
    return false;
  }

  const message = `event: waiting_list_assigned\ndata: ${JSON.stringify(data)}\n\n`;
  const clients = Array.from(userSet);
  let deliveredCount = 0;

  for (const client of clients) {
    try {
      client.write(message);
      deliveredCount++;
    } catch (err) {
      userSet.delete(client);
    }
  }

  if (userSet.size === 0) {
    subscribers.delete(targetId);
  }

  return deliveredCount > 0;
};

const getSubscriberCount = (userId) => {
  if (userId) {
    return subscribers.get(String(userId))?.size || 0;
  }
  let total = 0;
  for (const set of subscribers.values()) {
    total += set.size;
  }
  return total;
};

const getRecentNotifications = (userId) => {
  if (!userId) return [];
  return recentNotifications.get(String(userId)) || [];
};

const reset = () => {
  subscribers.clear();
  recentNotifications.clear();
};

module.exports = {
  subscribe,
  notifyPatient,
  getSubscriberCount,
  getRecentNotifications,
  reset,
};
