const createRateLimiter = (cooldownMs) => {
  const lastSeen = new Map();
  return (key) => {
    const now = Date.now();
    const last = lastSeen.get(key) || 0;
    if (now - last < cooldownMs) return false;
    lastSeen.set(key, now);
    return true;
  };
};

const createUserLimiter = ({ limit, windowMs }) => {
  const map = new Map();
  return (userID) => {
    const now = Date.now();
    const entry = map.get(userID) || { count: 0, time: now };
    if (now - entry.time > windowMs) {
      entry.count = 0;
      entry.time = now;
    }
    entry.count += 1;
    map.set(userID, entry);
    return entry.count <= limit;
  };
};

module.exports = {
  createRateLimiter,
  createUserLimiter
};
