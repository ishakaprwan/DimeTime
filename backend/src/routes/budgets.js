const express = require("express");
const db = require("../db");
const { wrap } = require("../middleware/errors");

const router = express.Router();

const validMonth = (value) =>
  typeof value === "string" &&
  /^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(value);

const monthToday = () => {
  const date = new Date();

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

// only count completed expenses, not scheduled payments
router.get(
  "/monthly",
  wrap(async (req, res) => {
    const month = req.query.month || monthToday();

    if (!validMonth(month)) {
      return res.status(400).json({
        error: "month must be YYYY-MM",
      });
    }

    const start = `${month}-01`;

    const { rows } = await db.query(
      `SELECT
         c.id,
         c.name,
         COALESCE(SUM(t.amount), 0) AS spent,
         m.budget_limit AS saved_budget_limit,
         CASE
           WHEN m.category_id IS NOT NULL THEN true
           ELSE false
         END AS has_saved_limit
       FROM categories c
       LEFT JOIN transactions t
         ON t.user_id = c.user_id
         AND t.category_id = c.id
         AND t.kind = 'expense'
         AND t.status = 'completed'
         AND t.occurred_on >= $2::date
         AND t.occurred_on < ($2::date + INTERVAL '1 month')
       LEFT JOIN LATERAL (
         SELECT
           b.category_id,
           b.budget_limit
         FROM monthly_budget_limits b
         WHERE b.user_id = c.user_id
           AND b.category_id = c.id
           AND b.month_start <= $2::date
         ORDER BY b.month_start DESC
         LIMIT 1
       ) m ON true
       WHERE c.user_id = $1
         AND c.kind = 'expense'
       GROUP BY
         c.id,
         c.name,
         m.category_id,
         m.budget_limit
       ORDER BY spent DESC, c.name ASC`,
      [req.userId, start],
    );

    res.json({
      month,
      categories: rows.map((row) => ({
        id: row.id,
        name: row.name,
        spent: Number(row.spent),
        budget_limit:
          row.has_saved_limit && row.saved_budget_limit !== null
            ? Number(row.saved_budget_limit)
            : null,
        has_saved_limit: row.has_saved_limit,
      })),
    });
  }),
);

// new limits carry forward until another month overrides them
// past months stay read-only so old budgets dont change accidentally
router.put(
  "/:categoryId",
  wrap(async (req, res) => {
    const month = req.query.month || monthToday();

    if (!validMonth(month)) {
      return res.status(400).json({
        error: "month must be YYYY-MM",
      });
    }

    if (month < monthToday()) {
      return res.status(409).json({
        error: "Past budget limits are read-only",
      });
    }

    const value = req.body && req.body.budget_limit;

    if (
      value !== null &&
      (value === undefined ||
        value === "" ||
        !Number.isFinite(Number(value)) ||
        Number(value) < 0 ||
        Number(value) > 9999999999.99)
    ) {
      return res.status(400).json({
        error: "budget_limit must be a non-negative amount or null",
      });
    }

    const category = await db.query(
      `SELECT id
       FROM categories
       WHERE id = $1
         AND user_id = $2
         AND kind = $3`,
      [req.params.categoryId, req.userId, "expense"],
    );

    if (!category.rows.length) {
      return res.status(404).json({
        error: "Expense category not found",
      });
    }

    const { rows } = await db.query(
      `INSERT INTO monthly_budget_limits (
         user_id,
         category_id,
         month_start,
         budget_limit
       )
       VALUES ($1, $2, $3::date, $4)
       ON CONFLICT (user_id, category_id, month_start)
       DO UPDATE SET budget_limit = EXCLUDED.budget_limit
       RETURNING *`,
      [req.userId, req.params.categoryId, `${month}-01`, value],
    );

    // keep the category's current limit in sync with this month's budget
    if (month === monthToday()) {
      await db.query(
        `UPDATE categories
         SET budget_limit = $3
         WHERE id = $1 AND user_id = $2`,
        [req.params.categoryId, req.userId, value],
      );
    }

    res.json(rows[0]);
  }),
);

module.exports = router;