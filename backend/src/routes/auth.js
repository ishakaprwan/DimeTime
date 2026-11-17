const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../db");
const requireAuth = require("../middleware/auth");
const authRateLimit = require("../middleware/authRateLimit");
const { wrap } = require("../middleware/errors");

const router = express.Router();

// limit repeated authentication attempts
router.use(
  [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/change-password",
  ],
  authRateLimit,
);

const sign = (id, version = 0) =>
  jwt.sign({ sub: id, sv: version }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

const validPassword = (value) =>
  typeof value === "string" &&
  value.length >= 8 &&
  /[A-Z]/.test(value) &&
  /[^A-Za-z0-9\s]/.test(value);

const DEFAULT_CATEGORIES = [
  ["Job Salary", "income"],
  ["Part-time job", "income"],
  ["Student Loan", "income"],
  ["Maintenance Loan", "income"],
  ["Family Support", "income"],
  ["Rent", "expense"],
  ["Groceries", "expense"],
  ["Takeout", "expense"],
  ["Subscriptions", "expense"],
  ["Tuition fees", "expense"],
  ["Transportation", "expense"],
];

router.post(
  "/register",
  wrap(async (req, res) => {
    const {
      email,
      password,
      name,
      university,
      displayCurrency = "GBP",
    } = req.body || {};

    const supportedCurrencies = new Set([
      "GBP",
      "EUR",
      "USD",
      "INR",
      "CAD",
      "AUD",
      "NZD",
      "JPY",
      "CHF",
    ]);

    if (
      typeof university !== "string" ||
      !university.trim() ||
      university.trim().length > 160
    ) {
      return res.status(400).json({
        error: "University or school name required (maximum 160 characters)",
      });
    }

    if (!supportedCurrencies.has(displayCurrency)) {
      return res.status(400).json({
        error: "Unsupported display currency",
      });
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({
        error: "Valid email required",
      });
    }

    if (!validPassword(password)) {
      return res.status(400).json({
        error:
          "Password must contain at least 8 characters, one uppercase letter and one symbol. 12 or more characters are recommended.",
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: "Name required",
      });
    }

    const hash = await bcrypt.hash(password, 12);

    // save the account, student profile + default categories together
    // rollback everything if part of registration fails
    const client = await db.pool.connect();
    let user;

    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, name)
         VALUES ($1, $2, $3)
         RETURNING id, email, name`,
        [email.toLowerCase(), hash, name.trim()],
      );

      user = rows[0];

      await client.query(
        `INSERT INTO student_profiles (user_id, data)
         VALUES ($1, $2::jsonb)`,
        [
          user.id,
          JSON.stringify({
            university: university.trim(),
            displayCurrency,
            onboardingCompleted: false,
          }),
        ],
      );

      for (const [categoryName, kind] of DEFAULT_CATEGORIES) {
        await client.query(
          `INSERT INTO categories (user_id, name, kind)
           VALUES ($1, $2, $3)`,
          [user.id, categoryName, kind],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.status(201).json({
      token: sign(user.id, 0),
      user,
    });
  }),
);

router.post(
  "/login",
  wrap(async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password required",
      });
    }

    const { rows } = await db.query(
      `SELECT *
       FROM users
       WHERE email = $1`,
      [email.toLowerCase()],
    );

    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    res.json({
      token: sign(user.id, user.session_version),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  }),
);

router.get(
  "/me",
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await db.query(
      `SELECT id, email, name
       FROM users
       WHERE id = $1`,
      [req.userId],
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    res.json(rows[0]);
  }),
);

// require password confirmation before deleting the account
// linked records are removed through ON DELETE CASCADE
router.delete(
  "/me",
  requireAuth,
  wrap(async (req, res) => {
    const password = req.body?.password;

    if (typeof password !== "string" || !password) {
      return res.status(400).json({
        error: "Password confirmation required",
      });
    }

    const result = await db.query(
      `SELECT password_hash
       FROM users
       WHERE id = $1`,
      [req.userId],
    );

    if (
      !result.rows[0] ||
      !(await bcrypt.compare(password, result.rows[0].password_hash))
    ) {
      return res.status(403).json({
        error: "Incorrect password",
      });
    }

    await db.query(
      `DELETE FROM users
       WHERE id = $1`,
      [req.userId],
    );

    res.json({
      ok: true,
      message:
        "Account and linked database records deleted. Provider backups may be retained according to their backup policy.",
    });
  }),
);

// changing the password invalidates existing JWTs through the session version
router.post(
  "/change-password",
  requireAuth,
  wrap(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};

    if (!validPassword(newPassword)) {
      return res.status(400).json({
        error:
          "Use at least 8 characters, including an uppercase letter and a symbol.",
      });
    }

    const current = await db.query(
      `SELECT password_hash
       FROM users
       WHERE id = $1`,
      [req.userId],
    );

    if (
      !current.rows[0] ||
      typeof currentPassword !== "string" ||
      !(await bcrypt.compare(currentPassword, current.rows[0].password_hash))
    ) {
      return res.status(403).json({
        error: "Current password is incorrect.",
      });
    }

    if (await bcrypt.compare(newPassword, current.rows[0].password_hash)) {
      return res.status(400).json({
        error: "Choose a different password.",
      });
    }

    const hash = await bcrypt.hash(newPassword, 12);

    await db.query(
      `UPDATE users
       SET
         password_hash = $1,
         session_version = session_version + 1
       WHERE id = $2`,
      [hash, req.userId],
    );

    await db.query(
      `DELETE FROM password_reset_tokens
       WHERE user_id = $1`,
      [req.userId],
    );

    return res.json({
      ok: true,
      message: "Password changed. Sign in again on all devices.",
    });
  }),
);

// use the same response whether the email belongs to an account or not
router.post(
  "/forgot-password",
  wrap(async (req, res) => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
      return res.status(400).json({
        error: "Enter a valid email address.",
      });
    }

    if (
      !process.env.RESEND_API_KEY ||
      !process.env.RESET_FROM_EMAIL ||
      !process.env.APP_PUBLIC_URL
    ) {
      return res.status(503).json({
        error:
          "Password recovery is not configured yet. Please contact support.",
      });
    }

    const result = await db.query(
      `SELECT id
       FROM users
       WHERE email = $1`,
      [email],
    );

    const generic = {
      message:
        "If an account exists for that address, a reset link will be sent.",
    };

    if (!result.rows.length) {
      return res.json(generic);
    }

    const userId = result.rows[0].id;

    // only store the token hash, never the actual reset token
    const raw = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");

    const base = process.env.APP_PUBLIC_URL.replace(/\/$/, "");
    const url = new URL(base);

    url.searchParams.set("reset_token", raw);

    await db.query(
      `INSERT INTO password_reset_tokens (
         user_id,
         token_hash,
         expires_at
       )
       VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
      [userId, tokenHash],
    );

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESET_FROM_EMAIL,
        to: [email],
        subject: "Reset your DimeTime password",
        text:
          `A password reset was requested for your DimeTime account. ` +
          `Use this link within 30 minutes: ${url.toString()}\n\n` +
          `If you did not request this, ignore this email.`,
      }),
    });

    if (!emailResponse.ok) {
      await db.query(
        `DELETE FROM password_reset_tokens
         WHERE token_hash = $1`,
        [tokenHash],
      );

      console.error(
        "Password reset email delivery failed:",
        emailResponse.status,
      );

      return res.status(503).json({
        error:
          "Password reset email is temporarily unavailable. Try again later.",
      });
    }

    res.json(generic);
  }),
);

