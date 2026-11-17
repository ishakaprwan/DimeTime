import { readStudentData, termForDate } from "./Academics";
import { useCallback, useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

// categories for planner events
const TYPES = [
  { value: "university", label: "University", icon: "🎓" },
  { value: "work", label: "Work", icon: "💼" },
  { value: "personal", label: "Personal", icon: "●" },
  { value: "money", label: "Money", icon: "£" },
];

// options for repeating events
const REPEATS = [
  { value: "none", label: "Does not repeat" },
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function todayString() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function normaliseDate(value) {
  return typeof value === "string" ? value.split("T")[0] : "";
}

// format dates for display in the UK format
function formatDate(value) {
  const dateString = normaliseDate(value);
  if (!dateString) return "";
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value) {
  if (!value) return "";
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function typeInfo(value) {
  return TYPES.find((item) => item.value === value) || TYPES[2];
}

function repeatLabel(value) {
  return REPEATS.find((item) => item.value === value)?.label || value;
}

function toDateString(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function getMonthRange(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  return {
    from: toDateString(first),
    to: toDateString(last),
  };
}

function monthTitle(date) {
  return date.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

// build the month's calendar, starting each week on monday
function buildCalendarDays(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const mondayOffset = (first.getDay() + 6) % 7;
  const days = [];

  for (let index = 0; index < mondayOffset; index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= last.getDate(); day += 1) {
    days.push(new Date(year, month, day));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

// only check conflicts when both events have start + end times
// back to back events are fine, they dont count as overlapping
function eventMinutes(value) {
  if (!value || !/^\d{2}:\d{2}/.test(value)) return null;
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

// check if two events overlap based on their start + end times
function overlappingInterval(a, b) {
  const aStart = eventMinutes(a.start_time);
  const aEnd = eventMinutes(a.end_time);
  const bStart = eventMinutes(b.start_time);
  const bEnd = eventMinutes(b.end_time);
  if ([aStart, aEnd, bStart, bEnd].some((value) => value === null)) return null;
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return start < end ? { start, end } : null;
}

function intervalLabel(interval) {
  const fmt = (minutes) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${fmt(interval.start)}–${fmt(interval.end)}`;
}

// find any scheduling conflicts between events on the same day
function conflictDetails(events) {
  const found = [];
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      const interval = overlappingInterval(events[i], events[j]);
      if (interval) found.push({ a: events[i], b: events[j], interval });
    }
  }
  return found;
}

function eventIdentity(item) {
  return item.recurring ? `series:${item.recurring_id}` : `single:${item.id}`;
}

function candidateDates(start, frequency, until, maxDays = 90) {
  const result = [];
  const first = new Date(`${start}T12:00:00`);
  if (Number.isNaN(first.getTime())) return result;
  const horizon = new Date(first);
  horizon.setDate(horizon.getDate() + maxDays);
  const stop =
    until && until < toDateString(horizon) ? until : toDateString(horizon);
  const firstDay = first.getDate();
  for (let n = 0; n <= maxDays; n += 1) {
    const date = new Date(first);
    date.setDate(date.getDate() + n);
    const dateKey = toDateString(date);
    if (dateKey > stop) break;
    let matches = frequency === "none" ? n === 0 : false;
    if (frequency === "weekly") matches = n % 7 === 0;
    if (frequency === "fortnightly") matches = n % 14 === 0;
    if (frequency === "monthly") matches = date.getDate() === firstDay;
    if (frequency === "yearly")
      matches =
        date.getDate() === firstDay && date.getMonth() === first.getMonth();
    if (matches) result.push(dateKey);
  }
  return result;
}

// main planner page for events, deadlines + recurring schedules
export default function Planner({ user, onBack }) {
  const [studentTerms, setStudentTerms] = useState(() =>
    user ? readStudentData(user.id) : null,
  );
  // keep academic term dates updated when student settings change
  useEffect(() => {
    if (!user) return;
    const refresh = () => setStudentTerms(readStudentData(user.id));
    refresh();
    window.addEventListener("dimetime-student-updated", refresh);
    return () =>
      window.removeEventListener("dimetime-student-updated", refresh);
  }, [user]);

  const [items, setItems] = useState([]);
  const [recurringDefinitions, setRecurringDefinitions] = useState([]);
  const [calendarItems, setCalendarItems] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [viewMode, setViewMode] = useState("schedule");
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [itemType, setItemType] = useState("university");
  const [itemDate, setItemDate] = useState(todayString());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [frequency, setFrequency] = useState("none");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [scheduleMonth, setScheduleMonth] = useState(() =>
    todayString().slice(0, 7),
  );
  const [scheduleType, setScheduleType] = useState("all");
  const [editing, setEditing] = useState(null);
  const [showRecurringManager, setShowRecurringManager] = useState(false);

  const token = localStorage.getItem("token");

  // fetch saved planner items + recurring event rules
  const loadPlanner = useCallback(async () => {
    try {
      setLoading(true);

      const headers = {
        Authorization: `Bearer ${token}`,
      };

      // fetch the selected month / a 2-year window for "ALL months"
      const now = new Date();
      const chosen =
        scheduleMonth === "all"
          ? new Date(now.getFullYear(), now.getMonth() - 12, 1)
          : new Date(`${scheduleMonth}-01T12:00:00`);
      const end =
        scheduleMonth === "all"
          ? new Date(now.getFullYear(), now.getMonth() + 13, 0)
          : new Date(chosen.getFullYear(), chosen.getMonth() + 1, 0);
      const from = toDateString(chosen);
      const to = toDateString(end);

      const [occurrencesResponse, recurringResponse] = await Promise.all([
        fetch(`${API_URL}/planner/occurrences?from=${from}&to=${to}`, {
          headers,
        }),

        fetch(`${API_URL}/planner/recurring`, { headers }),
      ]);

      if (
        occurrencesResponse.status === 401 ||
        recurringResponse.status === 401
      ) {
        setMessage("Your session has expired. Please log in again.");
        return;
      }

      const occurrencesData = await occurrencesResponse.json();

      const recurringData = await recurringResponse.json();

      if (!occurrencesResponse.ok) {
        setMessage(occurrencesData.error || "Could not load your planner.");
        return;
      }

      if (!recurringResponse.ok) {
        setMessage(recurringData.error || "Could not load recurring events.");
        return;
      }

      setItems(Array.isArray(occurrencesData) ? occurrencesData : []);

      setRecurringDefinitions(
        Array.isArray(recurringData) ? recurringData : [],
      );
    } catch (error) {
      console.error("Could not load planner:", error);

      setMessage("Could not connect to the DimeTime API.");
    } finally {
      setLoading(false);
    }
  }, [token, scheduleMonth]);

  // fetch events for the selected calendar month
  const loadCalendar = useCallback(
    async (month = calendarMonth) => {
      try {
        setCalendarLoading(true);

        const { from, to } = getMonthRange(month);

        const response = await fetch(
          `${API_URL}/planner/occurrences?from=${from}&to=${to}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const data = await response.json();

        if (!response.ok) {
          setMessage(data.error || "Could not load this month.");
          return;
        }

        setCalendarItems(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Could not load calendar:", error);

        setMessage("Could not connect to the DimeTime API.");
      } finally {
        setCalendarLoading(false);
      }
    },
    [calendarMonth, token],
  );

  useEffect(() => {
    Promise.resolve().then(() => loadPlanner());
  }, [loadPlanner]);

  useEffect(() => {
    if (viewMode === "calendar") {
      Promise.resolve().then(() => loadCalendar(calendarMonth));
    }
  }, [viewMode, calendarMonth, loadCalendar]);

  // clear the form + reset it for a new event
  function resetForm() {
    setTitle("");
    setItemType("university");
    setItemDate(todayString());
    setStartTime("");
    setEndTime("");
    setNotes("");
    setFrequency("none");
    setRepeatUntil("");
    setEditing(null);
  }

  // load an existing event into the form for editing
  function startEditSingle(item) {
    setEditing({
      kind: "single",
      id: item.id,
    });

    setTitle(item.title || "");
    setItemType(item.item_type || "university");
    setItemDate(normaliseDate(item.item_date) || todayString());
    setStartTime(item.start_time ? item.start_time.slice(0, 5) : "");
    setEndTime(item.end_time ? item.end_time.slice(0, 5) : "");
    setNotes(item.notes || "");
    setFrequency("none");
    setRepeatUntil("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // fill the form with the recurring series details
  function startEditSeries(item) {
    const definition =
      recurringDefinitions.find(
        (definitionItem) =>
          definitionItem.id === (item.recurring_id || item.id),
      ) || item;

    setEditing({
      kind: "recurring",
      id: item.recurring_id || item.id,
    });

    setTitle(definition.title || "");
    setItemType(definition.item_type || "university");
    setItemDate(
      normaliseDate(definition.start_date || definition.item_date) ||
        todayString(),
    );
    setStartTime(
      definition.start_time ? definition.start_time.slice(0, 5) : "",
    );
    setEndTime(definition.end_time ? definition.end_time.slice(0, 5) : "");
    setNotes(definition.notes || "");
    setFrequency(definition.frequency || "weekly");
    setRepeatUntil(normaliseDate(definition.repeat_until));

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function cancelEdit() {
    resetForm();
    setMessage("");
  }

  // refresh both the planner list + calendar
  async function refreshAll() {
    await loadPlanner();

    if (viewMode === "calendar") {
      await loadCalendar(calendarMonth);
    }
  }

  // validate + save a new event / changes to an existing one
  async function saveItem(event) {
    event.preventDefault();
    setMessage("");

    if (!title.trim()) {
      setMessage("Give your planner item a name.");
      return;
    }

    if (endTime && !startTime) {
      setMessage("Add a start time before adding an end time.");
      return;
    }

    if (startTime && endTime && endTime <= startTime) {
      setMessage("End time must be after the start time.");
      return;
    }

    const recurring =
      editing?.kind === "recurring" || (!editing && frequency !== "none");

    if (recurring && repeatUntil && repeatUntil < itemDate) {
      setMessage("Repeat until cannot be before the first date.");
      return;
    }

    // warn about overlapping events before saving
    // still let the user continue if they want to, checking 90 days ahead for repeats
    if (startTime && endTime) {
      try {
        const endDate =
          candidateDates(
            itemDate,
            recurring ? frequency : "none",
            repeatUntil,
          ).at(-1) || itemDate;
        const response = await fetch(
          `${API_URL}/planner/occurrences?from=${itemDate}&to=${endDate}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!response.ok) throw new Error("Could not check existing events");
        const existing = await response.json();
        if (!Array.isArray(existing))
          throw new Error("Unexpected planner response");
        const candidateDays = candidateDates(
          itemDate,
          recurring ? frequency : "none",
          repeatUntil,
        );
        const originalId = editing
          ? `${editing.kind === "recurring" ? "series" : "single"}:${editing.id}`
          : "";
        const hits = [];
        for (const date of candidateDays) {
          for (const other of existing) {
            if (
              normaliseDate(other.item_date) !== date ||
              eventIdentity(other) === originalId
            )
              continue;
            const interval = overlappingInterval(
              { start_time: startTime, end_time: endTime },
              other,
            );
            if (interval)
              hits.push(
                `${formatDate(date)}: ${other.title} (${intervalLabel(interval)})`,
              );
          }
        }
        if (hits.length) {
          const examples = hits.slice(0, 3).join("\n");
          const agreed = window.confirm(
            `Scheduling conflict detected on ${hits.length} occurrence${hits.length === 1 ? "" : "s"}:\n${examples}${hits.length > 3 ? "\n…" : ""}\n\nSave anyway?`,
          );
          if (!agreed) {
            setMessage(
              "Save cancelled. Adjust the time or keep the overlap intentionally.",
            );
            return;
          }
        }
      } catch {
        setMessage(
          "Could not check scheduling conflicts. Check your connection and try again.",
        );
        return;
      }
    }

    try {
      setSaving(true);

      let endpoint;
      let method;

      if (editing?.kind === "single") {
        endpoint = `${API_URL}/planner/${editing.id}`;
        method = "PUT";
      } else if (editing?.kind === "recurring") {
        endpoint = `${API_URL}/planner/recurring/${editing.id}`;
        method = "PUT";
      } else {
        endpoint = recurring
          ? `${API_URL}/planner/recurring`
          : `${API_URL}/planner`;
        method = "POST";
      }

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",

          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          recurring
            ? {
                title: title.trim(),
                item_type: itemType,
                start_date: itemDate,
                start_time: startTime || null,
                end_time: endTime || null,
                notes: notes.trim(),
                frequency,
                repeat_until: repeatUntil || null,
              }
            : {
                title: title.trim(),
                item_type: itemType,
                item_date: itemDate,
                start_time: startTime || null,
                end_time: endTime || null,
                notes: notes.trim(),
              },
        ),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Could not save planner item.");
        return;
      }

      const wasEditing = Boolean(editing);

      resetForm();

      setMessage(
        wasEditing
          ? "Planner item updated."
          : recurring
            ? "Recurring event added."
            : "Added to your planner.",
      );

      await refreshAll();
    } catch (error) {
      console.error("Could not save planner item:", error);

      setMessage("Could not connect to the DimeTime API.");
    } finally {
      setSaving(false);
    }
  }

  // mark an event as completed / undo it
  async function toggleCompleted(item) {
    if (item.recurring) return;

    try {
      const response = await fetch(`${API_URL}/planner/${item.id}/completed`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",

          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify({
          completed: !item.completed,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Could not update planner item.");
        return;
      }

      await refreshAll();
    } catch (error) {
      console.error(error);

      setMessage("Could not connect to the DimeTime API.");
    }
  }

  // delete a single planner item
  async function deleteSingle(item) {
    if (!window.confirm(`Delete "${item.title}"?`)) {
      return;
    }

    const response = await fetch(`${API_URL}/planner/${item.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const data = await response.json();

      setMessage(data.error || "Could not delete planner item.");

      return;
    }

    await refreshAll();
  }

  // remove one occurrence without deleting the whole series
  async function deleteOccurrence(item) {
    if (
      !window.confirm(
        `Delete only this "${item.title}" event on ${formatDate(
          item.item_date,
        )}? The rest of the series will stay.`,
      )
    ) {
      return;
    }

    const response = await fetch(
      `${API_URL}/planner/recurring/${item.recurring_id}/exceptions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",

          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify({
          occurrence_date: normaliseDate(item.item_date),
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "Could not delete this occurrence.");

      return;
    }

    setMessage(
      "That occurrence was removed. The rest of the series is unchanged.",
    );

    await refreshAll();
  }

  // delete the entire recurring series
  async function deleteSeries(item) {
    const recurringId = item.recurring_id || item.id;

    if (
      !window.confirm(
        `Delete the entire "${item.title}" series? All of its recurring events will disappear.`,
      )
    ) {
      return;
    }

    const response = await fetch(
      `${API_URL}/planner/recurring/${recurringId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      const data = await response.json();

      setMessage(data.error || "Could not delete recurring series.");

      return;
    }

    setMessage("Recurring series deleted.");

    await refreshAll();
  }

  // stop / restart a recurring event series
  async function toggleRecurring(item) {
    const response = await fetch(
      `${API_URL}/planner/recurring/${item.id}/active`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",

          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify({
          active: !item.active,
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "Could not update recurring event.");

      return;
    }

    await refreshAll();
  }

  // filter completed events depending on the selected setting
  const visibleItems = useMemo(
    () => items.filter((item) => showCompleted || !item.completed),
    [items, showCompleted],
  );

  // filter the schedule by month + type
  const scheduleYear =
    scheduleMonth === "all" ? "all" : scheduleMonth.slice(0, 4);
  const scheduleYearCentre =
    scheduleMonth === "all" ? new Date().getFullYear() : Number(scheduleYear);
  const scheduleYears = Array.from(
    { length: 41 },
    (_, index) => scheduleYearCentre - 20 + index,
  );
  const availableScheduleMonths = Array.from(
    { length: 12 },
    (_, index) => `${scheduleYear}-${String(index + 1).padStart(2, "0")}`,
  );
  const calendarYears = Array.from(
    { length: 41 },
    (_, index) => calendarMonth.getFullYear() - 20 + index,
  );

  function changeScheduleYear(year) {
    if (year === "all") {
      setScheduleMonth("all");
      return;
    }
    const sameMonth =
      scheduleMonth === "all"
        ? todayString().slice(5, 7)
        : scheduleMonth.slice(5, 7);
    setScheduleMonth(`${year}-${sameMonth}`);
  }

  function changeCalendarMonth(monthIndex) {
    const date = new Date(calendarMonth.getFullYear(), Number(monthIndex), 1);
    setCalendarMonth(date);
    setSelectedDate(toDateString(date));
  }

  function changeCalendarYear(year) {
    const date = new Date(Number(year), calendarMonth.getMonth(), 1);
    setCalendarMonth(date);
    setSelectedDate(toDateString(date));
  }

  const scheduleItems = useMemo(
    () =>
      visibleItems.filter((item) => {
        const date = normaliseDate(item.item_date);
        return (
          (scheduleMonth === "all" || date.startsWith(scheduleMonth)) &&
          (scheduleType === "all" || item.item_type === scheduleType)
        );
      }),
    [visibleItems, scheduleMonth, scheduleType],
  );

  // separate upcoming events from past ones
  const upcomingItems = useMemo(() => {
    const today = todayString();

    return scheduleItems.filter(
      (item) => normaliseDate(item.item_date) >= today,
    );
  }, [scheduleItems]);

  const pastItems = useMemo(() => {
    const today = todayString();

    return scheduleItems.filter(
      (item) => normaliseDate(item.item_date) < today,
    );
  }, [scheduleItems]);

  const calendarDays = useMemo(
    () => buildCalendarDays(calendarMonth),
    [calendarMonth],
  );

  // group calendar events by date for easier lookup
  const eventsByDate = useMemo(() => {
    const grouped = {};

    calendarItems.forEach((item) => {
      const key = normaliseDate(item.item_date);

      if (!grouped[key]) {
        grouped[key] = [];
      }

      grouped[key].push(item);
    });

    return grouped;
  }, [calendarItems]);

  // check for overlapping events across the calendar
  const calendarConflicts = useMemo(() => {
    const result = {};

    for (const [date, events] of Object.entries(eventsByDate)) {
      const conflicts = conflictDetails(events);
      if (conflicts.length) result[date] = conflicts;
    }

    return result;
  }, [eventsByDate]);

  // match conflicts to individual events in the schedule
  const scheduleConflicts = useMemo(() => {
    const byDate = {};

    visibleItems.forEach((item) => {
      const date = normaliseDate(item.item_date);
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push(item);
    });

    const result = {};

    for (const [date, events] of Object.entries(byDate)) {
      for (const conflict of conflictDetails(events)) {
        for (const item of [conflict.a, conflict.b]) {
          const key = `${date}:${item.id}`;
          if (!result[key]) result[key] = [];
          result[key].push({
            other: item === conflict.a ? conflict.b.title : conflict.a.title,
            interval: conflict.interval,
          });
        }
      }
    }

    return result;
  }, [visibleItems]);

  const selectedEvents = eventsByDate[selectedDate] || [];

  // move between calendar months
  function moveMonth(amount) {
    setCalendarMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + amount, 1),
    );

    const next = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + amount,
      1,
    );

    setSelectedDate(toDateString(next));
  }

  function goToToday() {
    const now = new Date();

    setCalendarMonth(now);
    setSelectedDate(todayString());
  }

  // display an event card with its details + available actions
  function renderItem(item) {
    const type = typeInfo(item.item_type);

    return (
      <div
        className={`planner-item ${
          item.completed ? "planner-item-completed" : ""
        }`}
        key={item.id}
      >
        {item.recurring ? (
          <div className="planner-repeat-symbol" title="Recurring event">
            ↻
          </div>
        ) : (
          <button
            type="button"
            className={
              item.completed ? "planner-check completed" : "planner-check"
            }
            onClick={() => toggleCompleted(item)}
            aria-label={
              item.completed ? "Mark as incomplete" : "Mark as complete"
            }
          >
            {item.completed ? "✓" : ""}
          </button>
        )}

        <div className="planner-item-content">
          <div className="planner-item-top">
            <div>
              <div className="planner-badges">
                <span className={`planner-type planner-type-${item.item_type}`}>
                  <span>{type.icon}</span>

                  {type.label}
                </span>

                {item.recurring && (
                  <span className="planner-recurring-badge">
                    ↻ {repeatLabel(item.frequency)}
                  </span>
                )}
              </div>

              <h3>{item.title}</h3>
            </div>

            {!item.recurring && (
              <div className="planner-card-actions">
                <button
                  type="button"
                  className="planner-edit"
                  onClick={() => startEditSingle(item)}
                >
                  Edit
                </button>

                <button
                  type="button"
                  className="planner-delete"
                  onClick={() => deleteSingle(item)}
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          <div className="planner-item-details">
            <span>{formatDate(item.item_date)}</span>

            {item.start_time && (
              <span>
                {formatTime(item.start_time)}

                {item.end_time ? ` – ${formatTime(item.end_time)}` : ""}
              </span>
            )}
          </div>

          {(
            scheduleConflicts[`${normaliseDate(item.item_date)}:${item.id}`] ||
            []
          ).map((conflict, index) => (
            <p
              className="planner-conflict-notice"
              role="status"
              key={`${item.id}-conflict-${index}`}
            >
              ⚠ Scheduling conflict: overlaps with {conflict.other} at{" "}
              {intervalLabel(conflict.interval)}.
            </p>
          ))}

          {item.notes && <p className="planner-notes">{item.notes}</p>}

          {item.recurring && (
            <div className="planner-occurrence-actions">
              <button
                type="button"
                className="planner-edit"
                onClick={() => startEditSeries(item)}
              >
                Edit series
              </button>

              <button
                type="button"
                className="planner-delete-event"
                onClick={() => deleteOccurrence(item)}
              >
                Delete event
              </button>

              <button
                type="button"
                className="planner-delete-series"
                onClick={() => deleteSeries(item)}
              >
                Delete series
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // display an event in the selected day's calendar panel
  function renderCalendarEvent(item) {
    const type = typeInfo(item.item_type);

    return (
      <div className="calendar-selected-event" key={item.id}>
        <div>
          <div className="planner-badges">
            <span className={`planner-type planner-type-${item.item_type}`}>
              <span>{type.icon}</span>

              {type.label}
            </span>

            {item.recurring && (
              <span className="planner-recurring-badge">
                ↻ {repeatLabel(item.frequency)}
              </span>
            )}
          </div>

          <strong>{item.title}</strong>

          {(calendarConflicts[normaliseDate(item.item_date)] || [])
            .filter((pair) => pair.a.id === item.id || pair.b.id === item.id)
            .map((pair, index) => (
              <p
                className="planner-conflict-notice"
                role="status"
                key={`${item.id}-calendar-${index}`}
              >
                ⚠ Overlaps with{" "}
                {pair.a.id === item.id ? pair.b.title : pair.a.title} at{" "}
                {intervalLabel(pair.interval)}.
              </p>
            ))}

          <p>
            {item.start_time
              ? `${formatTime(item.start_time)}${
                  item.end_time ? ` – ${formatTime(item.end_time)}` : ""
                }`
              : "No time set"}
          </p>
        </div>

        <div className="calendar-selected-actions">
          {item.recurring ? (
            <>
              <button
                type="button"
                className="planner-edit"
                onClick={() => startEditSeries(item)}
              >
                Edit series
              </button>

              <button
                type="button"
                className="planner-delete-event"
                onClick={() => deleteOccurrence(item)}
              >
                Delete event
              </button>

              <button
                type="button"
                className="planner-delete-series"
                onClick={() => deleteSeries(item)}
              >
                Delete series
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="planner-edit"
                onClick={() => startEditSingle(item)}
              >
                Edit
              </button>

              <button
                type="button"
                className="planner-delete"
                onClick={() => deleteSingle(item)}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // main planner layout with the event form, schedule + calendar
  return (
    <div className="planner-page">
      <header className="planner-header">
        <div>
          <p className="dashboard-eyebrow">TIME</p>

          <h1>Planner</h1>

          <p>Keep your university, work and personal life in one place.</p>
        </div>

        <button type="button" className="back-button" onClick={onBack}>
          ← Dashboard
        </button>
      </header>

      <div className="planner-layout">
        {/* form for adding + editing planner events */}
        <section className="planner-form-card">
          <div className="planner-form-heading">
            <div>
              <h2>
                {editing
                  ? editing.kind === "recurring"
                    ? "Edit recurring series"
                    : "Edit planner item"
                  : "Add to planner"}
              </h2>

              <p className="planner-form-intro">
                {editing
                  ? "Update the details below, then save your changes."
                  : "Keep your deadlines, events and everyday plans organised in one place."}
              </p>
            </div>

            {editing && (
              <button
                type="button"
                className="planner-cancel-edit"
                onClick={cancelEdit}
              >
                Cancel edit
              </button>
            )}
          </div>

          <form onSubmit={saveItem}>
            <div className="field">
              <label htmlFor="planner-title">What is it?</label>

              <input
                id="planner-title"
                type="text"
                placeholder="eg. Lecture, Work shift, etc"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="planner-type">Type</label>

              <select
                id="planner-type"
                value={itemType}
                onChange={(event) => setItemType(event.target.value)}
              >
                {TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="planner-date">
                {frequency === "none" ? "Date" : "First date"}
              </label>

              <input
                id="planner-date"
                type="date"
                value={itemDate}
                onChange={(event) => setItemDate(event.target.value)}
                required
              />
            </div>

            <div className="planner-time-grid">
              <div className="field">
                <label htmlFor="planner-start">
                  Start time <span className="optional-label">(optional)</span>
                </label>

                <input
                  id="planner-start"
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="planner-end">
                  End time <span className="optional-label">(optional)</span>
                </label>

                <input
                  id="planner-end"
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="planner-repeat">Repeats</label>

              <select
                id="planner-repeat"
                value={frequency}
                disabled={editing?.kind === "single"}
                onChange={(event) => {
                  setFrequency(event.target.value);

                  if (event.target.value === "none") {
                    setRepeatUntil("");
                  }
                }}
              >
                {REPEATS.map((repeat) => (
                  <option
                    key={repeat.value}
                    value={repeat.value}
                    disabled={
                      editing?.kind === "recurring" && repeat.value === "none"
                    }
                  >
                    {repeat.label}
                  </option>
                ))}
              </select>

              {editing?.kind === "single" && (
                <span className="planner-field-help">
                  A one-off item stays one-off while editing.
                </span>
              )}

              {editing?.kind === "recurring" && (
                <span className="planner-field-help">
                  This changes the whole recurring series.
                </span>
              )}
            </div>

            {(frequency !== "none" || editing?.kind === "recurring") && (
              <div className="field">
                <label htmlFor="planner-repeat-until">
                  Repeat until{" "}
                  <span className="optional-label">(optional)</span>
                </label>

                <input
                  id="planner-repeat-until"
                  type="date"
                  min={itemDate}
                  value={repeatUntil}
                  onChange={(event) => setRepeatUntil(event.target.value)}
                />

                <span className="planner-field-help">
                  Leave blank if it should keep repeating.
                </span>
              </div>
            )}

            <div className="field">
              <label htmlFor="planner-notes">
                Notes <span className="optional-label">(optional)</span>
              </label>

              <textarea
                id="planner-notes"
                placeholder="Anything else you want to remember..."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows="4"
              />
            </div>

            {message && <p className="message">{message}</p>}

            <button className="submit-button" type="submit" disabled={saving}>
              {saving
                ? editing
                  ? "Saving..."
                  : "Adding..."
                : editing
                  ? "Save changes"
                  : frequency === "none"
                    ? "Add to planner"
                    : "Add recurring event"}
            </button>
          </form>
        </section>

        <div className="planner-right-column">
          {/* switch between schedule + calendar views */}
          <div className="planner-view-tabs">
            <button
              type="button"
              className={
                viewMode === "schedule"
                  ? "planner-view-tab active"
                  : "planner-view-tab"
              }
              onClick={() => setViewMode("schedule")}
            >
              Schedule
            </button>

            <button
              type="button"
              className={
                viewMode === "calendar"
                  ? "planner-view-tab active"
                  : "planner-view-tab"
              }
              onClick={() => setViewMode("calendar")}
            >
              Calendar
            </button>
          </div>

          {viewMode === "schedule" ? (
            <section className="planner-list-card">
              {/* upcoming + past events shown in the schedule */}
              <div className="planner-list-heading">
                <div>
                  <h2>Your schedule</h2>

                  <p>One-off and recurring events together.</p>
                </div>

                <div className="planner-schedule-filters">
                  <select
                    aria-label="Filter schedule by year"
                    value={scheduleYear}
                    onChange={(event) => changeScheduleYear(event.target.value)}
                  >
                    <option value="all">All months (2-year range)</option>
                    {scheduleYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter schedule by month"
                    value={scheduleMonth === "all" ? "all" : scheduleMonth}
                    disabled={scheduleMonth === "all"}
                    onChange={(event) => setScheduleMonth(event.target.value)}
                  >
                    {scheduleMonth === "all" && (
                      <option value="all">All months</option>
                    )}
                    {availableScheduleMonths.map((month) => (
                      <option key={month} value={month}>
                        {new Date(`${month}-01T12:00:00`).toLocaleDateString(
                          "en-GB",
                          {
                            month: "long",
                          },
                        )}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter schedule by type"
                    value={scheduleType}
                    onChange={(event) => setScheduleType(event.target.value)}
                  >
                    <option value="all">All types</option>
                    {TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <label className="planner-completed-toggle">
                    <input
                      type="checkbox"
                      checked={showCompleted}
                      onChange={(event) =>
                        setShowCompleted(event.target.checked)
                      }
                    />
                    Show completed
                  </label>
                </div>
              </div>

              {loading ? (
                <div className="planner-empty">
                  <p>Loading your planner...</p>
                </div>
              ) : upcomingItems.length === 0 && pastItems.length === 0 ? (
                <div className="planner-empty">
                  <div className="planner-empty-icon">✓</div>

                  <h3>
                    {items.length
                      ? "No events match these filters"
                      : "Nothing planned yet"}
                  </h3>

                  <p>
                    {items.length
                      ? "Try another month or type, or enable Show completed."
                      : "Add your first deadline, shift, birthday or recurring event using the form."}
                  </p>
                </div>
              ) : (
                <>
                  {upcomingItems.length > 0 && (
                    <div className="planner-section">
                      <h3 className="planner-section-title">Upcoming</h3>

                      <div className="planner-items">
                        {upcomingItems.map(renderItem)}
                      </div>
                    </div>
                  )}

                  {pastItems.length > 0 && (
                    <div className="planner-section">
                      <h3 className="planner-section-title">Past</h3>

                      <div className="planner-items">
                        {pastItems.map(renderItem)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          ) : (
            <section className="planner-calendar-card">
              {/* monthly calendar view */}
              <div className="calendar-toolbar">
                <div>
                  <h2>{monthTitle(calendarMonth)}</h2>

                  <p>Browse any month to see what you have coming up.</p>
                </div>

                <div className="calendar-controls">
                  <select
                    aria-label="Choose calendar month"
                    value={calendarMonth.getMonth()}
                    onChange={(event) =>
                      changeCalendarMonth(event.target.value)
                    }
                  >
                    {Array.from({ length: 12 }, (_, month) => (
                      <option key={month} value={month}>
                        {new Date(2020, month, 1).toLocaleDateString("en-GB", {
                          month: "long",
                        })}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Choose calendar year"
                    value={calendarMonth.getFullYear()}
                    onChange={(event) => changeCalendarYear(event.target.value)}
                  >
                    {calendarYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => moveMonth(-1)}
                    aria-label="Previous month"
                  >
                    ←
                  </button>

                  <button
                    type="button"
                    className="calendar-today-button"
                    onClick={goToToday}
                  >
                    Today
                  </button>

                  <button
                    type="button"
                    onClick={() => moveMonth(1)}
                    aria-label="Next month"
                  >
                    →
                  </button>
                </div>
              </div>

              <div className="calendar-weekdays">
                {WEEKDAYS.map((day) => (
                  <div key={day}>{day}</div>
                ))}
              </div>

              {calendarLoading ? (
                <div className="calendar-loading">Loading month...</div>
              ) : (
                <>
                  <div className="student-calendar-legend">
                    📚 Shaded dates fall within your configured academic terms.
                    Edit dates in Student settings.
                  </div>

                  <div className="calendar-grid">
                    {calendarDays.map((date, index) => {
                      if (!date) {
                        return (
                          <div
                            className="calendar-day calendar-day-empty"
                            key={`blank-${index}`}
                          />
                        );
                      }

                      const dateKey = toDateString(date);
                      const dayEvents = eventsByDate[dateKey] || [];
                      const isToday = dateKey === todayString();
                      const isSelected = dateKey === selectedDate;

                      return (
                        <button
                          type="button"
                          title={
                            termForDate(studentTerms, dateKey)?.name ||
                            undefined
                          }
                          className={`calendar-day ${termForDate(studentTerms, dateKey) ? "calendar-day-in-term" : ""} ${
                            isToday ? "calendar-day-today" : ""
                          } ${isSelected ? "calendar-day-selected" : ""}`}
                          key={dateKey}
                          onClick={() => setSelectedDate(dateKey)}
                        >
                          <span className="calendar-day-number">
                            {date.getDate()}
                            {calendarConflicts[dateKey]?.length > 0 && (
                              <span
                                className="calendar-conflict-marker"
                                aria-label="Scheduling conflict"
                                title="Scheduling conflict"
                              >
                                {" "}
                                ⚠
                              </span>
                            )}
                          </span>

                          <div className="calendar-day-events">
                            {dayEvents.slice(0, 2).map((item) => (
                              <span
                                className={`calendar-event-pill calendar-event-${item.item_type}`}
                                key={item.id}
                              >
                                {item.title}
                              </span>
                            ))}

                            {dayEvents.length > 2 && (
                              <span className="calendar-more">
                                +{dayEvents.length - 2} more
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* events + conflicts for the selected day */}
              <div className="calendar-selected-panel">
                <div className="calendar-selected-heading">
                  <div>
                    <h3>{formatDate(selectedDate)}</h3>

                    <p>
                      {selectedEvents.length === 0
                        ? "Nothing planned for this day."
                        : `${selectedEvents.length} event${
                            selectedEvents.length === 1 ? "" : "s"
                          }`}
                    </p>
                  </div>
                </div>

                {(calendarConflicts[selectedDate] || []).length > 0 && (
                  <div className="planner-conflict-summary" role="status">
                    <strong>⚠ Scheduling conflict</strong>
                    {(calendarConflicts[selectedDate] || []).map(
                      (pair, index) => (
                        <p key={`${selectedDate}-pair-${index}`}>
                          {pair.a.title} and {pair.b.title} overlap from{" "}
                          {intervalLabel(pair.interval)}.
                        </p>
                      ),
                    )}
                  </div>
                )}
                {selectedEvents.length > 0 && (
                  <div className="calendar-selected-list">
                    {selectedEvents.map(renderCalendarEvent)}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* manage repeating events + their rules */}
          <div className="planner-recurring-manager-wrap">
            <button
              type="button"
              className="planner-recurring-manager-toggle"
              onClick={() => setShowRecurringManager((current) => !current)}
              aria-expanded={showRecurringManager}
            >
              <span>Manage recurring events</span>

              <span className="planner-recurring-manager-meta">
                {recurringDefinitions.length}{" "}
                {recurringDefinitions.length === 1 ? "series" : "series"}
                {" · "}
                {showRecurringManager ? "Hide" : "Show"}
              </span>
            </button>

            {showRecurringManager && (
              <section className="planner-recurring-card">
                <div className="planner-list-heading">
                  <div>
                    <h2>Recurring events</h2>

                    <p>Manage the repeating rules behind your schedule.</p>
                  </div>
                </div>

                {recurringDefinitions.length === 0 ? (
                  <p className="planner-recurring-empty">
                    You haven't added any recurring events yet.
                  </p>
                ) : (
                  <div className="planner-recurring-list">
                    {recurringDefinitions.map((item) => {
                      const type = typeInfo(item.item_type);

                      return (
                        <div
                          className={`planner-recurring-row ${
                            item.active ? "" : "planner-recurring-inactive"
                          }`}
                          key={item.id}
                        >
                          <div>
                            <div className="planner-badges">
                              <span
                                className={`planner-type planner-type-${item.item_type}`}
                              >
                                <span>{type.icon}</span>

                                {type.label}
                              </span>

                              {!item.active && (
                                <span className="stopped-badge">Stopped</span>
                              )}
                            </div>

                            <strong>{item.title}</strong>

                            <p>
                              {repeatLabel(item.frequency)} from{" "}
                              {formatDate(item.start_date)}
                              {item.repeat_until
                                ? ` until ${formatDate(item.repeat_until)}`
                                : " · no end date"}
                            </p>
                          </div>

                          <div className="planner-recurring-actions">
                            <button
                              type="button"
                              className="planner-edit"
                              onClick={() => startEditSeries(item)}
                            >
                              Edit series
                            </button>

                            <button
                              type="button"
                              className="secondary-small"
                              onClick={() => toggleRecurring(item)}
                            >
                              {item.active ? "Stop" : "Restart"}
                            </button>

                            <button
                              type="button"
                              className="planner-delete-series"
                              onClick={() => deleteSeries(item)}
                            >
                              Delete series
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}