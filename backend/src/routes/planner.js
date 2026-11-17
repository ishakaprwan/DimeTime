const express = require("express");
const db = require("../db");
const { wrap } = require("../middleware/errors");

const router = express.Router();

const ITEM_TYPES = ["university", "work", "personal", "money"];

const FREQUENCIES = ["weekly", "fortnightly", "monthly", "yearly"];

function toDateString(value) {
  if (!value) return "";

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  if (typeof value === "string") {
    return value.split("T")[0];
  }

  return "";
}

function dateFromString(value) {
  const dateString = toDateString(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return new Date(NaN);
  }

  const [year, month, day] = dateString.split("-").map(Number);

  const date = new Date(year, month - 1, day, 12, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return new Date(NaN);
  }

  return date;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isValidDate(value) {
  return !Number.isNaN(dateFromString(value).getTime());
}

function isValidTime(value) {
  if (value === null || value === undefined || value === "") {
    return true;
  }

  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// keep the original day where possible, otherwise use the last day of the month
function addMonthClamped(date, preferredDay) {
  const nextYear =
    date.getMonth() === 11 ? date.getFullYear() + 1 : date.getFullYear();

  const nextMonth = (date.getMonth() + 1) % 12;

  const lastDay = new Date(nextYear, nextMonth + 1, 0).getDate();

  return new Date(
    nextYear,
    nextMonth,
    Math.min(preferredDay, lastDay),
    12,
    0,
    0,
  );
}

// handle dates like 29 feb when moving to the next year
function addYearClamped(date, preferredMonth, preferredDay) {
  const nextYear = date.getFullYear() + 1;

  const lastDay = new Date(nextYear, preferredMonth + 1, 0).getDate();

  return new Date(
    nextYear,
    preferredMonth,
    Math.min(preferredDay, lastDay),
    12,
    0,
    0,
  );
}

function getTodayString() {
  return formatDate(new Date());
}

function validate(body) {
  if (!body.title || !String(body.title).trim()) {
    return "title is required";
  }

  if (!ITEM_TYPES.includes(body.item_type)) {
    return "item_type must be university, work, personal or money";
  }

  if (!body.item_date || !isValidDate(body.item_date)) {
    return "item_date must be a valid date";
  }

  if (!isValidTime(body.start_time)) {
    return "start_time must be a valid time";
  }

  if (!isValidTime(body.end_time)) {
    return "end_time must be a valid time";
  }

  if (body.end_time && !body.start_time) {
    return "start_time is required when end_time is provided";
  }

  if (body.start_time && body.end_time && body.end_time <= body.start_time) {
    return "end_time must be after start_time";
  }

  return null;
}

function validateRecurring(body) {
  if (!body.title || !String(body.title).trim()) {
    return "title is required";
  }

  if (!ITEM_TYPES.includes(body.item_type)) {
    return "item_type must be university, work, personal or money";
  }

  if (!body.start_date || !isValidDate(body.start_date)) {
    return "start_date must be a valid date";
  }

  if (!FREQUENCIES.includes(body.frequency)) {
    return "frequency must be weekly, fortnightly, monthly or yearly";
  }

  if (body.repeat_until && !isValidDate(body.repeat_until)) {
    return "repeat_until must be a valid date";
  }

  if (
    body.repeat_until &&
    toDateString(body.repeat_until) < toDateString(body.start_date)
  ) {
    return "repeat_until cannot be before start_date";
  }

  if (!isValidTime(body.start_time)) {
    return "start_time must be a valid time";
  }

  if (!isValidTime(body.end_time)) {
    return "end_time must be a valid time";
  }

  if (body.end_time && !body.start_time) {
    return "start_time is required when end_time is provided";
  }

  if (body.start_time && body.end_time && body.end_time <= body.start_time) {
    return "end_time must be after start_time";
  }

  return null;
}

// generate recurring dates, skipping any excluded occurrences
function getRecurringOccurrences(
  recurringItem,
  from,
  to,
  exceptionKeys = new Set(),
) {
  const occurrences = [];

  let currentDate = dateFromString(recurringItem.start_date);
  const fromDate = dateFromString(from);
  const toDate = dateFromString(to);

  if (
    Number.isNaN(currentDate.getTime()) ||
    Number.isNaN(fromDate.getTime()) ||
    Number.isNaN(toDate.getTime())
  ) {
    return occurrences;
  }

  const repeatUntil = recurringItem.repeat_until
    ? dateFromString(recurringItem.repeat_until)
    : null;

  const originalDay = currentDate.getDate();
  const originalMonth = currentDate.getMonth();

  // stop recurring events from generating forever if something goes wrong
  let safety = 0;

  while (currentDate <= toDate && safety < 5000) {
    if (repeatUntil && currentDate > repeatUntil) {
      break;
    }

    const occurrenceDate = formatDate(currentDate);

    const exceptionKey = `${recurringItem.id}:${occurrenceDate}`;

    if (currentDate >= fromDate && !exceptionKeys.has(exceptionKey)) {
      occurrences.push({
        id: `recurring-${recurringItem.id}-${occurrenceDate}`,
        recurring_id: recurringItem.id,
        source: "recurring",
        recurring: true,
        title: recurringItem.title,
        item_type: recurringItem.item_type,
        item_date: occurrenceDate,
        start_time: recurringItem.start_time,
        end_time: recurringItem.end_time,
        notes: recurringItem.notes,
        completed: false,
        frequency: recurringItem.frequency,
        active: recurringItem.active,
      });
    }

    if (recurringItem.frequency === "weekly") {
      currentDate = addDays(currentDate, 7);
    } else if (recurringItem.frequency === "fortnightly") {
      currentDate = addDays(currentDate, 14);
    } else if (recurringItem.frequency === "monthly") {
      currentDate = addMonthClamped(currentDate, originalDay);
    } else if (recurringItem.frequency === "yearly") {
      currentDate = addYearClamped(currentDate, originalMonth, originalDay);
    } else {
      break;
    }

    safety += 1;
  }

  return occurrences;
}

function sortPlannerItems(items) {
  return items.sort((a, b) => {
    const dateCompare = String(a.item_date).localeCompare(String(b.item_date));

    if (dateCompare !== 0) {
      return dateCompare;
    }

    if (!a.start_time && b.start_time) {
      return 1;
    }

    if (a.start_time && !b.start_time) {
      return -1;
    }

    return String(a.start_time || "").localeCompare(String(b.start_time || ""));
  });
}

// load one-off events + recurring rules, then merge them into a single list
async function loadOccurrences(userId, from, to, options = {}) {
  const { hideCompleted = false } = options;

  const completedCondition = hideCompleted ? "AND completed = FALSE" : "";

  const normalResult = await db.query(
    `
      SELECT
        id,
        title,
        item_type,
        item_date,
        start_time,
        end_time,
        notes,
        completed,
        created_at
      FROM planner_items
      WHERE user_id = $1
        AND item_date >= $2
        AND item_date <= $3
        ${completedCondition}
      `,
    [userId, from, to],
  );

  const recurringResult = await db.query(
    `
      SELECT
        id,
        title,
        item_type,
        start_date,
        start_time,
        end_time,
        notes,
        frequency,
        repeat_until,
        active,
        created_at
      FROM recurring_planner_items
      WHERE user_id = $1
        AND active = TRUE
        AND start_date <= $2
        AND (
          repeat_until IS NULL
          OR repeat_until >= $3
        )
      ORDER BY
        start_date ASC,
        start_time ASC NULLS LAST
      `,
    [userId, to, from],
  );

  const exceptionResult = await db.query(
    `
      SELECT
        recurring_id,
        occurrence_date
      FROM recurring_planner_exceptions
      WHERE user_id = $1
        AND occurrence_date >= $2
        AND occurrence_date <= $3
      `,
    [userId, from, to],
  );

  // use a set to quickly skip individual dates removed from recurring series
  const exceptionKeys = new Set(
    exceptionResult.rows.map(
      (row) => `${row.recurring_id}:${toDateString(row.occurrence_date)}`,
    ),
  );

  const normalItems = normalResult.rows.map((item) => ({
    ...item,
    item_date: toDateString(item.item_date),
    source: "single",
    recurring: false,
  }));

  // combine one-off + repeating events for the requested date range
  const recurringItems = recurringResult.rows.flatMap((item) =>
    getRecurringOccurrences(item, from, to, exceptionKeys),
  );

  return sortPlannerItems([...normalItems, ...recurringItems]);
}

router.get(
  "/occurrences",
  wrap(async (req, res) => {
    const from = req.query.from || getTodayString();

    const defaultTo = formatDate(addDays(dateFromString(from), 90));

    const to = req.query.to || defaultTo;

    if (!isValidDate(from) || !isValidDate(to)) {
      return res.status(400).json({
        error: "from and to must be valid dates",
      });
    }

    if (to < from) {
      return res.status(400).json({
        error: "to cannot be before from",
      });
    }

    const items = await loadOccurrences(req.userId, from, to);

    res.json(items);
  }),
);

// dashboard only needs the next 4 incomplete events
router.get(
  "/upcoming",
  wrap(async (req, res) => {
    const from = getTodayString();

    const to = formatDate(addDays(dateFromString(from), 366));

    const items = await loadOccurrences(req.userId, from, to, {
      hideCompleted: true,
    });

    res.json(items.slice(0, 4));
  }),
);

router.get(
  "/recurring",
  wrap(async (req, res) => {
    const { rows } = await db.query(
      `
        SELECT
          id,
          title,
          item_type,
          start_date,
          start_time,
          end_time,
          notes,
          frequency,
          repeat_until,
          active,
          created_at
        FROM recurring_planner_items
        WHERE user_id = $1
        ORDER BY
          active DESC,
          start_date ASC,
          start_time ASC NULLS LAST,
          created_at ASC
        `,
      [req.userId],
    );

    res.json(
      rows.map((item) => ({
        ...item,

        start_date: toDateString(item.start_date),
        repeat_until: item.repeat_until
          ? toDateString(item.repeat_until)
          : null,
      })),
    );
  }),
);

router.post(
  "/recurring",
  wrap(async (req, res) => {
    const error = validateRecurring(req.body || {});

    if (error) {
      return res.status(400).json({ error });
    }

    const {
      title,
      item_type,
      start_date,
      start_time = null,
      end_time = null,
      notes = "",
      frequency,
      repeat_until = null,
    } = req.body;

    const { rows } = await db.query(
      `
        INSERT INTO recurring_planner_items
        (
          user_id,
          title,
          item_type,
          start_date,
          start_time,
          end_time,
          notes,
          frequency,
          repeat_until
        )
        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9
        )
        RETURNING
          id,
          title,
          item_type,
          start_date,
          start_time,
          end_time,
          notes,
          frequency,
          repeat_until,
          active,
          created_at
        `,
      [
        req.userId,
        String(title).trim(),
        item_type,
        start_date,
        start_time || null,
        end_time || null,
        notes || "",
        frequency,
        repeat_until || null,
      ],
    );

    res.status(201).json(rows[0]);
  }),
);

router.put(
  "/recurring/:id",
  wrap(async (req, res) => {
    const error = validateRecurring(req.body || {});

    if (error) {
      return res.status(400).json({ error });
    }

    const {
      title,
      item_type,
      start_date,
      start_time = null,
      end_time = null,
      notes = "",
      frequency,
      repeat_until = null,
    } = req.body;

    const { rows } = await db.query(
      `
        UPDATE recurring_planner_items
        SET
          title = $3,
          item_type = $4,
          start_date = $5,
          start_time = $6,
          end_time = $7,
          notes = $8,
          frequency = $9,
          repeat_until = $10
        WHERE id = $1
          AND user_id = $2
        RETURNING
          id,
          title,
          item_type,
          start_date,
          start_time,
          end_time,
          notes,
          frequency,
          repeat_until,
          active,
          created_at
        `,
      [
        req.params.id,
        req.userId,
        String(title).trim(),
        item_type,
        start_date,
        start_time || null,
        end_time || null,
        notes || "",
        frequency,
        repeat_until || null,
      ],
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: "Recurring planner item not found",
      });
    }

    res.json(rows[0]);
  }),
);

