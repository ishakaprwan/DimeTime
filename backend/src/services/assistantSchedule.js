'use strict';
const db = require('../db');
const iso = d => d.toISOString().slice(0, 10);
const dateString = value => value instanceof Date ? iso(value) : String(value || '').slice(0, 10);
const atNoon = value => new Date(`${value}T12:00:00Z`);
const addDays = (value, count) => { const d = atNoon(value); d.setUTCDate(d.getUTCDate() + count); return iso(d); };
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(atNoon(value).getTime()) && iso(atNoon(value)) === value;
const cents = value => Math.round(Number(value) * 100);

function expandSchedule(rows, recurringRows, start, end) {
  const items = [];
  const caveats = [];
  for (const row of rows) {
    const date = dateString(row.occurred_on);
    if (!validDate(date) || date < start || date > end || !['income','expense'].includes(row.kind)) continue;
    items.push({ date, kind: row.kind, amount: cents(row.amount) / 100, description: String(row.description || 'Scheduled payment').slice(0, 100), source: 'scheduled' });
  }
  for (const row of recurringRows) {
    let date = dateString(row.next_date);
    if (!validDate(date) || !['income','expense'].includes(row.kind)) continue;
    const freq = row.frequency;
    if (!['weekly','monthly','termly'].includes(freq)) { caveats.push('One unsupported recurring frequency was not projected.'); continue; }
    // safety limit to avoid infinite loops if a recurring payment is misconfigured
    let count = 0;
    while (date <= end && count++ < 500) {
      if (date >= start) items.push({ date, kind: row.kind, amount: cents(row.amount) / 100, description: String(row.description || 'Recurring payment').slice(0, 100), source: 'recurring' });
      if (freq === 'termly') break;
      if (freq === 'weekly') date = addDays(date, 7);
      else {
        const d = atNoon(date); const day = d.getUTCDate();
        d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
        const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
        d.setUTCDate(Math.min(day, last)); date = iso(d);
      }
    }
    if (count >= 500) caveats.push('One recurring payment exceeded the projection safety limit.');
  }
  items.sort((a,b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  return { items, caveats };
}

async function assistantSchedule(userId, now = new Date(), horizonDays = 84) {
  const start = iso(now), end = addDays(start, horizonDays);
  const [oneOff, recurring] = await Promise.all([
    db.query(`SELECT kind, amount, occurred_on, description FROM transactions
              WHERE user_id=$1 AND status='scheduled' AND occurred_on BETWEEN $2 AND $3`, [userId, start, end]),
    db.query(`SELECT kind, amount, frequency, next_date, description FROM recurring_transactions
              WHERE user_id=$1 AND active=TRUE`, [userId]),
  ]);
  const result = expandSchedule(oneOff.rows, recurring.rows, start, end);
  return { from: start, through: end, ...result, assumptions: [
    'Includes only saved scheduled and active recurring payments, not unrecorded payments.',
    'Termly recurring payments are included only at their explicitly saved next_date.',
    'Scheduled and recurring entries representing the same real payment may be counted twice; the app cannot identify duplicates reliably.',
  ] };
}
module.exports = { assistantSchedule, expandSchedule };
