const express = require("express");
const db = require("../db");
const { wrap } = require("../middleware/errors");

const router = express.Router();

const KINDS = ["income", "expense"];

router.get(
  "/",
  wrap(async (req, res) => {
    const { rows } = await db.query(
      "SELECT id, name, kind, budget_limit FROM categories WHERE user_id=$1 ORDER BY id ASC",
      [req.userId],
    );

    res.json(rows);
  }),
);

router.post(
  "/",
  wrap(async (req, res) => {
    const { name, kind, budget_limit = null } = req.body || {};

    if (!name || !KINDS.includes(kind))
      return res
        .status(400)
        .json({ error: "name and kind (income|expense) required" });

    const { rows } = await db.query(
      "INSERT INTO categories (user_id, name, kind, budget_limit) VALUES ($1,$2,$3,$4) RETURNING *",
      [req.userId, name.trim(), kind, budget_limit],
    );

    res.status(201).json(rows[0]);
  }),
);

router.put(
  "/:id",
  wrap(async (req, res) => {
    const { name, budget_limit } = req.body || {};

    const { rows } = await db.query(
      `UPDATE categories SET name = COALESCE($3, name), budget_limit = $4
     WHERE id=$1 AND user_id=$2 RETURNING *`,
      [
        req.params.id,
        req.userId,
        name ? name.trim() : null,
        budget_limit ?? null,
      ],
    );

    if (!rows[0]) return res.status(404).json({ error: "Not found" });

    res.json(rows[0]);
  }),
);

router.delete(
  "/:id",
  wrap(async (req, res) => {
    const r = await db.query(
      "DELETE FROM categories WHERE id=$1 AND user_id=$2",
      [req.params.id, req.userId],
    );

    if (!r.rowCount) return res.status(404).json({ error: "Not found" });

    res.status(204).end();
  }),
);

module.exports = router;