'use strict';

const iso = date => date.toISOString().slice(0, 10);
const parse = date => new Date(`${date}T12:00:00Z`);
function mondayOf(isoDate) {
  const d = parse(isoDate);
  const delta = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - delta);
  return iso(d);
}
function plusDays(isoDate, days) {
  const d = parse(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}
const sumPennies = entries => Math.round(entries.reduce((sum, e) => sum + Math.round(Number(e.amount || 0) * 100), 0)) / 100;

function assistantFacts(finance, academics, schedule) {
  const asOf = academics.asOf;
  const windowEnd = academics.windowEnd;
  const deadlines = academics.upcomingAssessments || [];
  const allDeadlineDates = academics.calendarDeadlineDates || deadlines.map(a => a.due);
  const scheduled = (schedule.items || []).filter(x => x.date >= asOf && x.date <= windowEnd);
  const lastFinanceDate = schedule.through;
  const calendarWeeks = [];
  let start = mondayOf(asOf);
  while (start <= windowEnd) {
    const end = plusDays(start, 6);
    const inScopeStart = start < asOf ? asOf : start;
    const inScopeEnd = end > windowEnd ? windowEnd : end;
    const due = deadlines.filter(a => a.due >= inScopeStart && a.due <= inScopeEnd);
    const authoritativeCount = allDeadlineDates.filter(d => d >= inScopeStart && d <= inScopeEnd).length;
    const expenses = scheduled.filter(p => p.kind === 'expense' && p.date >= inScopeStart && p.date <= inScopeEnd);
    const income = scheduled.filter(p => p.kind === 'income' && p.date >= inScopeStart && p.date <= inScopeEnd);
    calendarWeeks.push({
      monday: start, sunday: end, windowStart: inScopeStart, windowEnd: inScopeEnd,
      isPartial: inScopeStart !== start || inScopeEnd !== end,
      deadlines: authoritativeCount, deadlineTitles: due.map(a => a.title).slice(0, 15),
      knownScheduledExpenses: expenses.length, expenseTotalGBP: sumPennies(expenses),
      knownScheduledIncome: income.length, incomeTotalGBP: sumPennies(income),
      financialDataCompleteForWeek: end <= lastFinanceDate,
    });
    start = plusDays(start, 7);
  }
  const overlaps = calendarWeeks.filter(w => w.deadlines > 0 && w.knownScheduledExpenses > 0)
    .map(w => ({ monday: w.monday, sunday: w.sunday, deadlines: w.deadlines,
      scheduledExpenseTotalGBP: w.expenseTotalGBP, financialDataCompleteForWeek: w.financialDataCompleteForWeek }));
  return {
    asOf, academicWindowEnd: windowEnd,
    financeScheduledWindowEnd: lastFinanceDate,
    futureSchedule: { from: schedule.from, through: schedule.through, items: schedule.items, assumptions: schedule.assumptions, caveats: schedule.caveats },
    academicListTruncated: Boolean(academics.assessmentsListTruncated),
    monthRecordedExpensesGBP: finance.monthRecordedExpenses,
    monthRecordedIncomeGBP: finance.monthRecordedIncome,
    spendingPeriod: { from: finance.monthStart, through: asOf, completedTransactionsOnly: true },
    calendarWeeks, academicExpenseOverlaps: overlaps,
    coverageCaveats: [
      'Week boundaries are Monday to Sunday. The first and last week may be partial because the academic snapshot covers only the next 56 days.',
      'Scheduled income and expenses are available through financeScheduledWindowEnd. Beyond that date, a missing payment or overlap cannot be interpreted as zero.',
      'These are recorded/scheduled figures, not a verified bank balance. Do not infer affordability.',
    ],
  };
}
module.exports = { assistantFacts, mondayOf, plusDays };