// mark reset tokens as used inside a transaction to prevent reuse
router.post(
  "/reset-password",
  wrap(async (req, res) => {
    const { token, newPassword } = req.body || {};

    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
      return res.status(400).json({
        error: "Invalid or expired reset link.",
      });
    }

    if (!validPassword(newPassword)) {
      return res.status(400).json({
        error:
          "Use at least 8 characters, including an uppercase letter and a symbol.",
      });
    }

    const hash = crypto.createHash("sha256").update(token).digest("hex");

    const client = await db.pool.connect();

    try {
      await client.query("BEGIN");

      const record = await client.query(
        `UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE token_hash = $1
           AND used_at IS NULL
           AND expires_at > NOW()
         RETURNING user_id`,
        [hash],
      );

      if (!record.rows.length) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          error: "Invalid or expired reset link.",
        });
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      const uid = record.rows[0].user_id;

      await client.query(
        `UPDATE users
         SET
           password_hash = $1,
           session_version = session_version + 1
         WHERE id = $2`,
        [passwordHash, uid],
      );

      await client.query(
        `DELETE FROM password_reset_tokens
         WHERE user_id = $1`,
        [uid],
      );

      await client.query("COMMIT");

      return res.json({
        ok: true,
        message: "Password reset successfully. You can now sign in.",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

module.exports = router;