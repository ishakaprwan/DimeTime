// dashboard insights only read existing academic + financial data
const dateOnly = (value) =>
  typeof value === "string" ? value.slice(0, 10) : "";

const dateFromISO = (iso) => new Date(`${iso}T12:00:00`);

const isoFromDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// use mon to sun weeks, starting with the current week
export function combinedInsightWeeks(todayISO, count = 4) {
  const today = dateFromISO(todayISO);

  if (Number.isNaN(today.getTime())) return [];

  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  return Array.from({ length: count }, (_, index) => {
    const start = new Date(monday);
    start.setDate(monday.getDate() + index * 7);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    return {
      start: isoFromDate(start),
      end: isoFromDate(end),
    };
  });
}

// only flag weeks with at least 2 unfinished assessments + a scheduled expense
// these are upcoming payments, not necessarily a warning about low funds(?)
export function buildCombinedInsights({
  todayISO,
  assessments = [],
  upcoming = [],
  formatMoney = (value) => String(value),
}) {
  const weeks = combinedInsightWeeks(todayISO);

  const validAssessments = (Array.isArray(assessments) ? assessments : [])
    .filter(
      (item) =>
        item &&
        typeof item === "object" &&
        !item.completed &&
        String(item.status || "").toLowerCase() !== "completed",
    )
    .map((item) => ({
      ...item,
      date: dateOnly(
        item.due || item.due_date || item.dueDate || item.deadline || item.date,
      ),
    }))
    .filter(
      (item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && item.date >= todayISO,
    );

  const payments = (Array.isArray(upcoming) ? upcoming : []).filter(
    (item) =>
      item?.kind === "expense" &&
      /^\d{4}-\d{2}-\d{2}$/.test(dateOnly(item.date)) &&
      dateOnly(item.date) >= todayISO &&
      Number.isFinite(Number(item.amount)) &&
      Number(item.amount) > 0,
  );

  return weeks.flatMap((week) => {
    const due = validAssessments.filter(
      (item) => item.date >= week.start && item.date <= week.end,
    );

    const expenses = payments.filter(
      (item) =>
        dateOnly(item.date) >= week.start && dateOnly(item.date) <= week.end,
    );

    if (due.length < 2 || !expenses.length) return [];

    const amount = expenses.reduce((sum, item) => sum + Number(item.amount), 0);

    const weekLabel = `${dateFromISO(week.start).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    })} to ${dateFromISO(week.end).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`;

    return [
      {
        key: `combined-week-${week.start}`,
        title: "Academic deadlines and payments overlap",
        detail: `${due.length} assessment deadlines and ${formatMoney(amount)} in scheduled expenses fall during ${weekLabel}. Review your plans and upcoming payments.`,
        target: "planner",
        priority: 3,
      },
    ];
  });
}