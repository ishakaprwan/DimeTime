const express = require("express");
const { query } = require("../db");

const router = express.Router();

// get the logged-in user's saved student profile
router.get("/", async (req, res, next) => {
  try {
    const result = await query(
      "SELECT data, updated_at FROM student_profiles WHERE user_id=$1",
      [req.userId],
    );

    res.json({
      exists: result.rowCount > 0,
      data: result.rows[0]?.data ?? null,
      updatedAt: result.rows[0]?.updated_at ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// check + save student profile data to PostgreSQL
router.put("/", async (req, res, next) => {
  try {
    const data = req.body?.data;

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      JSON.stringify(data).length > 200000
    ) {
      return res
        .status(400)
        .json({ error: "Invalid student profile (maximum 200 KB)" });
    }

    // create a profile if it doesnt exist, otherwise update it
    const result = await query(
      `INSERT INTO student_profiles (user_id, data)
   VALUES ($1, $2::jsonb)
   ON CONFLICT (user_id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()
   RETURNING updated_at`,
      [req.userId, JSON.stringify(data)],
    );
    res.json({ ok: true, updatedAt: result.rows[0].updated_at });
  } catch (err) {
    next(err);
  }
});

module.exports = router;