router.patch(
  "/recurring/:id/active",
  wrap(async (req, res) => {
    const { active } = req.body || {};

    if (typeof active !== "boolean") {
      return res.status(400).json({
        error: "active must be true or false",
      });
    }

    const { rows } = await db.query(
      `
        UPDATE recurring_planner_items
        SET active = $3
        WHERE id = $1
          AND user_id = $2
        RETURNING
          id,
          title,
          item_type,
          start_date,
          start_time,
          end_time,
          notes,
          frequency,
          repeat_until,
          active,
          created_at
        `,
      [req.params.id, req.userId, active],
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: "Recurring planner item not found",
      });
    }

    res.json(rows[0]);
  }),
);

// exclude one occurrence without deleting the whole series
router.post(
  "/recurring/:id/exceptions",
  wrap(async (req, res) => {
    const { occurrence_date } = req.body || {};

    if (!occurrence_date || !isValidDate(occurrence_date)) {
      return res.status(400).json({
        error: "occurrence_date must be a valid date",
      });
    }

    const recurringResult = await db.query(
      `
        SELECT id
        FROM recurring_planner_items
        WHERE id = $1
          AND user_id = $2
        `,
      [req.params.id, req.userId],
    );

    if (!recurringResult.rows[0]) {
      return res.status(404).json({
        error: "Recurring planner item not found",
      });
    }

    // skip duplicate exceptions for the same recurring date
    const { rows } = await db.query(
      `
        INSERT INTO recurring_planner_exceptions
        (
          user_id,
          recurring_id,
          occurrence_date
        )
        VALUES
        ($1, $2, $3)
        ON CONFLICT
        (
          recurring_id,
          occurrence_date
        )
        DO NOTHING
        RETURNING
          id,
          recurring_id,
          occurrence_date,
          created_at
        `,
      [req.userId, req.params.id, occurrence_date],
    );

    res.status(201).json(
      rows[0] || {
        recurring_id: Number(req.params.id),
        occurrence_date,
      },
    );
  }),
);

