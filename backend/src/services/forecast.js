const db = require('../db');

const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const iso = (d) => d.toISOString().slice(0, 10);

async function financialSnapshot(userId) {
  const now = new Date();
  const today = iso(now);
  const first = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const last = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)));

  const [month, allTime, categories, recurring, scheduled] = await Promise.all([
    db.query(`SELECT COALESCE(SUM(amount) FILTER (WHERE kind='income'),0) AS income,
                     COALESCE(SUM(amount) FILTER (WHERE kind='expense'),0) AS expense
              FROM transactions WHERE user_id=$1 AND status='completed' AND occurred_on BETWEEN $2 AND $3`, [userId, first, today]),
    db.query(`SELECT COALESCE(SUM(amount) FILTER (WHERE kind='income'),0) AS income,
                     COALESCE(SUM(amount) FILTER (WHERE kind='expense'),0) AS expense
              FROM transactions WHERE user_id=$1 AND status='completed' AND occurred_on <= $2`, [userId, today]),
    db.query(`SELECT c.name, c.budget_limit,
                     COALESCE(SUM(t.amount),0) AS spent
              FROM categories c LEFT JOIN transactions t
              ON t.category_id=c.id AND t.user_id=c.user_id
                 AND t.kind='expense' AND t.status='completed' AND t.occurred_on BETWEEN $2 AND $3
              WHERE c.user_id=$1 AND c.kind='expense'
              GROUP BY c.id ORDER BY c.name`, [userId, first, today]),
    db.query(`SELECT kind, amount, frequency, next_date, description FROM recurring_transactions
              WHERE user_id=$1 AND active=TRUE`, [userId]),
    db.query(`SELECT kind, amount, occurred_on, description FROM transactions
              WHERE user_id=$1 AND status='scheduled' AND occurred_on BETWEEN $2 AND $3`,
              [userId, today, last]),
  ]);

  const todayUTC = new Date(today + 'T12:00:00Z');
  const endUTC = new Date(last + 'T12:00:00Z');
  const upcoming = [];
  const advance = (d, frequency) => {
    if (frequency === 'weekly') { d.setUTCDate(d.getUTCDate() + 7); return; }
    if (frequency === 'monthly') {
      const day = d.getUTCDate();
      d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
      const endDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      d.setUTCDate(Math.min(day, endDay));
    }
  };
  for (const item of recurring.rows) {
    const day = typeof item.next_date === 'string' ? item.next_date.slice(0, 10) : iso(item.next_date);
    const d = new Date(day + 'T12:00:00Z');
    if (!Number.isFinite(d.getTime())) continue;
    let steps = 0;
    while (d < todayUTC && item.frequency !== 'termly' && steps++ < 1000) advance(d, item.frequency);
    while (d >= todayUTC && d <= endUTC && steps++ < 1000) {
      upcoming.push({ date: iso(d), kind: item.kind, amount: money(item.amount), description: item.description || 'Recurring payment', frequency: item.frequency });
      if (item.frequency === 'termly') break; // Term dates cannot safely be inferred.
      advance(d, item.frequency);
    }
  }
  for (const item of scheduled.rows) {
    upcoming.push({
      date: typeof item.occurred_on === 'string' ? item.occurred_on.slice(0,10) : iso(item.occurred_on),
      kind: item.kind, amount: money(item.amount),
      description: item.description || 'One-off payment', frequency: 'one-off',
    });
  }
  const upcomingIncome = money(upcoming.filter(x => x.kind === 'income').reduce((a,x)=>a+x.amount,0));
  const upcomingExpenses = money(upcoming.filter(x => x.kind === 'expense').reduce((a,x)=>a+x.amount,0));
  const recordedNet = money(Number(allTime.rows[0].income) - Number(allTime.rows[0].expense));
  return {
    asOf: today, monthStart: first, monthEnd: last,
    currency: 'GBP',
    monthRecordedIncome: money(month.rows[0].income),
    monthRecordedExpenses: money(month.rows[0].expense),
    recordedLedgerNetSinceAccountStart: recordedNet,
    upcomingScheduledPayments: upcoming.sort((a,b) => a.date.localeCompare(b.date)),
    expectedRemainingRecurringIncome: upcomingIncome,
    expectedRemainingRecurringExpenses: upcomingExpenses,
    projectedLedgerNetAtMonthEnd: money(recordedNet + upcomingIncome - upcomingExpenses),
    categories: categories.rows.map(c => ({
      name: c.name, spentThisMonth: money(c.spent),
      budgetLimit: c.budget_limit == null ? null : money(c.budget_limit),
    })),
    assumptions: [
      'Ledger net is not an actual bank balance and excludes unrecorded transactions and opening balances.',
      'Projected ledger net includes known scheduled one-off and recurring payments; no unrecorded spending is assumed.',
      'Termly payments are counted only if their explicitly entered next date falls in the remaining month.',
      'A recurring payment already manually recorded today may be double-counted if its next_date was not advanced.',
    ],
  };
}
module.exports = { financialSnapshot };