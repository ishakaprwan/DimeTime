const destinations = Object.freeze({
  transactions: {
    label: "Transactions",
    button: "Open Transactions",
  },
  budget: {
    label: "Budget",
    button: "Open Budget",
  },
  "money-owed": {
    label: "Money owed",
    button: "Open Money owed",
  },
  planner: {
    label: "Planner",
    button: "Open Planner",
  },
  academics: {
    label: "Academics",
    button: "Open Academics",
  },
  settings: {
    label: "Student settings",
    button: "Open Student settings",
  },
  dashboard: {
    label: "Dashboard",
    button: "Open Dashboard",
  },
});

function guideForQuestion(question) {
  const q = String(question || "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .trim();

  if (!q) return null;

  // handle questions that explicitly ask for a comparison b/w planner AND academics.
  if (
    /\b(difference|different|compare|versus|vs\.?|which one)\b/.test(q) &&
    /\bplanner\b/.test(q) &&
    /\bacademic/.test(q)
  ) {
    return {
      answer:
        "Academics is for modules, assessments, deadlines and term dates. Planner is for events, lectures, work shifts and recurring commitments. Choose Academics for an assessed deadline; choose Planner for a scheduled event.",
      destination: "academics",
    };
  }

  // handles genuine product comparisons.
  const navigationIntent =
    /\b(how do i|how can i|where do i|where can i|show me how|take me to|navigate to|go to|open|which page|where is the (?:page|button)|help me (?:add|edit|delete|create|record|find))\b/.test(
      q,
    );

  const explicitProductHelp =
    /\b(how does dimetime|explain (?:the )?(?:planner|academics page|budget page|transactions page|money owed page)|(?:guide|tutorial) (?:to|for|on|about))\b/.test(
      q,
    );

  if (!navigationIntent && !explicitProductHelp) {
    return null;
  }

  let destination;
  let answer;

  if (
    /\b(owe|owed|borrowed|lent|lend|loaned|repay|repayment|iou|friend owes|owe my friend)\b/.test(
      q,
    )
  ) {
    destination = "money-owed";
    answer =
      "Use Money owed to record who owes whom, the reason and amount. You can track partial repayments and mark a record as settled. This tracker does not automatically add a transaction.";
  } else if (
    /\b(assessment|assignment|coursework|exam|module|dissertation deadline|submission deadline|academic year|term dates|michaelmas|lent term|summer term)\b/.test(
      q,
    )
  ) {
    destination =
      /\b(academic year|term dates|michaelmas|lent term|summer term)\b/.test(q)
        ? "settings"
        : "academics";

    answer =
      destination === "settings"
        ? "Open Student settings to configure your academic year and term dates. Your modules and assessments are managed in Academics."
        : "Open Academics to add or edit modules and assessment deadlines, including their dates and due times. Use Planner for ordinary events and recurring lectures.";
  } else if (
    /\b(planner|calendar|lecture|timetable|class|shift|meeting|event|appointment|schedule|reminder|recurring event)\b/.test(
      q,
    ) &&
    !/\b(payment|income|expense|bill|rent payment)\b/.test(q)
  ) {
    destination = "planner";
    answer =
      "Open Planner to create an event, choose its date and time, and use the recurrence controls for repeating lectures or commitments. Assessment deadlines are managed in Academics.";
  } else if (
    /\b(budget|spending limit|monthly limit|category limit)\b/.test(q)
  ) {
    destination = "budget";
    answer =
      "Open Budget to set or update spending limits and review your spending by category and month.";
  } else if (
    /\b(transaction|expense|purchase|spent on|income|salary|wages|payment|paid|bill|rent|subscription|grocer|tesco|sainsbury|receipt)\b/.test(
      q,
    )
  ) {
    destination = "transactions";
    answer =
      "Open Transactions to record an income or expense. Enter the description, amount, date and category, then save it yourself. For repeating payments, choose the recurring option. I cannot create entries on your behalf.";
  } else if (
    /\b(password|currency|university|school name|profile|account|settings|theme|dark mode)\b/.test(
      q,
    )
  ) {
    destination = "settings";
    answer =
      "Open Student settings to review your profile, school, currency and other available preferences.";
  } else if (
    /\b(dashboard|forecast|insight|overview|workload|money tab|academics tab)\b/.test(
      q,
    )
  ) {
    destination = "dashboard";
    answer =
      "Open Dashboard to view your Overview, Money and Academics sections. Money includes Financial Forecast; Overview includes Smart Insights; Academics summarises deadlines and workload.";
  }

  return destination ? { answer, destination } : null;
}

const productGuide = `
DimeTime interface reference (application documentation, not user account data):

Dashboard has Overview, Money and Academics views.
Money forecasts are based on recorded transactions, not a verified bank balance.
Transactions records one-off and recurring income and expenses.
Budget handles monthly/category spending limits.
Money owed tracks personal IOUs and partial repayments; it does not automatically update Transactions.
Academics handles modules, assessment deadlines and due times.
Student settings configures academic year and term dates, university/school and currency.
Planner handles events, lectures, schedules and recurring commitments.
A four-step Setup guide can be reopened from the sidebar.

For navigation questions, explain the correct page.
Never claim to have saved or modified records or invent controls.
For questions about the user's actual records, answer from account-scoped snapshot data, not generic page instructions.
`;

module.exports = {
  destinations,
  guideForQuestion,
  productGuide,
};