router.delete(
  "/recurring/:id",
  wrap(async (req, res) => {
    const result = await db.query(
      `
        DELETE FROM recurring_planner_items
        WHERE id = $1
          AND user_id = $2
        `,
      [req.params.id, req.userId],
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: "Recurring planner item not found",
      });
    }

    res.status(204).end();
  }),
);

router.get(
  "/",
  wrap(async (req, res) => {
    const { from, to, completed } = req.query;

    const values = [req.userId];
    const conditions = ["user_id = $1"];

    if (from) {
      values.push(from);

      conditions.push(`item_date >= $${values.length}`);
    }

    if (to) {
      values.push(to);

      conditions.push(`item_date <= $${values.length}`);
    }

    if (completed === "true" || completed === "false") {
      values.push(completed === "true");

      conditions.push(`completed = $${values.length}`);
    }

    const { rows } = await db.query(
      `
        SELECT
          id,
          title,
          item_type,
          item_date,
          start_time,
          end_time,
          notes,
          completed,
          created_at
        FROM planner_items
        WHERE ${conditions.join(" AND ")}
        ORDER BY
          item_date ASC,
          start_time ASC NULLS LAST,
          created_at ASC
        `,
      values,
    );

    res.json(
      rows.map((item) => ({
        ...item,
        item_date: toDateString(item.item_date),
      })),
    );
  }),
);

