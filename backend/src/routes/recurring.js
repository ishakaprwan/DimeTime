const express = require("express");
const db = require("../db");
const { wrap } = require("../middleware/errors");

// recurring payment routes for managing regular income + expenses
const router = express.Router();

// allowed payment types + repeat frequencies
const KINDS = ["income", "expense"];
const FREQUENCIES = ["weekly", "monthly", "termly"];

// check recurring payment details before saving
function validate(body) {
  if (!KINDS.includes(body.kind)) {
    return "kind must be income or expense";
  }

  const amount = Number(body.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return "amount must be a positive number";
  }

  if (!FREQUENCIES.includes(body.frequency)) {
    return "frequency must be weekly, monthly or termly";
  }

  if (!body.next_date || isNaN(Date.parse(body.next_date))) {
    return "next_date must be a valid date";
  }

  return null;
}

// helpers for handling payment dates
function dateFromString(value) {
  // postgreSQL can return dates as Date objects instead of strings
  if (value instanceof Date) {
    return new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      12,
      0,
      0,
    );
  }

  // also handle plain dates + ISO timestamps
  if (typeof value === "string") {
    const datePart = value.split("T")[0];
    const [year, month, day] = datePart.split("-").map(Number);

    return new Date(year, month - 1, day, 12, 0, 0);
  }

  // return an invalid date if the input isnt recognised
  return new Date(NaN);
}

// convert dates back to yyyy-mm-dd for the API
function dateToString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// move a payment date forward by a set number of days
function addDays(date, days) {
  const next = new Date(date);

  next.setDate(next.getDate() + days);

  return next;
}

// move to the next month without going past its last day
function addMonth(date) {
  const originalDay = date.getDate();

  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1, 12, 0, 0);

  const lastDayOfTargetMonth = new Date(
    next.getFullYear(),
    next.getMonth() + 1,
    0,
  ).getDate();

  next.setDate(Math.min(originalDay, lastDayOfTargetMonth));

  return next;
}

// work out which recurring payments fall within the selected dates
function getOccurrences(item, from, to) {
  const occurrences = [];

  let occurrenceDate = dateFromString(item.next_date);

  if (Number.isNaN(occurrenceDate.getTime())) {
    return occurrences;
  }

  // termly payments use the date entered by the user, no automatic intervals
  if (item.frequency === "termly") {
    if (occurrenceDate >= from && occurrenceDate <= to) {
      occurrences.push(new Date(occurrenceDate));
    }

    return occurrences;
  }

  // move older payment dates forward until we reach the forecast period
  while (occurrenceDate < from) {
    if (item.frequency === "weekly") {
      occurrenceDate = addDays(occurrenceDate, 7);
    } else if (item.frequency === "monthly") {
      occurrenceDate = addMonth(occurrenceDate);
    } else {
      break;
    }
  }

  // add each payment that falls within the requested dates
  while (occurrenceDate <= to) {
    occurrences.push(new Date(occurrenceDate));

    if (item.frequency === "weekly") {
      occurrenceDate = addDays(occurrenceDate, 7);
    } else if (item.frequency === "monthly") {
      occurrenceDate = addMonth(occurrenceDate);
    } else {
      break;
    }
  }

  return occurrences;
}

