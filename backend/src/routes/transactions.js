const express = require("express");
const db = require("../db");
const { wrap } = require("../middleware/errors");

const router = express.Router();

// allowed transaction types + payment statuses
const KINDS = ["income", "expense"];
const STATUSES = ["scheduled", "completed"];

// check the date follows the expected yyyy-mm-dd format
const isoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
    return false;
  }

  const date = new Date(`${value}T12:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};

const todayISO = () => new Date().toISOString().slice(0, 10);

// check transaction details before saving or updating
function validate(body) {
  if (!KINDS.includes(body.kind)) {
    return "kind must be income or expense";
  }

  const amount = Number(body.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return "amount must be a positive number";
  }

  if (body.occurred_on && !isoDate(body.occurred_on)) {
    return "occurred_on must be a valid YYYY-MM-DD date";
  }

  if (body.status != null && !STATUSES.includes(body.status)) {
    return "status must be scheduled or completed";
  }

  if (body.status === "completed" && body.occurred_on > todayISO()) {
    return "A future transaction cannot be completed yet";
  }

  if (
    body.status === "scheduled" &&
    (!body.occurred_on || body.occurred_on <= todayISO())
  ) {
    return "Scheduled transactions need a future date";
  }

  return null;
}

// get the user's transactions, with optional date + category filters
router.get(
  "/",
  wrap(async (req, res) => {
    const { from, to, category_id } = req.query;

    // only return records belonging to the logged-in user
    const where = ["t.user_id = $1"];
    const params = [req.userId];

    if (from) {
      params.push(from);
      where.push(`t.occurred_on >= $${params.length}`);
    }

    if (to) {
      params.push(to);
      where.push(`t.occurred_on <= $${params.length}`);
    }

    if (category_id) {
      params.push(category_id);
      where.push(`t.category_id = $${params.length}`);
    }

    const { rows } = await db.query(
      `SELECT
       t.id,
       t.kind,
       t.amount,
       t.description,
       t.occurred_on::date::text AS occurred_on,
       t.status,
       t.category_id,
       c.name AS category
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE ${where.join(" AND ")}
     ORDER BY t.occurred_on DESC, t.id DESC`,
      params,
    );

    res.json(rows);
  }),
);

// get daily income + expense movements from completed transactions
router.get(
  "/ledger-history",
  wrap(async (req, res) => {
    const { from, to } = req.query;

    if (!isoDate(from) || !isoDate(to) || from > to) {
      return res.status(400).json({
        error: "Valid from and to dates are required",
      });
    }

    const { rows } = await db.query(
      `SELECT
       occurred_on::date::text AS date,
       SUM(
         CASE
           WHEN kind = 'income' THEN amount
           ELSE -amount
         END
       ) AS net
     FROM transactions
     WHERE user_id = $1
       AND status = 'completed'
       AND occurred_on < LEAST(
         $2::date + INTERVAL '1 day',
         CURRENT_DATE + INTERVAL '1 day'
       )
     GROUP BY occurred_on::date
     ORDER BY occurred_on::date`,
      [req.userId, to],
    );

    res.json({
      daily: rows.map((row) => ({
        date: row.date,
        net: Number(row.net),
      })),
    });
  }),
);

// calculate the total recorded income, expenses + remaining balance
router.get(
  "/ledger-balance",
  wrap(async (req, res) => {
    const { rows } = await db.query(
      `SELECT
       COALESCE(
         SUM(amount) FILTER (WHERE kind = 'income'),
         0
       ) AS income,
       COALESCE(
         SUM(amount) FILTER (WHERE kind = 'expense'),
         0
       ) AS expense
     FROM transactions
     WHERE user_id = $1
       AND status = 'completed'
       AND occurred_on <= CURRENT_DATE`,
      [req.userId],
    );

    const income = Number(rows[0].income);
    const expense = Number(rows[0].expense);

    res.json({
      income,
      expense,
      balance: income - expense,
      asOf: new Date().toISOString().slice(0, 10),
    });
  }),
);

// calculate income, spending + category totals for the selected period
router.get(
  "/summary",
  wrap(async (req, res) => {
    const now = new Date();

    const first = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);

    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);

    const from = req.query.from || first;
    const to = req.query.to || last;

    const totals = await db.query(
      `SELECT
       COALESCE(
         SUM(amount) FILTER (WHERE kind = 'income'),
         0
       ) AS income,
       COALESCE(
         SUM(amount) FILTER (WHERE kind = 'expense'),
         0
       ) AS expense
     FROM transactions
     WHERE user_id = $1
       AND status = 'completed'
       AND occurred_on BETWEEN $2 AND $3`,
      [req.userId, from, to],
    );

    // work out spending totals for each expense category
    const byCategory = await db.query(
      `SELECT
       c.id,
       c.name,
       c.budget_limit,
       COALESCE(SUM(t.amount), 0) AS spent
     FROM categories c
     LEFT JOIN transactions t
       ON t.category_id = c.id
       AND t.user_id = c.user_id
       AND t.kind = 'expense'
       AND t.status = 'completed'
       AND t.occurred_on BETWEEN $2 AND $3
     WHERE c.user_id = $1
       AND c.kind = 'expense'
     GROUP BY c.id
     ORDER BY spent DESC`,
      [req.userId, from, to],
    );

    const income = Number(totals.rows[0].income);
    const expense = Number(totals.rows[0].expense);

    res.json({
      from,
      to,
      income,
      expense,
      balance: income - expense,
      categories: byCategory.rows.map((row) => ({
        id: row.id,
        name: row.name,
        spent: Number(row.spent),
        budget_limit:
          row.budget_limit === null ? null : Number(row.budget_limit),
      })),
    });
  }),
);

// add a new one-off transaction to the user's account
router.post(
  "/",
  wrap(async (req, res) => {
    const error = validate(req.body || {});

    if (error) {
      return res.status(400).json({ error });
    }

    const {
      kind,
      amount,
      description = "",
      occurred_on,
      category_id = null,
      status = "completed",
    } = req.body;

    const { rows } = await db.query(
      `INSERT INTO transactions (
       user_id,
       category_id,
       kind,
       amount,
       description,
       occurred_on,
       status
     )
     VALUES (
       $1, $2, $3, $4, $5,
       COALESCE($6, CURRENT_DATE),
       $7
     )
     RETURNING *`,
      [
        req.userId,
        category_id,
        kind,
        amount,
        description,
        occurred_on || null,
        status,
      ],
    );

    res.status(201).json(rows[0]);
  }),
);

// mark a scheduled payment as completed using today's date
router.patch(
  "/:id/complete",
  wrap(async (req, res) => {
    const { rows } = await db.query(
      `UPDATE transactions
     SET
       status = 'completed',
       occurred_on = CURRENT_DATE
     WHERE id = $1
       AND user_id = $2
       AND status = 'scheduled'
     RETURNING *`,
      [req.params.id, req.userId],
    );

    if (!rows[0]) {
      return res.status(409).json({
        error: "Scheduled payment not found or already completed.",
      });
    }

    res.json(rows[0]);
  }),
);

// update an existing transaction belonging to user
router.put(
  "/:id",
  wrap(async (req, res) => {
    const error = validate(req.body || {});

    if (error) {
      return res.status(400).json({ error });
    }

    const {
      kind,
      amount,
      description = "",
      occurred_on,
      category_id = null,
      status = null,
    } = req.body;

    const { rows } = await db.query(
      `UPDATE transactions
     SET
       kind = $3,
       amount = $4,
       description = $5,
       occurred_on = COALESCE($6, occurred_on),
       category_id = $7,
       status = COALESCE($8, status)
     WHERE id = $1
       AND user_id = $2
     RETURNING *`,
      [
        req.params.id,
        req.userId,
        kind,
        amount,
        description,
        occurred_on || null,
        category_id,
        status,
      ],
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: "Not found",
      });
    }

    res.json(rows[0]);
  }),
);

// delete a transaction belonging to the user
router.delete(
  "/:id",
  wrap(async (req, res) => {
    const result = await db.query(
      `DELETE FROM transactions
     WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId],
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: "Not found",
      });
    }

    res.status(204).end();
  }),
);

module.exports = router;