router.get(
  "/:id",
  wrap(async (req, res) => {
    const { rows } = await db.query(
      `
        SELECT
          id,
          title,
          item_type,
          item_date,
          start_time,
          end_time,
          notes,
          completed,
          created_at
        FROM planner_items
        WHERE id = $1
          AND user_id = $2
        `,
      [req.params.id, req.userId],
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: "Planner item not found",
      });
    }

    res.json({
      ...rows[0],
      item_date: toDateString(rows[0].item_date),
    });
  }),
);

router.post(
  "/",
  wrap(async (req, res) => {
    const error = validate(req.body || {});

    if (error) {
      return res.status(400).json({ error });
    }

    const {
      title,
      item_type,
      item_date,
      start_time = null,
      end_time = null,
      notes = "",
    } = req.body;

    const { rows } = await db.query(
      `
        INSERT INTO planner_items
        (
          user_id,
          title,
          item_type,
          item_date,
          start_time,
          end_time,
          notes
        )
        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )
        RETURNING
          id,
          title,
          item_type,
          item_date,
          start_time,
          end_time,
          notes,
          completed,
          created_at
        `,
      [
        req.userId,
        String(title).trim(),
        item_type,
        item_date,
        start_time || null,
        end_time || null,
        notes || "",
      ],
    );

    res.status(201).json({
      ...rows[0],
      item_date: toDateString(rows[0].item_date),
    });
  }),
);

router.put(
  "/:id",
  wrap(async (req, res) => {
    const error = validate(req.body || {});

    if (error) {
      return res.status(400).json({ error });
    }

    const {
      title,
      item_type,
      item_date,
      start_time = null,
      end_time = null,
      notes = "",
    } = req.body;

    const { rows } = await db.query(
      `
        UPDATE planner_items
        SET
          title = $3,
          item_type = $4,
          item_date = $5,
          start_time = $6,
          end_time = $7,
          notes = $8
        WHERE id = $1
          AND user_id = $2
        RETURNING
          id,
          title,
          item_type,
          item_date,
          start_time,
          end_time,
          notes,
          completed,
          created_at
        `,
      [
        req.params.id,
        req.userId,
        String(title).trim(),
        item_type,
        item_date,
        start_time || null,
        end_time || null,
        notes || "",
      ],
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: "Planner item not found",
      });
    }

    res.json({
      ...rows[0],
      item_date: toDateString(rows[0].item_date),
    });
  }),
);

router.patch(
  "/:id/completed",
  wrap(async (req, res) => {
    const { completed } = req.body || {};

    if (typeof completed !== "boolean") {
      return res.status(400).json({
        error: "completed must be true or false",
      });
    }

    const { rows } = await db.query(
      `
        UPDATE planner_items
        SET completed = $3
        WHERE id = $1
          AND user_id = $2
        RETURNING
          id,
          title,
          item_type,
          item_date,
          start_time,
          end_time,
          notes,
          completed,
          created_at
        `,
      [req.params.id, req.userId, completed],
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: "Planner item not found",
      });
    }

    res.json({
      ...rows[0],
      item_date: toDateString(rows[0].item_date),
    });
  }),
);

router.delete(
  "/:id",
  wrap(async (req, res) => {
    const result = await db.query(
      `
        DELETE FROM planner_items
        WHERE id = $1
          AND user_id = $2
        `,
      [req.params.id, req.userId],
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: "Planner item not found",
      });
    }

    res.status(204).end();
  }),
);

module.exports = router;