// forecast upcoming recurring + scheduled payments
// keep this route before any /:id routes
router.get(
  "/forecast",
  wrap(async (req, res) => {
    const today = new Date();

    today.setHours(12, 0, 0, 0);

    const endOfMonth = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0,
      12,
      0,
      0,
    );

    const from = req.query.from ? dateFromString(req.query.from) : today;
    const to = req.query.to ? dateFromString(req.query.to) : endOfMonth;

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({
        error: "Invalid forecast date range",
      });
    }

    if (from > to) {
      return res.status(400).json({
        error: "Forecast start date must be before end date",
      });
    }

    const { rows } = await db.query(
      `
      SELECT
        r.id,
        r.kind,
        r.amount,
        r.description,
        r.frequency,
        r.next_date,
        r.active,
        r.category_id,
        c.name AS category
      FROM recurring_transactions r
      LEFT JOIN categories c
        ON c.id = r.category_id
        AND c.user_id = r.user_id
      WHERE r.user_id = $1
        AND r.active = TRUE
      ORDER BY r.next_date ASC
      `,
      [req.userId],
    );

    // calculate expected income + expenses from upcoming payments
    let expectedIncome = 0;
    let expectedExpenses = 0;

    const upcoming = [];

    for (const item of rows) {
      const occurrences = getOccurrences(item, from, to);

      for (const occurrenceDate of occurrences) {
        const amount = Number(item.amount);

        if (item.kind === "income") {
          expectedIncome += amount;
        } else {
          expectedExpenses += amount;
        }

        upcoming.push({
          recurring_id: item.id,
          kind: item.kind,
          amount,
          description: item.description,
          frequency: item.frequency,
          category_id: item.category_id,
          category: item.category,
          date: dateToString(occurrenceDate),
        });
      }
    }

    // include scheduled one-off payments in the forecast, but only once
    const scheduled = await db.query(
      `SELECT id, kind, amount, description, occurred_on, category_id
       FROM transactions
       WHERE user_id=$1 AND status='scheduled'
         AND occurred_on >= $2::date AND occurred_on <= $3::date
       ORDER BY occurred_on, id`,
      [req.userId, dateToString(from), dateToString(to)],
    );

    for (const item of scheduled.rows) {
      const amount = Number(item.amount);

      if (item.kind === "income") expectedIncome += amount;
      else expectedExpenses += amount;
      upcoming.push({
        transaction_id: item.id,
        kind: item.kind,
        amount,
        description: item.description,
        frequency: "one-off",
        category_id: item.category_id,
        date:
          typeof item.occurred_on === "string"
            ? item.occurred_on.slice(0, 10)
            : item.occurred_on.toISOString().slice(0, 10),
      });
    }

    // show upcoming payments in date order
    upcoming.sort((a, b) => dateFromString(a.date) - dateFromString(b.date));

    res.json({
      from: dateToString(from),
      to: dateToString(to),
      expected_income: expectedIncome,
      expected_expenses: expectedExpenses,
      net_change: expectedIncome - expectedExpenses,
      upcoming,
    });
  }),
);

// get all recurring payments belonging to the logged-in user
router.get(
  "/",
  wrap(async (req, res) => {
    const { rows } = await db.query(
      `
      SELECT
        r.id,
        r.kind,
        r.amount,
        r.description,
        r.frequency,
        r.next_date,
        r.active,
        r.category_id,
        c.name AS category
      FROM recurring_transactions r
      LEFT JOIN categories c
        ON c.id = r.category_id
        AND c.user_id = r.user_id
      WHERE r.user_id = $1
      ORDER BY
        r.active DESC,
        r.next_date ASC
      `,
      [req.userId],
    );

    res.json(rows);
  }),
);

// add a new recurring income or expense
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
      frequency,
      next_date,
      category_id = null,
    } = req.body;

    // save the new recurring payment under the logged-in user's account
    const { rows } = await db.query(
      `
      INSERT INTO recurring_transactions
      (
        user_id,
        category_id,
        kind,
        amount,
        description,
        frequency,
        next_date
      )
      VALUES
      ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        req.userId,
        category_id,
        kind,
        amount,
        description,
        frequency,
        next_date,
      ],
    );

    res.status(201).json(rows[0]);
  }),
);

// update an existing recurring payment
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
      frequency,
      next_date,
      category_id = null,
    } = req.body;

    // only update recurring payments belonging to the logged-in user
    const { rows } = await db.query(
      `
      UPDATE recurring_transactions
      SET
        category_id = $3,
        kind = $4,
        amount = $5,
        description = $6,
        frequency = $7,
        next_date = $8
      WHERE id = $1
        AND user_id = $2
      RETURNING *
      `,
      [
        req.params.id,
        req.userId,
        category_id,
        kind,
        amount,
        description,
        frequency,
        next_date,
      ],
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: "Recurring transaction not found",
      });
    }

    res.json(rows[0]);
  }),
);

// stop / restart a recurring payment
router.patch(
  "/:id/active",
  wrap(async (req, res) => {
    const { active } = req.body || {};

    if (typeof active !== "boolean") {
      return res.status(400).json({
        error: "active must be true or false",
      });
    }

    const { rows } = await db.query(
      `
      UPDATE recurring_transactions
      SET active = $3
      WHERE id = $1
        AND user_id = $2
      RETURNING *
      `,
      [req.params.id, req.userId, active],
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: "Recurring transaction not found",
      });
    }

    res.json(rows[0]);
  }),
);

// permanently delete a recurring payment
router.delete(
  "/:id",
  wrap(async (req, res) => {
    const result = await db.query(
      `
        DELETE FROM recurring_transactions
        WHERE id = $1
          AND user_id = $2
        `,
      [req.params.id, req.userId],
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: "Recurring transaction not found",
      });
    }

    res.status(204).end();
  }),
);

module.exports = router;