import { useCurrency } from "./currency";
import { displayDate } from "./dateFormat";
import { initialiseStudent, resetStudent, updateStudent } from "./studentStore";
import SetupGuide from "./SetupGuide";
import { CURRENCIES } from "./currency";
import "./SetupGuide.css";
import Academics, {
  StudentSettings,
  readStudentData,
  getCurrentTerm,
} from "./pages/Academics";
import { useEffect, useRef, useState } from "react";
import logoImage from "./assets/logo.png";
import "./App.css";
import Assistant from "./Assistant";
import { ChangePassword, PasswordRecovery } from "./PasswordTools";
import Transactions from "./pages/Transactions";
import Planner from "./pages/Planner";
import Budget from "./pages/Budget";
import MoneyOwed from "./pages/MoneyOwed";
import {
  buildCombinedInsights,
  combinedInsightWeeks,
} from "./combinedInsights";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

function normaliseDate(value) {
  return typeof value === "string" ? value.split("T")[0] : "";
}

function formatPlannerTime(value) {
  if (!value) return "";

  const [hours, minutes] = value.split(":").map(Number);

  const date = new Date();

  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function App() {
  const currency = useCurrency();

  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem("user");
    try {
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const [page, setPage] = useState("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuButtonRef = useRef(null);
  const mobileMenuCloseRef = useRef(null);
  const mobileSidebarRef = useRef(null);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    mobileMenuCloseRef.current?.focus();
    const onEscape = (event) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        mobileMenuButtonRef.current?.focus();
      }
      if (event.key === "Tab" && mobileSidebarRef.current) {
        const candidates = [
          ...mobileSidebarRef.current.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ].filter((element) => element.getClientRects().length > 0);
        if (!candidates.length) return;
        const first = candidates[0];
        const last = candidates[candidates.length - 1];
        if (!mobileSidebarRef.current.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const onResize = () => {
      if (window.innerWidth > 850) setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onEscape);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onEscape);
      window.removeEventListener("resize", onResize);
    };
  }, [mobileMenuOpen]);
  useEffect(() => {
    Promise.resolve().then(() => setMobileMenuOpen(false));
  }, [page]);
  const [dashboardTab, setDashboardTab] = useState("overview");
  const [hoveredForecastPoint, setHoveredForecastPoint] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);
  const [setupGuideHandled, setSetupGuideHandled] = useState(null);
  const [workloadView, setWorkloadView] = useState(() => {
    const saved = localStorage.getItem("dimetime-workload-view");
    return ["daily", "weekly", "monthly"].includes(saved) ? saved : "weekly";
  });
  const [workloadOffset, setWorkloadOffset] = useState(0);
  useEffect(() => {
    localStorage.setItem("dimetime-workload-view", workloadView);
  }, [workloadView]);

  useEffect(() => {
    if (!user) {
      Promise.resolve().then(() => setStudentData(null));
      return;
    }
    const refresh = () => setStudentData(readStudentData(user.id));
    initialiseStudent(user.id).catch(() => {});
    Promise.resolve().then(refresh);
    window.addEventListener("dimetime-student-updated", refresh);
    return () =>
      window.removeEventListener("dimetime-student-updated", refresh);
  }, [user]);

  useEffect(() => {
    if (
      user &&
      studentData?.onboardingCompleted === false &&
      setupGuideHandled !== user.id
    ) {
      Promise.resolve().then(() => {
        setSetupGuideOpen(true);
        setSetupGuideHandled(user.id);
      });
    }
  }, [user, studentData?.onboardingCompleted, setupGuideHandled]);

  // apply saved, account-scoped appearance preference; system mode follows the OS
  useEffect(() => {
    const preference = studentData?.appearanceTheme || "system";
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.dtTheme =
        preference === "system"
          ? query.matches
            ? "dark"
            : "light"
          : preference;
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [studentData?.appearanceTheme]);

  const [mode, setMode] = useState(() =>
    new URLSearchParams(window.location.search).has("reset_token")
      ? "reset"
      : "login",
  );
  const [resetToken] = useState(() =>
    new URLSearchParams(window.location.search).get("reset_token"),
  );
  useEffect(() => {
    if (resetToken)
      window.history.replaceState(
        {},
        "",
        window.location.pathname + window.location.hash,
      );
  }, [resetToken]);

  const [name, setName] = useState("");
  const [signupUniversity, setSignupUniversity] = useState("");
  const [signupCurrency, setSignupCurrency] = useState("GBP");

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [message, setMessage] = useState("");
  const [authFieldErrors, setAuthFieldErrors] = useState({});

  const [loading, setLoading] = useState(false);

  const [summary, setSummary] = useState({
    income: 0,
    expense: 0,
    balance: 0,
    categories: [],
  });

  const [ledgerBalance, setLedgerBalance] = useState(0);
  const [ledgerDaily, setLedgerDaily] = useState([]);
  const [ledgerHistoryAvailable, setLedgerHistoryAvailable] = useState(false);
  const [ledgerHistoryError, setLedgerHistoryError] = useState("");

  const [forecast, setForecast] = useState({
    expectedIncome: 0,
    expectedExpenses: 0,
    netChange: 0,
    upcoming: [],
  });

  const [combinedInsightPayments, setCombinedInsightPayments] = useState([]);
  const [combinedInsightsAvailable, setCombinedInsightsAvailable] =
    useState(false);
  const [, setPlannerUpcoming] = useState([]);
  const [todayPlannerEvents, setTodayPlannerEvents] = useState([]);
  const [schedulePopoverOpen, setSchedulePopoverOpen] = useState(false);
  const [dismissedInsights, setDismissedInsights] = useState([]);
  const [showDismissedInsights, setShowDismissedInsights] = useState(false);
  const schedulePopoverRef = useRef(null);

  useEffect(() => {
    Promise.resolve().then(() => setShowDismissedInsights(false));
    if (!user?.id) {
      Promise.resolve().then(() => setDismissedInsights([]));
      return;
    }
    try {
      const saved = JSON.parse(
        localStorage.getItem(`dimetime-dismissed-insights-${user.id}`) || "[]",
      );
      Promise.resolve().then(() =>
        setDismissedInsights(
          Array.isArray(saved)
            ? saved.filter((key) => typeof key === "string")
            : [],
        ),
      );
    } catch {
      Promise.resolve().then(() => setDismissedInsights([]));
    }
  }, [user?.id]);
  const dismissInsight = (key) =>
    setDismissedInsights((old) => {
      const next = old.includes(key) ? old : [...old, key];
      if (user?.id)
        localStorage.setItem(
          `dimetime-dismissed-insights-${user.id}`,
          JSON.stringify(next),
        );
      return next;
    });
  const restoreInsight = (key) =>
    setDismissedInsights((old) => {
      const next = old.filter((item) => item !== key);
      if (user?.id)
        localStorage.setItem(
          `dimetime-dismissed-insights-${user.id}`,
          JSON.stringify(next),
        );
      return next;
    });

  const [plannerUpcomingLoading, setPlannerUpcomingLoading] = useState(false);

  const [summaryLoading, setSummaryLoading] = useState(false);

  const [summaryError, setSummaryError] = useState("");

  const [forecastAvailable, setForecastAvailable] = useState(true);
  const [financeView, setFinanceView] = useState(
    () => localStorage.getItem("dimetime-finance-view") || "weeks",
  );
  const [financeOffset, setFinanceOffset] = useState(0);
  const [showForecastBreakdown, setShowForecastBreakdown] = useState(false);
  useEffect(() => {
    localStorage.setItem("dimetime-finance-view", financeView);
  }, [financeView]);

  // dashboard values derived from the student's stored data
  const todayDate = new Date();
  const todayISO = [
    todayDate.getFullYear(),
    String(todayDate.getMonth() + 1).padStart(2, "0"),
    String(todayDate.getDate()).padStart(2, "0"),
  ].join("-");
  const sevenDaysLater = new Date(todayDate);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  const inSevenDays = [
    sevenDaysLater.getFullYear(),
    String(sevenDaysLater.getMonth() + 1).padStart(2, "0"),
    String(sevenDaysLater.getDate()).padStart(2, "0"),
  ].join("-");

  const assessmentSources = [
    ...(Array.isArray(studentData?.assignments) ? studentData.assignments : []),
    ...(Array.isArray(studentData?.assessments) ? studentData.assessments : []),
    ...(Array.isArray(studentData?.academicYears)
      ? studentData.academicYears.flatMap((year) =>
          Array.isArray(year?.assessments) ? year.assessments : [],
        )
      : []),
  ];
  const upcomingAssessments = assessmentSources
    .filter((a) => a && typeof a === "object")
    .map((a) => ({
      ...a,
      due: normaliseDate(
        a.due || a.due_date || a.dueDate || a.deadline || a.date,
      ),
      title: a.title || a.name || "Untitled assessment",
      module: a.module || a.moduleName || "",
      dueTime: a.dueTime || a.due_time || "",
    }))
    .filter((a) => {
      if (
        !a.due ||
        a.completed ||
        String(a.status || "").toLowerCase() === "completed"
      )
        return false;
      if (a.due < todayISO) return false;
      if (a.due === todayISO && /^([01]\d|2[0-3]):[0-5]\d$/.test(a.dueTime)) {
        return new Date(`${a.due}T${a.dueTime}:00`) >= new Date();
      }
      return true;
    })
    .sort((a, b) =>
      `${a.due}T${a.dueTime || "23:59"}`.localeCompare(
        `${b.due}T${b.dueTime || "23:59"}`,
      ),
    );

  useEffect(() => {
    if (!schedulePopoverOpen) return;
    const closeOnOutside = (event) => {
      if (!schedulePopoverRef.current?.contains(event.target))
        setSchedulePopoverOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSchedulePopoverOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [schedulePopoverOpen]);

  const minutesFromTime = (value) => {
    if (!value) return null;
    const match = String(value).match(/^(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const currentMinutes = todayDate.getHours() * 60 + todayDate.getMinutes();
  const remainingToday = todayPlannerEvents
    .filter((item) => normaliseDate(item.item_date) === todayISO)
    .filter((item) => {
      const finish = minutesFromTime(item.end_time);
      const start = minutesFromTime(item.start_time);
      return finish !== null
        ? finish > currentMinutes
        : start === null || start >= currentMinutes;
    })
    .sort((a, b) =>
      (a.start_time || "99:99").localeCompare(b.start_time || "99:99"),
    );
  const nearestAssessment = upcomingAssessments[0] || null;
  const upcomingPayments = (forecast.upcoming || [])
    .filter(
      (item) =>
        item.kind === "expense" &&
        item.date >= todayISO &&
        item.date <= inSevenDays,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcomingPaymentTotal = upcomingPayments.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );
  const nearestPayment = upcomingPayments[0] || null;
  const todayConflicts = [];
  for (let i = 0; i < remainingToday.length; i += 1) {
    for (let j = i + 1; j < remainingToday.length; j += 1) {
      const a = remainingToday[i],
        b = remainingToday[j];
      const as = minutesFromTime(a.start_time),
        ae = minutesFromTime(a.end_time);
      const bs = minutesFromTime(b.start_time),
        be = minutesFromTime(b.end_time);
      if (
        as !== null &&
        ae !== null &&
        bs !== null &&
        be !== null &&
        as < be &&
        bs < ae
      ) {
        todayConflicts.push({
          key: `conflict-${a.id}-${b.id}`,
          title: "Scheduling conflict",
          detail: `${a.title} and ${b.title} overlap today, ${String(Math.floor(Math.max(as, bs) / 60)).padStart(2, "0")}:${String(Math.max(as, bs) % 60).padStart(2, "0")} to ${String(Math.floor(Math.min(ae, be) / 60)).padStart(2, "0")}:${String(Math.min(ae, be) % 60).padStart(2, "0")}.`,
          target: "planner",
        });
      }
    }
  }
  // smart insights surface actionable exceptions; not routine reminder duplicates
  const allAssessmentsForInsights = assessmentSources
    .filter((a) => a && typeof a === "object")
    .map((a) => ({
      ...a,
      due: normaliseDate(
        a.due || a.due_date || a.dueDate || a.deadline || a.date,
      ),
      title: a.title || a.name || "Assessment",
      dueTime: a.dueTime || a.due_time || "",
    }))
    .filter(
      (a) =>
        a.due &&
        !a.completed &&
        String(a.status || "").toLowerCase() !== "completed",
    );
  const overdue = allAssessmentsForInsights.filter((a) => {
    if (a.due < todayISO) return true;
    if (a.due !== todayISO || !/^([01]\d|2[0-3]):[0-5]\d$/.test(a.dueTime))
      return false;
    return new Date(`${a.due}T${a.dueTime}:00`).getTime() < todayDate.getTime();
  });
  const overdueInsights = overdue.length
    ? [
        {
          key: `overdue-${overdue
            .map((a) => a.id || a.title)
            .sort()
            .join("|")}`,
          title:
            overdue.length === 1
              ? "Overdue assessment"
              : `${overdue.length} overdue assessments`,
          detail:
            overdue.length === 1
              ? `${overdue[0].title} was due ${displayDate(overdue[0].due)}${overdue[0].dueTime ? ` at ${overdue[0].dueTime}` : ""}.`
              : "Review outstanding assessments with past deadlines.",
          target: "academics",
          priority: 1,
        },
      ]
    : [];

  const deadlineGroups = new Map();
  upcomingAssessments
    .filter((a) => a.due <= inSevenDays)
    .forEach((a) => {
      const day = a.due;
      if (!deadlineGroups.has(day)) deadlineGroups.set(day, []);
      deadlineGroups.get(day).push(a);
    });
  const clusters = [...deadlineGroups.entries()].filter(
    ([, items]) => items.length >= 2,
  );
  const clusteredInsights = clusters.map(([day, items]) => ({
    key: `cluster-${day}`,
    title: `${items.length} deadlines on ${displayDate(day)}`,
    detail:
      items
        .slice(0, 3)
        .map((a) => a.title)
        .join(", ") +
      (items.length > 3 ? ` and ${items.length - 3} more.` : "."),
    target: "academics",
    priority: 2,
  }));

  // term-wide workload belongs in a separate overview section NOT in Smart insights
  // week boundaries follow the same seven-day blocks as getCurrentTerm()
  const activeTerm = getCurrentTerm(studentData, todayISO);
  const termWeekRows = (() => {
    if (!activeTerm?.start || !activeTerm?.end) return [];
    const start = new Date(`${activeTerm.start}T12:00:00`);
    const end = new Date(`${activeTerm.end}T12:00:00`);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end < start
    )
      return [];
    const numberOfWeeks = Math.ceil(
      (end.getTime() - start.getTime() + 86400000) / 604800000,
    );
    const rows = Array.from({ length: numberOfWeeks }, (_, index) => {
      const first = new Date(start);
      first.setDate(first.getDate() + index * 7);
      const last = new Date(first);
      last.setDate(last.getDate() + 6);
      if (last > end) last.setTime(end.getTime());
      const toISO = (date) =>
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return {
        week: index + 1,
        start: toISO(first),
        end: toISO(last),
        count: 0,
      };
    });
    allAssessmentsForInsights.forEach((assessment) => {
      if (assessment.due < activeTerm.start || assessment.due > activeTerm.end)
        return;
      const due = new Date(`${assessment.due}T12:00:00`);
      const index = Math.floor((due.getTime() - start.getTime()) / 604800000);
      if (rows[index]) rows[index].count += 1;
    });
    return rows;
  })();
  const termWeekTotal = termWeekRows.reduce(
    (count, row) => count + row.count,
    0,
  );
  const termWeekMaximum = termWeekRows.length
    ? Math.max(1, ...termWeekRows.map((row) => row.count))
    : 1;
  // independent four-week read-only window; browsing graph periods cannot shift these insights
  const combinedInsights = combinedInsightsAvailable
    ? buildCombinedInsights({
        todayISO,
        assessments: upcomingAssessments,
        upcoming: combinedInsightPayments,
        formatMoney,
      })
    : [];
  const insightCandidates = [
    ...todayConflicts.map((item) => ({ ...item, priority: 1 })),
    ...overdueInsights,
    ...clusteredInsights,
    ...combinedInsights,
  ].sort((a, b) => a.priority - b.priority);
  const overviewInsights = insightCandidates.filter(
    (item) => !dismissedInsights.includes(item.key),
  );
  const recoverableInsights = insightCandidates.filter((item) =>
    dismissedInsights.includes(item.key),
  );

  // count outstanding assessments in calendar days, monday-start weeks, or months.
  const workloadISO = (date) =>
    [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  const mondayOf = (date) => {
    const monday = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return monday;
  };
  const workloadPeriods = (() => {
    if (workloadView === "daily") {
      const monday = mondayOf(todayDate);
      monday.setDate(monday.getDate() + workloadOffset * 7);
      return Array.from({ length: 7 }, (_, i) => {
        const start = new Date(monday);
        start.setDate(start.getDate() + i);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return {
          label: start.toLocaleDateString("en-GB", { weekday: "short" }),
          detail: start.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          }),
          start: workloadISO(start),
          end: workloadISO(end),
        };
      });
    }
    if (workloadView === "monthly") {
      return Array.from({ length: 6 }, (_, i) => {
        const start = new Date(
          todayDate.getFullYear(),
          todayDate.getMonth() + workloadOffset * 6 + i,
          1,
        );
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
        return {
          label: start.toLocaleDateString("en-GB", { month: "short" }),
          detail: String(start.getFullYear()),
          start: workloadISO(start),
          end: workloadISO(end),
        };
      });
    }
    const monday = mondayOf(todayDate);
    monday.setDate(monday.getDate() + workloadOffset * 35);
    return Array.from({ length: 5 }, (_, i) => {
      const start = new Date(monday);
      start.setDate(start.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return {
        label: `Week ${i + 1}`,
        detail: start.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        }),
        start: workloadISO(start),
        end: workloadISO(end),
      };
    });
  })();
  const workloadData = workloadPeriods.map((period) => ({
    ...period,
    count: upcomingAssessments.filter(
      (a) => a.due >= period.start && a.due < period.end,
    ).length,
  }));
  const workloadTotal = workloadData.reduce((sum, item) => sum + item.count, 0);
  const workloadPeak = workloadTotal
    ? workloadData.reduce((a, b) => (b.count > a.count ? b : a))
    : null;
  const workloadEnd = new Date(
    `${workloadPeriods[workloadPeriods.length - 1].end}T12:00:00`,
  );
  workloadEnd.setDate(workloadEnd.getDate() - 1);
  const workloadRange = `${displayDate(workloadPeriods[0].start)}  to  ${displayDate(workloadISO(workloadEnd))}`;

  const financeISO = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const financeMonday = (date) => {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  };
  const financePeriod = (() => {
    const today = new Date(
      todayDate.getFullYear(),
      todayDate.getMonth(),
      todayDate.getDate(),
    );
    const monday = financeMonday(today);
    const periods = [];
    const length =
      financeView === "weekly" ? 7 : financeView === "monthly" ? 6 : 5;
    for (let i = 0; i < length; i++) {
      let start, end, label, detail;
      if (financeView === "weekly") {
        start = new Date(
          monday.getFullYear(),
          monday.getMonth(),
          monday.getDate() + financeOffset * 7 + i,
        );
        end = new Date(
          start.getFullYear(),
          start.getMonth(),
          start.getDate() + 1,
        );
        label = start.toLocaleDateString("en-GB", { weekday: "short" });
        detail = start.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        });
      } else if (financeView === "monthly") {
        start = new Date(
          today.getFullYear(),
          today.getMonth() + financeOffset * 6 + i,
          1,
        );
        end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
        label = start.toLocaleDateString("en-GB", { month: "short" });
        detail = String(start.getFullYear());
      } else {
        start = new Date(
          monday.getFullYear(),
          monday.getMonth(),
          monday.getDate() + financeOffset * 35 + i * 7,
        );
        end = new Date(
          start.getFullYear(),
          start.getMonth(),
          start.getDate() + 7,
        );
        label = `Week ${i + 1}`;
        detail = start.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        });
      }
      periods.push({
        start: financeISO(start),
        end: financeISO(end),
        label,
        detail,
      });
    }
    return periods;
  })();
  const financeEnd = financePeriod[financePeriod.length - 1].end;
  const financeLastDay = financeISO(
    new Date(new Date(`${financeEnd}T12:00:00`).getTime() - 86400000),
  );
  // forecast uses recorded transactions + upcoming payments, not an actual bank balance
  const financeEvents = (forecast.upcoming || [])
    .filter((item) => item.date && item.date >= todayISO)
    .sort((a, b) => a.date.localeCompare(b.date));
  const recordedNetAt = (cutoff) =>
    ledgerDaily
      .filter((item) => item.date <= cutoff)
      .reduce((sum, item) => sum + Number(item.net || 0), 0);
  const financePoints = financePeriod.map((period) => {
    const lastDay = financeISO(
      new Date(new Date(`${period.end}T12:00:00`).getTime() - 86400000),
    );
    const isPast = lastDay < todayISO;
    const isFuture = period.start > todayISO;
    const historicalCutoff = lastDay < todayISO ? lastDay : todayISO;
    const projectedChange = financeEvents
      .filter((e) => e.date < period.end)
      .reduce(
        (sum, e) =>
          sum + (e.kind === "income" ? 1 : -1) * Number(e.amount || 0),
        0,
      );
    const balance = isPast
      ? ledgerHistoryAvailable
        ? recordedNetAt(historicalCutoff)
        : null
      : Number(ledgerBalance || 0) + projectedChange;
    return {
      ...period,
      balance,
      isPast,
      isFuture,
      isProjected: isFuture || lastDay >= todayISO,
      change: projectedChange,
    };
  });
  const financeVisibleEvents = financeEvents.filter(
    (e) => e.date >= financePeriod[0].start && e.date < financeEnd,
  );
  const financeIncome = financeVisibleEvents
    .filter((e) => e.kind === "income")
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const financeExpenses = financeVisibleEvents
    .filter((e) => e.kind === "expense")
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const financeProjected =
    financePoints[financePoints.length - 1]?.balance ??
    Number(ledgerBalance || 0);
  const financePast = financePeriod[0].start < todayISO;
  const ledgerHistoryNet = ledgerDaily.reduce(
    (sum, item) => sum + Number(item.net || 0),
    0,
  );
  const financeLedgerMismatch =
    ledgerHistoryAvailable &&
    Math.abs(ledgerHistoryNet - Number(ledgerBalance || 0)) > 0.011;
  const financeMin = Math.min(
    ...financePoints.filter((p) => p.balance !== null).map((p) => p.balance),
    Number(ledgerBalance || 0),
  );
  const financeMax = Math.max(
    ...financePoints.filter((p) => p.balance !== null).map((p) => p.balance),
    Number(ledgerBalance || 0),
  );
  const financeY = (value) =>
    180 - ((value - financeMin) * 150) / Math.max(1, financeMax - financeMin);
  const financeX = (i) =>
    30 + (i * 580) / Math.max(1, financePoints.length - 1);
  const financeRecordedPoints = financePoints
    .map((p, i) => ({ ...p, i }))
    .filter((p) => !p.isProjected && (ledgerHistoryAvailable || !p.isPast));
  const financeProjectedPoints = financePoints
    .map((p, i) => ({ ...p, i }))
    .filter((p) => p.isProjected);
  const financeForecastLinePoints = financeProjectedPoints.length
    ? [financeRecordedPoints.slice(-1)[0], ...financeProjectedPoints].filter(
        Boolean,
      )
    : [];
  const financeEndDate = new Date(`${financeEnd}T12:00:00`);
  financeEndDate.setDate(financeEndDate.getDate() - 1);
  const financeMonthYear = (iso) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    });
  const financeRange =
    financeView === "monthly"
      ? `${financeMonthYear(financePeriod[0].start)} to ${financeMonthYear(financeISO(financeEndDate))}`
      : `${displayDate(financePeriod[0].start)}  to  ${displayDate(financeISO(financeEndDate))}`;

  useEffect(() => {
    if (!user || page !== "dashboard") return;
    async function loadDashboard() {
      setSummaryLoading(true);
      setPlannerUpcomingLoading(true);
      setSummaryError("");
      setForecastAvailable(true);
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          localStorage.removeItem("user");
          setUser(null);
          return;
        }
        const headers = { Authorization: `Bearer ${token}` };
        const insightWeeks = combinedInsightWeeks(todayISO);
        const insightEnd =
          insightWeeks[insightWeeks.length - 1]?.end || inSevenDays;
        const [
          summaryResponse,
          forecastResponse,
          plannerResponse,
          todayEventsResponse,
          ledgerResponse,
          historyResponse,
          transactionsResponse,
          insightForecastResponse,
        ] = await Promise.all([
          fetch(`${API_URL}/transactions/summary`, { headers }),
          fetch(
            `${API_URL}/recurring/forecast?from=${todayISO}&to=${financeLastDay > inSevenDays ? financeLastDay : inSevenDays}`,
            { headers },
          ),
          fetch(`${API_URL}/planner/upcoming`, { headers }),
          fetch(
            `${API_URL}/planner/occurrences?from=${todayISO}&to=${todayISO}`,
            { headers },
          ),
          fetch(`${API_URL}/transactions/ledger-balance`, { headers }),
          // only fetch ledger history up to today
          fetch(
            `${API_URL}/transactions/ledger-history?from=2000-01-01&to=${todayISO}`,
            { headers },
          ),
          fetch(`${API_URL}/transactions?to=${todayISO}`, { headers }),
          // separate read-only request; never changes existing fnancial forecast data
          fetch(
            `${API_URL}/recurring/forecast?from=${todayISO}&to=${insightEnd}`,
            { headers },
          ).catch(() => null),
        ]);
        if (
          summaryResponse.status === 401 ||
          forecastResponse.status === 401 ||
          plannerResponse.status === 401 ||
          todayEventsResponse.status === 401 ||
          ledgerResponse.status === 401 ||
          (historyResponse && historyResponse.status === 401) ||
          transactionsResponse.status === 401 ||
          insightForecastResponse?.status === 401
        ) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          setUser(null);
          return;
        }
        // use transactions as a fallback if ledger history is unavailable
        let historyLoaded = false;
        if (historyResponse?.ok) {
          try {
            const history = await historyResponse.json();
            if (Array.isArray(history.daily)) {
              const normalised = history.daily.map((item) => ({
                date: String(item.date || "").slice(0, 10),
                net: Number(item.net || 0),
              }));
              setLedgerDaily(normalised);
              historyLoaded = true;
            }
          } catch (error) {
            console.warn("Historical endpoint returned invalid data", error);
          }
        }
        if (!historyLoaded && transactionsResponse.ok) {
          try {
            const transactions = await transactionsResponse.json();
            if (Array.isArray(transactions)) {
              const totals = new Map();
              transactions.forEach((item) => {
                const date = String(item.occurred_on || "").slice(0, 10);
                // older records without a status are completed transactions
                if (
                  !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
                  date > todayISO ||
                  item.status === "scheduled"
                )
                  return;
                const amount = Number(item.amount);
                if (!Number.isFinite(amount)) return;
                const signed =
                  item.kind === "income"
                    ? amount
                    : item.kind === "expense"
                      ? -amount
                      : 0;
                totals.set(date, (totals.get(date) || 0) + signed);
              });
              setLedgerDaily(
                [...totals.entries()]
                  .map(([date, net]) => ({ date, net }))
                  .sort((a, b) => a.date.localeCompare(b.date)),
              );
              historyLoaded = true;
            }
          } catch (error) {
            console.warn(
              "Could not derive historical totals from transactions",
              error,
            );
          }
        }
        setLedgerHistoryAvailable(historyLoaded);
        setLedgerHistoryError(
          historyLoaded
            ? ""
            : "Recorded daily history is unavailable. The graph cannot show earlier days accurately until transactions load.",
        );
        if (ledgerResponse.ok) {
          const ledgerData = await ledgerResponse.json();
          setLedgerBalance(Number(ledgerData.balance) || 0);
        } else {
          setLedgerBalance(0);
        }
        const summaryData = await summaryResponse.json();
        if (!summaryResponse.ok) {
          setSummaryError(
            summaryData.error || "Could not load your financial summary.",
          );
        } else {
          setSummary({
            income: Number(summaryData.income) || 0,
            expense: Number(summaryData.expense) || 0,
            balance: Number(summaryData.balance) || 0,
            categories: Array.isArray(summaryData.categories)
              ? summaryData.categories
              : [],
          });
        }
        if (insightForecastResponse?.ok) {
          try {
            const insightData = await insightForecastResponse.json();
            setCombinedInsightPayments(
              Array.isArray(insightData.upcoming) ? insightData.upcoming : [],
            );
            setCombinedInsightsAvailable(Array.isArray(insightData.upcoming));
          } catch {
            setCombinedInsightPayments([]);
            setCombinedInsightsAvailable(false);
          }
        } else {
          setCombinedInsightPayments([]);
          setCombinedInsightsAvailable(false);
        }
        if (forecastResponse.ok) {
          const forecastData = await forecastResponse.json();
          setForecast({
            expectedIncome: Number(forecastData.expected_income) || 0,
            expectedExpenses: Number(forecastData.expected_expenses) || 0,
            netChange: Number(forecastData.net_change) || 0,
            upcoming: Array.isArray(forecastData.upcoming)
              ? forecastData.upcoming
              : [],
          });
          setForecastAvailable(true);
        } else {
          setForecast({
            expectedIncome: 0,
            expectedExpenses: 0,
            netChange: 0,
            upcoming: [],
          });
          setForecastAvailable(false);
        }
        if (todayEventsResponse.ok) {
          const todayData = await todayEventsResponse.json();
          setTodayPlannerEvents(Array.isArray(todayData) ? todayData : []);
        } else {
          setTodayPlannerEvents([]);
        }
        if (plannerResponse.ok) {
          const plannerData = await plannerResponse.json();
          const now = new Date();
          const todayString = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, "0"),
            String(now.getDate()).padStart(2, "0"),
          ].join("-");
          const monthEndString = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, "0"),
            String(
              new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
            ).padStart(2, "0"),
          ].join("-");
          const thisMonthUpcoming = Array.isArray(plannerData)
            ? plannerData.filter((item) => {
                const itemDate = normaliseDate(item.item_date);
                return itemDate >= todayString && itemDate <= monthEndString;
              })
            : [];
          setPlannerUpcoming(thisMonthUpcoming);
        } else {
          setPlannerUpcoming([]);
          console.error(
            "Could not load planner upcoming:",
            plannerResponse.status,
          );
        }
      } catch (error) {
        console.error("Could not load dashboard:", error);
        setSummaryError("Could not connect to the DimeTime API.");
        setForecastAvailable(false);
        setCombinedInsightPayments([]);
        setCombinedInsightsAvailable(false);
        setPlannerUpcoming([]);
        setTodayPlannerEvents([]);
      } finally {
        setSummaryLoading(false);
        setPlannerUpcomingLoading(false);
      }
    }
    loadDashboard();
    // refresh finances when transactions or recurring payments change
    const refreshFinances = () => {
      loadDashboard();
    };
    window.addEventListener("dimetime-finances-updated", refreshFinances);
    window.addEventListener("focus", refreshFinances);
    return () => {
      window.removeEventListener("dimetime-finances-updated", refreshFinances);
      window.removeEventListener("focus", refreshFinances);
    };
  }, [
    user,
    page,
    financeView,
    financeOffset,
    financeEnd,
    financeLastDay,
    inSevenDays,
    todayISO,
  ]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");
    const errors = {};
    const cleanEmail = email.trim();
    if (mode === "register" && !name.trim()) errors.name = "Enter your name.";
    if (mode === "register" && !signupUniversity.trim())
      errors.university = "Enter your university or school.";
    if (
      mode === "register" &&
      !CURRENCIES.some(([code]) => code === signupCurrency)
    )
      errors.currency = "Select a supported currency.";
    if (!cleanEmail) errors.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))
      errors.email = "Enter an email address in the format name@example.com.";
    if (!password) errors.password = "Enter your password.";
    else if (mode === "register") {
      const missing = [];
      if (password.length < 8)
        missing.push(
          `at least 8 characters (${8 - password.length} more needed)`,
        );
      if (!/[A-Z]/.test(password)) missing.push("one uppercase letter");
      if (!/[^A-Za-z0-9\s]/.test(password))
        missing.push("one symbol (such as !, @ or #)");
      if (missing.length)
        errors.password = `Password needs ${missing.join(", ")}.`;
    }
    setAuthFieldErrors(errors);
    if (Object.keys(errors).length) {
      document
        .getElementById(
          errors.name
            ? "name"
            : errors.university
              ? "signup-university"
              : errors.currency
                ? "signup-currency"
                : errors.email
                  ? "email"
                  : "password",
        )
        ?.focus();
      return;
    }
    setLoading(true);
    const endpoint = mode === "register" ? "register" : "login";
    const body =
      mode === "register"
        ? {
            name: name.trim(),
            university: signupUniversity.trim(),
            displayCurrency: signupCurrency,
            email: cleanEmail,
            password,
          }
        : { email: cleanEmail, password };
    try {
      const response = await fetch(`${API_URL}/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "Something went wrong.");
        return;
      }
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
      setPage("dashboard");
    } catch (error) {
      console.error(error);
      setMessage("Could not connect to DimeTime.");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(newMode) {
    setMode(newMode);
    setShowPassword(false);
    setMessage("");
    setAuthFieldErrors({});
    setPassword("");
  }

  async function deleteAccount() {
    if (
      !window.confirm(
        "Permanently delete your DimeTime account and associated records? This cannot be undone.",
      )
    )
      return;
    const passwordConfirmation = window.prompt(
      "Enter your password to confirm account deletion:",
    );
    if (passwordConfirmation === null) return;
    if (!passwordConfirmation) {
      window.alert("A password is required.");
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) {
      window.alert("Please sign in again.");
      return;
    }
    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: passwordConfirmation }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(result.error || "Account deletion failed.");
        return;
      }
      resetStudent();
      logout();
      window.alert(
        "Account deleted from the active database. Provider backups may be retained under their retention policy.",
      );
    } catch (error) {
      console.error("Account deletion failed:", error);
      window.alert(
        "Could not reach the server. Your account was not confirmed deleted.",
      );
    }
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    setPage("dashboard");
    setEmail("");
    setPassword("");
    setMessage("");
    setMode("login");
    setPlannerUpcoming([]);
    setSummary({
      income: 0,
      expense: 0,
      balance: 0,
      categories: [],
    });
    setLedgerBalance(0);
    setLedgerDaily([]);
    setLedgerHistoryAvailable(false);
    setLedgerHistoryError("");
    setForecast({
      expectedIncome: 0,
      expectedExpenses: 0,
      netChange: 0,
      upcoming: [],
    });
    setForecastAvailable(true);
  }

  function formatMoney(amount) {
    return currency.format(amount);
  }

  if (user) {
    return (
      <div
        className={`dashboard-page${mobileMenuOpen ? " mobile-menu-open" : ""}`}
      >
        <header className="mobile-site-header">
          <button
            type="button"
            ref={mobileMenuButtonRef}
            className="mobile-menu-trigger"
            aria-label="Open navigation menu"
            aria-controls="mobile-navigation"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="mobile-menu-bars" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
          <div className="mobile-site-brand">
            <img src={logoImage} alt="" />
            <span>DimeTime</span>
          </div>
        </header>
        {mobileMenuOpen && (
          <button
            type="button"
            className="mobile-menu-backdrop"
            aria-label="Close navigation menu"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
        <aside
          id="mobile-navigation"
          ref={mobileSidebarRef}
          className={`sidebar${mobileMenuOpen ? " mobile-sidebar-open" : ""}`}
          role={mobileMenuOpen ? "dialog" : undefined}
          aria-modal={mobileMenuOpen ? "true" : undefined}
          aria-label="Main navigation"
        >
          <button
            type="button"
            ref={mobileMenuCloseRef}
            className="mobile-menu-close"
            aria-label="Close navigation menu"
            onClick={() => {
              setMobileMenuOpen(false);
              mobileMenuButtonRef.current?.focus();
            }}
          >
            ×
          </button>

          <div className="sidebar-brand">
            <img className="sidebar-logo" src={logoImage} alt="DimeTime logo" />

            <h2>DimeTime</h2>
          </div>

          <nav className="sidebar-nav" onClick={() => setMobileMenuOpen(false)}>
            <button
              className={page === "dashboard" ? "nav-item active" : "nav-item"}
              onClick={() => setPage("dashboard")}
            >
              Dashboard
            </button>
            <span className="owed-nav-label">FINANCES</span>

            <button
              className={
                page === "transactions" ? "nav-item active" : "nav-item"
              }
              onClick={() => setPage("transactions")}
            >
              Transactions
            </button>

            <button
              className={page === "budget" ? "nav-item active" : "nav-item"}
              onClick={() => setPage("budget")}
            >
              Budget
            </button>
            <button
              className={page === "money-owed" ? "nav-item active" : "nav-item"}
              onClick={() => setPage("money-owed")}
            >
              Money owed
            </button>
            <span className="owed-nav-label">ACADEMICS &amp; PLANNING</span>

            <button
              className={page === "planner" ? "nav-item active" : "nav-item"}
              onClick={() => setPage("planner")}
            >
              Planner
            </button>

            <button
              className={page === "academics" ? "nav-item active" : "nav-item"}
              onClick={() => setPage("academics")}
            >
              Academics
            </button>
            <span className="owed-nav-label">ACCOUNT</span>
            <button
              className={page === "settings" ? "nav-item active" : "nav-item"}
              onClick={() => setPage("settings")}
            >
              Student settings
            </button>
            <button
              type="button"
              className="nav-item"
              onClick={() => setSetupGuideOpen(true)}
            >
              Setup guide
            </button>
          </nav>

          <button
            className="logout-button"
            onClick={() => {
              setMobileMenuOpen(false);
              logout();
            }}
          >
            Log out
          </button>
        </aside>

        {setupGuideOpen && (
          <SetupGuide
            onClose={() => setSetupGuideOpen(false)}
            onFinish={() => {
              updateStudent(user.id, (prev) => ({
                ...prev,
                onboardingCompleted: true,
              }));
              setSetupGuideOpen(false);
            }}
            onNavigate={(destination) => {
              setPage(destination);
              setMobileMenuOpen(false);
            }}
          />
        )}

        <Assistant
          key={user.id}
          onNavigate={(destination) => {
            setPage(destination);
            setMobileMenuOpen(false);
          }}
        />

        {page === "transactions" && (
          <main className="dashboard-main">
            <Transactions onBack={() => setPage("dashboard")} />
          </main>
        )}

        {page === "money-owed" && (
          <main className="dashboard-main">
            <MoneyOwed
              onBack={() => setPage("dashboard")}
              onOpenTransactions={() => setPage("transactions")}
            />
          </main>
        )}

        {page === "budget" && (
          <main className="dashboard-main">
            <Budget onBack={() => setPage("dashboard")} />
          </main>
        )}

        {page === "planner" && (
          <main className="dashboard-main">
            <Planner user={user} onBack={() => setPage("dashboard")} />
          </main>
        )}

        {page === "academics" && (
          <main className="dashboard-main">
            <Academics user={user} onBack={() => setPage("dashboard")} />
          </main>
        )}
        {page === "settings" && (
          <main className="dashboard-main">
            <>
              <StudentSettings
                user={user}
                onBack={() => setPage("dashboard")}
              />
              <ChangePassword
                onChanged={() => {
                  logout();
                  window.alert("Password updated. Please sign in again.");
                }}
              />
              <section className="student-panel" style={{ marginTop: 24 }}>
                <h3>Privacy and account</h3>
                <p>
                  Deleting your account removes linked records from the active
                  database. Backups may remain under the provider's retention
                  policy.
                </p>
                <button type="button" onClick={deleteAccount}>
                  Delete my account permanently
                </button>
              </section>
            </>
          </main>
        )}

        {page === "dashboard" && (
          <main className="dashboard-main">
            <header className="dashboard-header editorial-dashboard-header">
              <div>
                <p className="dashboard-eyebrow">OVERVIEW</p>
                <h1>Welcome, {user.name}!</h1>
                <p className="editorial-academic-meta">
                  {studentData?.university || "Your university"}
                  {studentData?.course ? (
                    <>
                      <span
                        className="editorial-academic-separator"
                        aria-hidden="true"
                      >
                        ·
                      </span>
                      {studentData.course}
                    </>
                  ) : null}
                </p>
              </div>
            </header>

            {summaryError && <p className="message">{summaryError}</p>}

            <section
              className="editorial-hero-banner"
              aria-label="A little encouragement"
            >
              <div className="editorial-hero-copy">
                <p>Small steps. Meaningful progress.</p>
              </div>
            </section>
            <div
              className="student-tabs"
              role="group"
              aria-label="Dashboard view"
            >
              {["overview", "money", "academics"].map((tab) => (
                <button
                  type="button"
                  aria-pressed={dashboardTab === tab}
                  className={dashboardTab === tab ? "selected" : ""}
                  key={tab}
                  onClick={() => setDashboardTab(tab)}
                >
                  {tab[0].toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            {dashboardTab === "overview" && (
              <>
                <section
                  className="student-metrics overview-metrics"
                  aria-label="Overview shortcuts"
                >
                  <div
                    className="student-panel overview-summary-card overview-schedule-card"
                    ref={schedulePopoverRef}
                  >
                    <button
                      type="button"
                      className="overview-card-link"
                      onClick={() => {
                        setSchedulePopoverOpen(false);
                        setPage("planner");
                      }}
                      aria-label="Open today's schedule in Planner"
                    >
                      <span>Today's schedule</span>
                      <strong>
                        {plannerUpcomingLoading
                          ? "Loading…"
                          : `${remainingToday.length} ${remainingToday.length === 1 ? "event" : "events"}`}
                      </strong>
                      <small>
                        {plannerUpcomingLoading
                          ? "Loading your plans"
                          : remainingToday[0]
                            ? `Next: ${remainingToday[0].title}${remainingToday[0].start_time ? ` · ${formatPlannerTime(remainingToday[0].start_time)}` : ""}`
                            : "No events remaining today"}
                      </small>
                    </button>
                    {!plannerUpcomingLoading && remainingToday.length > 1 && (
                      <>
                        <button
                          type="button"
                          className="overview-view-all"
                          aria-expanded={schedulePopoverOpen}
                          aria-controls="overview-today-popover"
                          onClick={() =>
                            setSchedulePopoverOpen((value) => !value)
                          }
                        >
                          View all {remainingToday.length}{" "}
                          <span aria-hidden="true">⌄</span>
                        </button>
                        {schedulePopoverOpen && (
                          <div
                            id="overview-today-popover"
                            className="overview-schedule-popover"
                            role="region"
                            aria-label="All remaining events today"
                          >
                            <div className="overview-popover-head">
                              <h3>Today's schedule</h3>
                              <button
                                type="button"
                                onClick={() => setSchedulePopoverOpen(false)}
                                aria-label="Close schedule preview"
                              >
                                ×
                              </button>
                            </div>
                            <div className="overview-popover-list">
                              {remainingToday.map((item, i) => (
                                <div
                                  className="overview-popover-item"
                                  key={`${item.id || item.title}-${i}`}
                                >
                                  <strong>{item.title}</strong>
                                  <small>
                                    {item.start_time
                                      ? formatPlannerTime(item.start_time)
                                      : "Time not set"}
                                    {item.end_time
                                      ? ` to ${formatPlannerTime(item.end_time)}`
                                      : ""}
                                    {item.item_type
                                      ? ` · ${item.item_type}`
                                      : ""}
                                  </small>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="student-panel overview-summary-card">
                    <button
                      type="button"
                      className="overview-card-link"
                      onClick={() => setPage("academics")}
                      aria-label="Open assessment deadlines in Academics"
                    >
                      <span>Next deadline</span>
                      <strong>
                        {nearestAssessment
                          ? displayDate(nearestAssessment.due)
                          : "No deadlines"}
                      </strong>
                      <small>
                        {nearestAssessment
                          ? `Next: ${nearestAssessment.title}${nearestAssessment.dueTime ? ` · ${nearestAssessment.dueTime}` : ""}`
                          : "No upcoming assessments"}
                      </small>
                    </button>
                  </div>
                  <div className="student-panel overview-summary-card">
                    <button
                      type="button"
                      className="overview-card-link"
                      onClick={() => setPage("transactions")}
                      aria-label="Open scheduled payments in Transactions"
                    >
                      <span>Upcoming payments</span>
                      <strong>
                        {forecastAvailable
                          ? formatMoney(upcomingPaymentTotal)
                          : "Unavailable"}
                      </strong>
                      <small>
                        {!forecastAvailable
                          ? "Forecast unavailable"
                          : nearestPayment
                            ? `Next: ${nearestPayment.description || nearestPayment.category || "Scheduled payment"} · ${displayDate(nearestPayment.date)}`
                            : "No payments in the next 7 days"}
                      </small>
                    </button>
                  </div>
                </section>
                <section
                  className="student-panel overview-attention"
                  aria-label="Smart insights"
                  aria-live="polite"
                >
                  <div className="overview-insights-heading">
                    <h3>Smart insights</h3>
                    <div className="overview-insights-actions">
                      <button
                        type="button"
                        className="overview-insights-action"
                        onClick={() => setShowDismissedInsights((v) => !v)}
                        aria-expanded={showDismissedInsights}
                        aria-controls="overview-dismissed-insights"
                      >
                        Recover
                        {recoverableInsights.length
                          ? ` (${recoverableInsights.length})`
                          : ""}
                      </button>
                    </div>
                  </div>
                  {overviewInsights.length > 0 ? (
                    overviewInsights.map((item) => (
                      <div className="overview-insight-row" key={item.key}>
                        <button
                          type="button"
                          className="overview-insight-link"
                          onClick={() => {
                            if (item.target === "dashboard")
                              setDashboardTab("money");
                            else setPage(item.target);
                          }}
                        >
                          <strong>{item.title}</strong>
                          <small>{item.detail}</small>
                        </button>
                        <button
                          type="button"
                          className="overview-insight-dismiss"
                          aria-label={`Dismiss ${item.title}`}
                          onClick={() => dismissInsight(item.key)}
                        >
                          ×
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="student-muted">
                      Nothing to flag right now. You're all caught up!
                    </p>
                  )}
                  {showDismissedInsights && (
                    <div
                      id="overview-dismissed-insights"
                      className="overview-dismissed-insights"
                    >
                      <h4>Dismissed insights</h4>
                      {recoverableInsights.length ? (
                        recoverableInsights.map((item) => (
                          <div className="overview-recover-row" key={item.key}>
                            <div>
                              <strong>{item.title}</strong>
                              <small>{item.detail}</small>
                            </div>
                            <button
                              type="button"
                              onClick={() => restoreInsight(item.key)}
                              aria-label={`Restore ${item.title}`}
                            >
                              Restore
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="student-muted">
                          No dismissed insights to recover.
                        </p>
                      )}
                    </div>
                  )}
                </section>
                <section
                  className="student-panel overview-term-workload"
                  aria-labelledby="overview-term-workload-heading"
                >
                  <div className="overview-term-workload-header">
                    <div>
                      <h3 id="overview-term-workload-heading">
                        Deadlines by academic week
                      </h3>
                      <p className="student-muted">
                        {activeTerm
                          ? `${activeTerm.name} · ${termWeekTotal} outstanding ${termWeekTotal === 1 ? "deadline" : "deadlines"}`
                          : "Term dates are not configured for today."}
                      </p>
                    </div>
                  </div>
                  {activeTerm && termWeekRows.length ? (
                    <>
                      <div
                        className="overview-term-lines"
                        role="group"
                        aria-label="Outstanding assessment deadlines for every week of the current term"
                      >
                        <div className="overview-term-lines-term">
                          {activeTerm.name}
                        </div>
                        {termWeekRows.map((row) => {
                          const currentWeek =
                            todayISO >= row.start && todayISO <= row.end;
                          return (
                            <div
                              className={`overview-term-line-row${currentWeek ? " is-current" : ""}`}
                              key={`${activeTerm.start}-${row.week}`}
                              aria-label={`${activeTerm.name}, week ${row.week}, ${row.count} ${row.count === 1 ? "outstanding deadline" : "outstanding deadlines"}, ${displayDate(row.start)} to ${displayDate(row.end)}`}
                            >
                              <span className="overview-term-line-week">
                                Week {row.week}
                              </span>
                              <div
                                className="overview-term-line-track"
                                aria-hidden="true"
                              >
                                <div
                                  className="overview-term-line-fill"
                                  style={{
                                    width: `${row.count ? Math.max(0, (row.count / termWeekMaximum) * 100) : 0}%`,
                                  }}
                                />
                              </div>
                              <span className="overview-term-line-count">
                                {row.count}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <p className="student-muted">
                      Add your term dates in Student Settings to see the weekly
                      breakdown.
                    </p>
                  )}
                </section>
              </>
            )}
            {dashboardTab === "money" && (
              <>
                <section className="student-metrics">
                  <div className="student-panel">
                    <span>Recorded monthly net</span>
                    <strong>
                      {summaryLoading ? "…" : formatMoney(summary.balance)}
                    </strong>
                    <small>Completed income minus expenses this month</small>
                  </div>
                  <div className="student-panel">
                    <span>Scheduled income</span>
                    <strong>
                      {forecastAvailable
                        ? formatMoney(financeIncome)
                        : "Not available"}
                    </strong>
                    <small>Income expected within the forecast period</small>
                  </div>
                  <div className="student-panel">
                    <span>Scheduled expenses</span>
                    <strong>
                      {forecastAvailable
                        ? formatMoney(financeExpenses)
                        : "Not available"}
                    </strong>
                    <small>Expenses expected within the forecast period</small>
                  </div>
                </section>
                <p
                  className="student-muted"
                  role="status"
                  style={{ marginBottom: 10 }}
                >
                  {currency.note}
                </p>
                <section className="student-panel finance-forecast-panel">
                  <div className="finance-forecast-heading">
                    <div>
                      <h3>Financial forecast</h3>
                      <p className="student-muted">
                        Projected balance from scheduled one-off and recurring
                        payments
                      </p>
                    </div>
                    <div className="finance-forecast-actions">
                      <div
                        className="finance-forecast-switch"
                        role="group"
                        aria-label="Financial forecast timeframe"
                      >
                        {[
                          ["weekly", "This week"],
                          ["weeks", "By week"],
                          ["monthly", "By month"],
                        ].map(([value, label]) => (
                          <button
                            type="button"
                            key={value}
                            className={financeView === value ? "active" : ""}
                            aria-pressed={financeView === value}
                            onClick={() => {
                              setFinanceView(value);
                              setFinanceOffset(0);
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <label className="forecast-breakdown-toggle">
                        <input
                          type="checkbox"
                          checked={showForecastBreakdown}
                          onChange={(e) =>
                            setShowForecastBreakdown(e.target.checked)
                          }
                          aria-controls="forecast-breakdown"
                        />
                        <span>Show breakdown</span>
                      </label>
                    </div>
                  </div>
                  <div className="finance-forecast-nav">
                    <button
                      type="button"
                      aria-label="Previous forecast period"
                      onClick={() =>
                        setFinanceOffset((x) => Math.max(0, x - 1))
                      }
                      disabled={financeOffset === 0}
                    >
                      ‹
                    </button>
                    <span>{financeRange}</span>
                    <button
                      type="button"
                      aria-label="Next forecast period"
                      onClick={() =>
                        setFinanceOffset((x) => Math.min(12, x + 1))
                      }
                      disabled={financeOffset === 12}
                    >
                      ›
                    </button>
                    {financeOffset !== 0 && (
                      <button
                        type="button"
                        className="finance-reset"
                        onClick={() => setFinanceOffset(0)}
                      >
                        Today
                      </button>
                    )}
                  </div>
                  {forecastAvailable ? (
                    <>
                      {ledgerHistoryError && financePast && (
                        <p className="student-muted" role="status">
                          {ledgerHistoryError}
                        </p>
                      )}
                      {financeLedgerMismatch && (
                        <p className="student-muted" role="status">
                          Recorded transaction history differs from the ledger
                          summary. Please refresh and check that the backend is
                          up to date.
                        </p>
                      )}
                      <svg
                        className="finance-forecast-svg"
                        viewBox="0 0 640 220"
                        role="img"
                        aria-label={`Recorded net balances followed by projected balances: ${financePoints.map((p) => `${p.label} ${p.balance === null ? "unavailable" : `${p.isProjected ? "projected" : "recorded"} ${formatMoney(p.balance)}`}`).join("; ")}`}
                      >
                        {[30, 80, 130, 180].map((y) => (
                          <line
                            key={y}
                            x1="30"
                            y1={y}
                            x2="610"
                            y2={y}
                            className="forecast-gridline"
                            strokeWidth="1"
                          />
                        ))}
                        <polyline
                          fill="none"
                          className="forecast-line forecast-line-recorded"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={financeRecordedPoints
                            .map(
                              (p) => `${financeX(p.i)},${financeY(p.balance)}`,
                            )
                            .join(" ")}
                        />
                        <polyline
                          fill="none"
                          className="forecast-line forecast-line-projected"
                          strokeDasharray="8 7"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={financeForecastLinePoints
                            .map(
                              (p) => `${financeX(p.i)},${financeY(p.balance)}`,
                            )
                            .join(" ")}
                        />
                        {financePoints.some((p) => p.isProjected) &&
                          financePoints.some((p) => !p.isProjected) &&
                          (() => {
                            const index = financePoints.findIndex(
                              (p) => p.isProjected,
                            );
                            const x = financeX(index - 0.5);
                            return (
                              <line
                                x1={x}
                                x2={x}
                                y1="20"
                                y2="182"
                                className="forecast-today-divider"
                                strokeDasharray="4 5"
                                strokeWidth="1.5"
                              />
                            );
                          })()}
                        {financePoints.map((p, i) => {
                          if (p.balance === null) return null;
                          const x =
                            30 +
                            (i * 580) / Math.max(1, financePoints.length - 1);
                          const y = financeY(p.balance);
                          return (
                            <g key={p.start}>
                              <circle
                                cx={x}
                                cy={y}
                                r={hoveredForecastPoint === i ? 6 : 4}
                                className="forecast-point"
                              />
                              <circle
                                cx={x}
                                cy={y}
                                r="17"
                                fill="transparent"
                                aria-label={`${p.label}: ${p.isProjected ? "projected" : "recorded"} net ${formatMoney(p.balance)}`}
                                onMouseEnter={() => setHoveredForecastPoint(i)}
                                onMouseLeave={() =>
                                  setHoveredForecastPoint(null)
                                }
                                onClick={() =>
                                  setHoveredForecastPoint(
                                    hoveredForecastPoint === i ? null : i,
                                  )
                                }
                              >
                                <title>{`${p.label}: ${p.isProjected ? "Projected" : "Recorded"} net: ${formatMoney(p.balance)}`}</title>
                              </circle>
                            </g>
                          );
                        })}
                        {hoveredForecastPoint !== null &&
                          financePoints[hoveredForecastPoint] &&
                          (() => {
                            const p = financePoints[hoveredForecastPoint];
                            if (p.balance === null) return null;
                            const x =
                              30 +
                              (hoveredForecastPoint * 580) /
                                Math.max(1, financePoints.length - 1);
                            const y = financeY(p.balance);
                            const boxX = Math.max(5, Math.min(425, x - 105));
                            const boxY = y < 82 ? y + 15 : y - 70;
                            return (
                              <g pointerEvents="none">
                                <rect
                                  x={boxX}
                                  y={boxY}
                                  width="210"
                                  height="55"
                                  rx="10"
                                  className="forecast-tooltip-box"
                                  strokeWidth="1.5"
                                />
                                <text
                                  x={boxX + 12}
                                  y={boxY + 20}
                                  className="forecast-tooltip-label"
                                  fontSize="12"
                                >
                                  {p.label}
                                </text>
                                <text
                                  x={boxX + 12}
                                  y={boxY + 41}
                                  className="forecast-tooltip-value"
                                  fontWeight="400"
                                  fontSize="12"
                                >{`${p.isProjected ? "Projected" : "Recorded"}: ${formatMoney(p.balance)}`}</text>
                              </g>
                            );
                          })()}
                        {financePoints.map((p, i) => (
                          <text
                            key={p.start}
                            x={
                              30 +
                              (i * 580) / Math.max(1, financePoints.length - 1)
                            }
                            y="211"
                            textAnchor="middle"
                            fontSize="12"
                            className="forecast-axis-label"
                          >
                            {p.label}
                          </text>
                        ))}
                      </svg>
                      <div
                        className="finance-forecast-legend"
                        aria-label="Graph legend"
                      >
                        <span>
                          <i className="forecast-legend-recorded" /> Recorded
                          net
                        </span>
                        <span>
                          <i className="forecast-legend-projected" /> Projected
                          net
                        </span>
                      </div>
                      <div
                        id="forecast-breakdown"
                        className="forecast-breakdown-region"
                        hidden={!showForecastBreakdown}
                      >
                        <div
                          className="forecast-point-controls"
                          role="group"
                          aria-label="Forecast balances by period"
                        >
                          {financePoints.map((p, i) => (
                            <button
                              type="button"
                              key={p.start}
                              aria-pressed={hoveredForecastPoint === i}
                              onClick={() =>
                                setHoveredForecastPoint(
                                  hoveredForecastPoint === i ? null : i,
                                )
                              }
                              disabled={p.balance === null}
                              onFocus={() => setHoveredForecastPoint(i)}
                              onMouseEnter={() => setHoveredForecastPoint(i)}
                            >
                              <span>
                                {p.label} {!p.isProjected && " (recorded)"}
                              </span>
                              <strong>
                                {p.balance === null
                                  ? "Unavailable"
                                  : formatMoney(p.balance)}
                              </strong>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="finance-forecast-summary">
                        <div>
                          <span>Projected closing amount</span>
                          <strong>{formatMoney(financeProjected)}</strong>
                        </div>
                        <div>
                          <span>Change from recorded ledger net</span>
                          <strong>
                            {formatMoney(
                              financeProjected - Number(ledgerBalance || 0),
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>Expected income</span>
                          <strong>{formatMoney(financeIncome)}</strong>
                        </div>
                        <div>
                          <span>Expected expenses</span>
                          <strong>{formatMoney(financeExpenses)}</strong>
                        </div>
                      </div>
                      <p className="student-muted finance-forecast-note">
                        Your forecast is based on the income, expenses and
                        upcoming payments you've added to DimeTime. Anything you
                        haven't recorded won't be included.
                      </p>
                    </>
                  ) : (
                    <p className="student-muted">
                      Forecast temporarily unavailable. Check your backend
                      connection.
                    </p>
                  )}
                </section>
                <section className="student-panel">
                  <h3>Upcoming scheduled payments</h3>
                  {(forecast.upcoming || [])
                    .filter((x) => x.kind === "expense")
                    .slice(0, 5)
                    .map((x, i) => (
                      <div className="student-assignment" key={i}>
                        <div>
                          <strong>
                            {x.description || x.category || "Expense"}
                          </strong>
                          <p>{displayDate(x.date)}</p>
                        </div>
                        <strong>{formatMoney(x.amount)}</strong>
                      </div>
                    ))}
                  {!(forecast.upcoming || []).some(
                    (x) => x.kind === "expense",
                  ) && (
                    <p className="student-muted">
                      No scheduled expenses in this period.
                    </p>
                  )}
                </section>
              </>
            )}
            {dashboardTab === "academics" && (
              <>
                <section className="student-metrics">
                  <div className="student-panel">
                    <span>Upcoming assessments</span>
                    <strong>{upcomingAssessments.length}</strong>
                    <small>Not completed</small>
                  </div>
                  <div className="student-panel">
                    <span>Next deadline</span>
                    <strong>
                      {upcomingAssessments[0]
                        ? `${displayDate(upcomingAssessments[0].due)}${/^([01]\d|2[0-3]):[0-5]\d$/.test(upcomingAssessments[0].dueTime || "") ? ` · ${upcomingAssessments[0].dueTime}` : ""}`
                        : "None"}
                    </strong>
                    <small>
                      {upcomingAssessments[0]?.title || "No assessments due"}
                    </small>
                  </div>
                  <div className="student-panel">
                    <span>Current term</span>
                    <strong>
                      {getCurrentTerm(studentData, todayISO)?.name ||
                        "Not configured"}
                    </strong>
                    <small>
                      {getCurrentTerm(studentData, todayISO)
                        ? `Week ${getCurrentTerm(studentData, todayISO).week} · ${getCurrentTerm(studentData, todayISO).daysRemaining} days left`
                        : "Set term dates in Settings"}
                    </small>
                  </div>
                </section>
                <section className="student-panel workload-panel">
                  <div className="workload-heading">
                    <div>
                      <h3>Assessment workload</h3>
                      <p className="student-muted">
                        Outstanding deadlines{" "}
                        {workloadView === "daily"
                          ? "each day"
                          : workloadView === "monthly"
                            ? "each month"
                            : "each week"}
                      </p>
                    </div>
                    <div
                      className="workload-switch"
                      role="group"
                      aria-label="Assessment workload timeframe"
                    >
                      {[
                        ["daily", "This week"],
                        ["weekly", "By week"],
                        ["monthly", "By month"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={workloadView === value ? "active" : ""}
                          aria-pressed={workloadView === value}
                          onClick={() => {
                            setWorkloadView(value);
                            setWorkloadOffset(0);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="workload-navigation">
                    <button
                      type="button"
                      aria-label="Previous period"
                      onClick={() => setWorkloadOffset((x) => x - 1)}
                    >
                      ‹
                    </button>
                    <span>{workloadRange}</span>
                    <button
                      type="button"
                      aria-label="Next period"
                      onClick={() => setWorkloadOffset((x) => x + 1)}
                    >
                      ›
                    </button>
                    {workloadOffset !== 0 && (
                      <button
                        type="button"
                        className="workload-today"
                        onClick={() => setWorkloadOffset(0)}
                      >
                        Today
                      </button>
                    )}
                  </div>
                  <div
                    className="workload-chart"
                    role="img"
                    aria-label={`Assessment workload: ${workloadData.map((w) => `${w.label}: ${w.count} deadlines`).join("; ")}`}
                  >
                    {workloadData.map((w) => (
                      <div className="workload-week" key={w.start}>
                        <strong>{w.count}</strong>
                        <div className="workload-track">
                          <div
                            className="workload-bar"
                            style={{
                              height: `${w.count ? Math.max(7, (w.count * 100) / Math.max(1, ...workloadData.map((x) => x.count))) : 0}%`,
                            }}
                          />
                        </div>
                        <small>{w.label}</small>
                        <span className="workload-detail">{w.detail}</span>
                      </div>
                    ))}
                  </div>
                  <div className="workload-summary">
                    <div>
                      <span>Total deadlines</span>
                      <strong>{workloadTotal}</strong>
                    </div>
                    <div>
                      <span>
                        Busiest{" "}
                        {workloadView === "daily"
                          ? "day"
                          : workloadView === "monthly"
                            ? "month"
                            : "week"}
                      </span>
                      <strong>
                        {workloadPeak
                          ? `${workloadPeak.label} (${workloadPeak.count})`
                          : "None"}
                      </strong>
                    </div>
                  </div>
                </section>
                <section className="student-panel">
                  <div className="card-heading">
                    <div>
                      <h3>Next academic deadlines</h3>
                      <p>Assessments and exam countdowns</p>
                    </div>
                    <button onClick={() => setPage("academics")}>
                      Manage assessments
                    </button>
                  </div>
                  {upcomingAssessments.slice(0, 6).map((a) => (
                    <div className="student-assignment" key={a.id}>
                      <div>
                        <strong>{a.title}</strong>
                        <p>
                          {a.type && a.type !== "Unspecified"
                            ? `${a.type} · `
                            : ""}
                          {a.module || "General"} · {displayDate(a.due)}
                          {/^([01]\d|2[0-3]):[0-5]\d$/.test(a.dueTime || "")
                            ? ` · ${a.dueTime}`
                            : ""}
                        </p>
                      </div>
                      <span>
                        {(() => {
                          if (
                            /^([01]\d|2[0-3]):[0-5]\d$/.test(a.dueTime || "")
                          ) {
                            const remaining = Math.max(
                              0,
                              new Date(`${a.due}T${a.dueTime}:00`).getTime() -
                                Date.now(),
                            );
                            const hours = Math.floor(remaining / 3600000);
                            const days = Math.floor(hours / 24);
                            return days
                              ? `${days}d ${hours % 24}h`
                              : hours
                                ? `${hours}h`
                                : `${Math.max(1, Math.ceil(remaining / 60000))}m`;
                          }
                          return `${Math.max(0, Math.ceil((new Date(`${a.due}T12:00:00`) - new Date()) / 86400000))} days`;
                        })()}
                      </span>
                    </div>
                  ))}
                  {!upcomingAssessments.length && (
                    <p className="student-muted">
                      No upcoming assessments. Add one in Academics.
                    </p>
                  )}
                </section>
              </>
            )}
          </main>
        )}
      </div>
    );
  }

  return (
    <div className="auth-page">
      <section className="brand-panel">
        <div className="brand-content">
          <img className="logo" src={logoImage} alt="DimeTime logo" />

          <h1>DimeTime</h1>

          <p className="tagline">
            Your money and your time,
            <br />
            finally in one place.
          </p>

          <div className="feature-list">
            <p>✓ Keep track of your spending</p>

            <p>✓ Stay on top of your student budget</p>

            <p>✓ Organise your schedule</p>
          </div>
        </div>
      </section>

      <section className="form-panel">
        <div className="auth-card">
          <p className="eyebrow">WELCOME TO DIMETIME</p>

          <h2>
            {mode === "login"
              ? "Welcome back"
              : mode === "register"
                ? "Create your account"
                : "Account recovery"}
          </h2>

          {(mode === "login" || mode === "register") && (
            <p className="subtitle">
              {mode === "login"
                ? "Sign in to continue to your dashboard."
                : "Start managing your money and time."}
            </p>
          )}

          {mode === "forgot" || mode === "reset" ? (
            <PasswordRecovery
              resetToken={mode === "reset" ? resetToken : null}
              onBack={() => switchMode("login")}
            />
          ) : (
            <>
              <div className="auth-tabs">
                <button
                  type="button"
                  className={mode === "login" ? "active" : ""}
                  onClick={() => switchMode("login")}
                >
                  Log in
                </button>

                <button
                  type="button"
                  className={mode === "register" ? "active" : ""}
                  onClick={() => switchMode("register")}
                >
                  Sign up
                </button>
              </div>

              <form onSubmit={handleSubmit} noValidate>
                {mode === "register" && (
                  <div className="field">
                    <label htmlFor="name">Name</label>

                    <input
                      id="name"
                      type="text"
                      autoComplete="name"
                      placeholder="Your name"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setAuthFieldErrors((old) => ({ ...old, name: "" }));
                      }}
                      aria-invalid={Boolean(authFieldErrors.name)}
                      aria-describedby={
                        authFieldErrors.name ? "name-error" : undefined
                      }
                      required
                    />
                    {authFieldErrors.name && (
                      <p
                        id="name-error"
                        className="auth-field-error"
                        role="alert"
                      >
                        {authFieldErrors.name}
                      </p>
                    )}
                  </div>
                )}

                {mode === "register" && (
                  <>
                    <div className="field">
                      <label htmlFor="signup-university">
                        University or school
                      </label>
                      <input
                        id="signup-university"
                        type="text"
                        autoComplete="organization"
                        maxLength={160}
                        placeholder="Your university or school"
                        value={signupUniversity}
                        onChange={(e) => {
                          setSignupUniversity(e.target.value);
                          setAuthFieldErrors((old) => ({
                            ...old,
                            university: "",
                          }));
                        }}
                        aria-invalid={Boolean(authFieldErrors.university)}
                        aria-describedby={
                          authFieldErrors.university
                            ? "signup-university-error"
                            : undefined
                        }
                        required
                      />
                      {authFieldErrors.university && (
                        <p
                          id="signup-university-error"
                          className="auth-field-error"
                          role="alert"
                        >
                          {authFieldErrors.university}
                        </p>
                      )}
                    </div>
                    <div className="field">
                      <label htmlFor="signup-currency">Display currency</label>
                      <select
                        id="signup-currency"
                        value={signupCurrency}
                        onChange={(e) => {
                          setSignupCurrency(e.target.value);
                          setAuthFieldErrors((old) => ({
                            ...old,
                            currency: "",
                          }));
                        }}
                        aria-invalid={Boolean(authFieldErrors.currency)}
                        aria-describedby={
                          authFieldErrors.currency
                            ? "signup-currency-error"
                            : undefined
                        }
                      >
                        {CURRENCIES.map(([code, label]) => (
                          <option key={code} value={code}>
                            {label} ({code})
                          </option>
                        ))}
                      </select>
                      {authFieldErrors.currency && (
                        <p
                          id="signup-currency-error"
                          className="auth-field-error"
                          role="alert"
                        >
                          {authFieldErrors.currency}
                        </p>
                      )}
                      <p className="auth-field-help">
                        Transactions are recorded in GBP. Other currencies are
                        display conversions, not changes to the stored amounts.
                      </p>
                    </div>
                  </>
                )}

                <div className="field">
                  <label htmlFor="email">Email address</label>

                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setAuthFieldErrors((old) => ({ ...old, email: "" }));
                    }}
                    aria-invalid={Boolean(authFieldErrors.email)}
                    aria-describedby={
                      authFieldErrors.email ? "email-error" : undefined
                    }
                    required
                  />
                  {authFieldErrors.email && (
                    <p
                      id="email-error"
                      className="auth-field-error"
                      role="alert"
                    >
                      {authFieldErrors.email}
                    </p>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="password">Password</label>

                  <div className="auth-password-input-wrap">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        mode === "register"
                          ? "new-password"
                          : "current-password"
                      }
                      placeholder={
                        mode === "register"
                          ? "Create a secure password"
                          : "Enter your password"
                      }
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setAuthFieldErrors((old) => ({ ...old, password: "" }));
                      }}
                      aria-invalid={Boolean(authFieldErrors.password)}
                      aria-describedby={
                        mode === "register"
                          ? authFieldErrors.password
                            ? "password-help password-error"
                            : "password-help"
                          : authFieldErrors.password
                            ? "password-error"
                            : undefined
                      }
                      required
                    />
                    <button
                      type="button"
                      className="auth-password-visibility"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  {mode === "register" && (
                    <p id="password-help" className="auth-field-help">
                      Required: 8 or more characters, at least one uppercase
                      letter and one symbol. Recommended: 12 or more characters.
                      Avoid common or reused passwords.
                    </p>
                  )}
                  {authFieldErrors.password && (
                    <p
                      id="password-error"
                      className="auth-field-error"
                      role="alert"
                    >
                      {authFieldErrors.password}
                    </p>
                  )}
                </div>

                {message && <p className="message">{message}</p>}

                <button
                  className="submit-button"
                  type="submit"
                  disabled={loading}
                >
                  {loading
                    ? "Please wait..."
                    : mode === "login"
                      ? "Log in"
                      : "Create account"}
                </button>
              </form>

              {mode === "login" && (
                <button
                  type="button"
                  className="dt-password-back"
                  onClick={() => switchMode("forgot")}
                >
                  Forgot password?
                </button>
              )}
              <p className="switch-text">
                {mode === "login"
                  ? "Don't have an account?"
                  : "Already have an account?"}

                <button
                  type="button"
                  onClick={() =>
                    switchMode(mode === "login" ? "register" : "login")
                  }
                >
                  {mode === "login" ? "Sign up" : "Log in"}
                </button>
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default App;