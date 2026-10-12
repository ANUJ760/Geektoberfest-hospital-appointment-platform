const subscribers = new Map();

/**
 * Handle incoming SSE stream connection for an authenticated user.
 */
const subscribe = (req, res) => {
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

  // Send initial handshake
  res.write(
    `event: connected\ndata: ${JSON.stringify({ status: 'connected', timestamp: new Date().toISOString() })}\n\n`
  );

  req.on('close', () => {
    const userSet = subscribers.get(userId);
    if (userSet) {
      userSet.delete(res);
      if (userSet.size === 0) {
        subscribers.delete(userId);
      }
    }
  });
};

/**
 * Send an event payload to a specific patient/user.
 */
const notifyPatient = (userId, payload) => {
  const targetId = String(userId);
  const userSet = subscribers.get(targetId);
  if (!userSet || userSet.size === 0) {
    return false;
  }

  const message = `event: waiting_list_assigned\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of userSet) {
    try {
      client.write(message);
    } catch (err) {
      userSet.delete(client);
    }
  }
  return true;
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

const reset = () => {
  subscribers.clear();
};

module.exports = {
  subscribe,
  notifyPatient,
  getSubscriberCount,
  reset,
};
