const jwt = require("jsonwebtoken");
const db = require("../db");

// a valid token shouldnt give access if the account was deleted / the session was revoked
module.exports = async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({
      error: "Missing token",
    });
  }

  let payload;

  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch {
    return res.status(401).json({
      error: "Invalid or expired token",
    });
  }

  const accountId = Number(payload.sub);

  if (!Number.isSafeInteger(accountId) || accountId <= 0) {
    return res.status(401).json({
      error: "Invalid or expired token",
    });
  }

  try {
    const result = await db.query(
      "SELECT session_version FROM users WHERE id = $1",
      [accountId],
    );

    if (
      result.rowCount === 0 ||
      Number(payload.sv ?? 0) !== Number(result.rows[0].session_version)
    ) {
      return res.status(401).json({
        error: "Invalid or expired token",
      });
    }

    req.userId = accountId;

    return next();
  } catch (err) {
    return next(err);
  }
};