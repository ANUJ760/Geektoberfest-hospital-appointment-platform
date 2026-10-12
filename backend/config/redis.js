const Redis = require('ioredis');

const DEFAULT_TTL = 300;
const redisUrl = process.env.REDIS_URL;

let client = null;
let lastLoggedError = null;

if (redisUrl) {
  client = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
    lazyConnect: true,
    retryStrategy(times) {
      return Math.min(times * 200, 3000);
    },
  });

  client.on('error', (err) => {
    const msg = err.message || String(err);
    if (lastLoggedError !== msg) {
      lastLoggedError = msg;
      console.warn(`[Redis] Connection warning: ${msg}`);
    }
  });

  client.on('connect', () => {
    if (lastLoggedError) {
      console.log('[Redis] Connected successfully');
      lastLoggedError = null;
    }
  });

  client.connect().catch(() => {});
}

/**
 * Retrieve and parse JSON value from Redis.
 * Returns parsed value or null on miss, disabled cache, or error.
 */
const getCache = async (key) => {
  if (!client) return null;
  try {
    const data = await client.get(key);
    if (!data) return null;
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
};

/**
 * Serialize and store value in Redis with TTL in seconds.
 * Silently ignores errors.
 */
const setCache = async (key, value, ttlSeconds = DEFAULT_TTL) => {
  if (!client) return;
  try {
    const str = JSON.stringify(value);
    const ttl = typeof ttlSeconds === 'number' && ttlSeconds > 0 ? ttlSeconds : DEFAULT_TTL;
    await client.set(key, str, 'EX', ttl);
  } catch (err) {
    // Silently ignore errors
  }
};

/**
 * Delete all keys matching the given pattern using a cursor-based SCAN loop.
 * Uses UNLINK if supported, falling back to DEL. Never uses KEYS.
 * Silently ignores errors.
 */
const clearCache = async (pattern) => {
  if (!client) return;
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys && keys.length > 0) {
        if (typeof client.unlink === 'function') {
          await client.unlink(...keys);
        } else {
          await client.del(...keys);
        }
      }
    } while (cursor !== '0');
  } catch (err) {
    // Silently ignore errors
  }
};

module.exports = {
  getCache,
  setCache,
  clearCache,
};
