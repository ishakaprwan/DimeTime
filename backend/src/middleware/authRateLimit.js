const crypto = require("crypto");
const db = require("../db");

const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 15;

let requestsSinceCleanup = 0;

module.exports = async function authRateLimit(req, res, next) {
  const ip = String(req.ip || req.socket.remoteAddress || "unknown");

  const key = crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(ip)
    .digest("hex");

  try {
    // one atomic query keeps the limit consistent across server instances
    // reset the attempt count once the 15 minute window expires
    const result = await db.query(
      `INSERT INTO auth_rate_limits (
         client_key,
         window_start,
         attempt_count
       )
       VALUES ($1, NOW(), 1)
       ON CONFLICT (client_key)
       DO UPDATE SET
         attempt_count = CASE
           WHEN auth_rate_limits.window_start <= NOW() - INTERVAL '15 minutes'
           THEN 1
           ELSE auth_rate_limits.attempt_count + 1
         END,
         window_start = CASE
           WHEN auth_rate_limits.window_start <= NOW() - INTERVAL '15 minutes'
           THEN NOW()
           ELSE auth_rate_limits.window_start
         END
       RETURNING attempt_count, window_start`,
      [key],
    );

    const entry = result.rows[0];

    const resetMs =
      new Date(entry.window_start).getTime() + WINDOW_SECONDS * 1000;

    const retryAfter = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));

    res.set("RateLimit-Limit", String(MAX_ATTEMPTS));

    res.set(
      "RateLimit-Remaining",
      String(Math.max(0, MAX_ATTEMPTS - Number(entry.attempt_count))),
    );

    res.set("RateLimit-Reset", String(retryAfter));

    if (Number(entry.attempt_count) > MAX_ATTEMPTS) {
      res.set("Retry-After", String(retryAfter));

      return res.status(429).json({
        error: "Too many authentication attempts. Try again later.",
      });
    }

    // occasionally clear old records without holding up requests
    requestsSinceCleanup += 1;

    if (requestsSinceCleanup >= 100) {
      requestsSinceCleanup = 0;

      db.query(
        "DELETE FROM auth_rate_limits WHERE window_start < NOW() - INTERVAL '1 day'",
      ).catch((err) =>
        console.error("Rate-limit cleanup failed:", err.message),
      );
    }

    return next();
  } catch (err) {
    // dont allow requests through if the rate-limit database fails
    return next(err);
  }
};