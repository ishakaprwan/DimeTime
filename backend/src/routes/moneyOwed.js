const express = require("express");
const db = require("../db");
const { wrap } = require("../middleware/errors");

const router = express.Router();

const idOK = (value) => /^[1-9]\d*$/.test(String(value));

const dateOK = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

const amountOK = (value) =>
  value !== "" &&
  value !== null &&
  value !== undefined &&
  /^\d+(?:\.\d{1,2})?$/.test(String(value)) &&
  Number(value) > 0 &&
  Number(value) <= 9999999999.99;

const number = (value) => Number(value);

// shared query for calculating repayments + the amount still owed
const columns = `r.id, r.direction, r.person, r.reason, r.original_amount::text AS original_amount,
 r.recorded_on::text AS recorded_on, r.created_at,
 COALESCE(SUM(p.amount), 0)::text AS repaid_amount,
 (r.original_amount - COALESCE(SUM(p.amount), 0))::text AS remaining_amount`;

const from = `FROM money_owed_records r LEFT JOIN money_owed_repayments p ON p.record_id = r.id`;

const group = `GROUP BY r.id`;

router.get(
  "/",
  wrap(async (req, res) => {
    const { rows } = await db.query(
      `SELECT ${columns} ${from} WHERE r.user_id=$1 ${group} ORDER BY r.recorded_on DESC, r.id DESC`,
      [req.userId],
    );

    res.json(rows);
  }),
);

router.post(
  "/",
  wrap(async (req, res) => {
    const {
      direction,
      person,
      reason = "",
      amount,
      recorded_on,
    } = req.body || {};

    if (
      !["owed_to_me", "i_owe"].includes(direction) ||
      typeof person !== "string" ||
      !person.trim() ||
      person.trim().length > 120 ||
      typeof reason !== "string" ||
      reason.length > 300 ||
      !amountOK(amount) ||
      (recorded_on !== undefined && !dateOK(recorded_on))
    ) {
      return res.status(400).json({
        error: "Enter a valid type, person, amount, reason and date.",
      });
    }

    const { rows } = await db.query(
      `INSERT INTO money_owed_records (user_id,direction,person,reason,original_amount,recorded_on)
    VALUES ($1,$2,$3,$4,$5,COALESCE($6::date,CURRENT_DATE)) RETURNING id`,
      [
        req.userId,
        direction,
        person.trim(),
        reason.trim(),
        number(amount).toFixed(2),
        recorded_on || null,
      ],
    );

    res.status(201).json({ id: rows[0].id });
  }),
);

router.patch(
  "/:id",
  wrap(async (req, res) => {
    if (!idOK(req.params.id))
      return res.status(404).json({ error: "Record not found" });

    const { direction, person, reason, amount, recorded_on } = req.body || {};

    if (
      !["owed_to_me", "i_owe"].includes(direction) ||
      typeof person !== "string" ||
      !person.trim() ||
      person.trim().length > 120 ||
      typeof reason !== "string" ||
      reason.length > 300 ||
      !amountOK(amount) ||
      !dateOK(recorded_on)
    ) {
      return res.status(400).json({
        error: "Enter a valid type, person, amount, reason and date.",
      });
    }

    const { rows } = await db.query(
      `UPDATE money_owed_records r SET direction=$3,person=$4,reason=$5,original_amount=$6,recorded_on=$7::date,updated_at=NOW()
    WHERE r.id=$1 AND r.user_id=$2 AND $6::numeric >= (SELECT COALESCE(SUM(amount),0) FROM money_owed_repayments WHERE record_id=r.id)
    RETURNING r.id`,
      [
        req.params.id,
        req.userId,
        direction,
        person.trim(),
        reason.trim(),
        number(amount).toFixed(2),
        recorded_on,
      ],
    );

    if (!rows.length)
      return res.status(409).json({
        error:
          "Record not found, or the new total is below repayments already recorded.",
      });

    res.json({ id: rows[0].id });
  }),
);

router.post(
  "/:id/repayments",
  wrap(async (req, res) => {
    if (!idOK(req.params.id))
      return res.status(404).json({ error: "Record not found" });

    const { amount, paid_on } = req.body || {};

    if (!amountOK(amount) || (paid_on !== undefined && !dateOK(paid_on)))
      return res
        .status(400)
        .json({ error: "Enter a valid repayment amount and date." });

    // lock the record while checking the remaining balance
    const client = await db.pool.connect();

    try {
      await client.query("BEGIN");

      const owner = await client.query(
        "SELECT original_amount FROM money_owed_records WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [req.params.id, req.userId],
      );

      if (!owner.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Record not found" });
      }

      const paid = await client.query(
        "SELECT COALESCE(SUM(amount),0) AS total FROM money_owed_repayments WHERE record_id=$1",
        [req.params.id],
      );

      // compare amounts in pence to avoid floating point rounding issues
      const remainingPence =
        Math.round(Number(owner.rows[0].original_amount) * 100) -
        Math.round(Number(paid.rows[0].total) * 100);

      if (Math.round(number(amount) * 100) > remainingPence) {
        await client.query("ROLLBACK");

        return res
          .status(409)
          .json({ error: "Repayment exceeds the outstanding amount." });
      }

      const created = await client.query(
        `INSERT INTO money_owed_repayments(record_id,amount,paid_on) VALUES ($1,$2,COALESCE($3::date,CURRENT_DATE)) RETURNING id`,
        [req.params.id, number(amount).toFixed(2), paid_on || null],
      );

      await client.query("COMMIT");

      res.status(201).json({ id: created.rows[0].id });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.get(
  "/:id/repayments",
  wrap(async (req, res) => {
    if (!idOK(req.params.id))
      return res.status(404).json({ error: "Record not found" });

    const owner = await db.query(
      "SELECT id FROM money_owed_records WHERE id=$1 AND user_id=$2",
      [req.params.id, req.userId],
    );

    if (!owner.rows.length)
      return res.status(404).json({ error: "Record not found" });

    const { rows } = await db.query(
      "SELECT id, amount::text AS amount, paid_on::text AS paid_on FROM money_owed_repayments WHERE record_id=$1 ORDER BY paid_on DESC,id DESC",
      [req.params.id],
    );

    res.json(rows);
  }),
);

router.delete(
  "/:id",
  wrap(async (req, res) => {
    if (!idOK(req.params.id))
      return res.status(404).json({ error: "Record not found" });

    const result = await db.query(
      "DELETE FROM money_owed_records WHERE id=$1 AND user_id=$2",
      [req.params.id, req.userId],
    );

    if (!result.rowCount)
      return res.status(404).json({ error: "Record not found" });

    res.status(204).end();
  }),
);

module.exports = router;