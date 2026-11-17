/* eslint-disable react-refresh/only-export-components -- academic helpers are shared with App.jsx */
import { localISODate, displayDate } from "../dateFormat";
import { useEffect, useState } from "react";
import {
  getStudentSnapshot,
  getStudentStatus,
  subscribeStudent,
  initialiseStudent,
  updateStudent,
} from "../studentStore";

// academic years start in august
const academicYearNow = () => {
  const now = new Date();
  return now.getFullYear() - (now.getMonth() < 7 ? 1 : 0);
};

const academicYearLabel = (year) => `${year}/${String(year + 1).slice(-2)}`;

export const defaultTerms = () => [
  { id: "autumn", name: "Michaelmas Term", start: "", end: "" },
  { id: "spring", name: "Lent Term", start: "", end: "" },
  { id: "summer", name: "Summer Term", start: "", end: "" },
];

const standardNames = ["Michaelmas Term", "Lent Term", "Summer Term"];

// fill missing fields + handle older term records
function normaliseStudentData(value = {}) {
  const year = Number.isInteger(Number(value.academicYear))
    ? Number(value.academicYear)
    : academicYearNow();
  const source = Array.isArray(value.terms)
    ? value.terms
    : value.termStart && value.termEnd
      ? [
          {
            id: "legacy",
            name: "Existing term",
            start: value.termStart,
            end: value.termEnd,
          },
          ...defaultTerms(),
        ]
      : defaultTerms();

  // keep custom term names
  const terms = source.map((term, index) => {
    const oldName = String(term.name || "")
      .trim()
      .toLowerCase();
    const legacyNames = [
      "existing term",
      "previous term",
      "autumn term",
      "spring term",
      "summer term",
    ];
    let name = term.name;
    if (legacyNames.includes(oldName)) {
      const startMonth = Number(String(term.start || "").slice(5, 7));
      const inferred =
        startMonth >= 8
          ? 0
          : startMonth >= 1 && startMonth <= 3
            ? 1
            : startMonth >= 4 && startMonth <= 7
              ? 2
              : -1;
      const byName = oldName.includes("autumn")
        ? 0
        : oldName.includes("spring")
          ? 1
          : oldName.includes("summer")
            ? 2
            : -1;
      name =
        standardNames[
          byName >= 0 ? byName : inferred >= 0 ? inferred : Math.min(index, 2)
        ];
    }
    return { ...term, name };
  });

  // remove the placeholder autumn term if a legacy term exists with the same name
  const cleaned = terms.filter(
    (t) =>
      !(
        t.id === "autumn" &&
        !t.start &&
        !t.end &&
        terms.some((x) => x.id === "legacy" && x.name === "Michaelmas Term")
      ),
  );
  return {
    university: "",
    course: "",
    modules: [],
    assignments: [],
    funding: [],
    ...value,
    academicYear: year,
    terms: cleaned,
    termsByYear: { ...(value.termsByYear || {}), [year]: cleaned },
  };
}

// switch to a different academic year, preserving existing records
function switchAcademicYear(d, nextYearValue) {
  const nextYear = Number(nextYearValue);
  const currentYear = Number(d.academicYear);
  if (!Number.isInteger(nextYear) || nextYear === currentYear) return d;
  const recordsByYear = {
    ...(d.academicRecordsByYear || {}),
    [currentYear]: {
      modules: [...(d.modules || [])],
      assignments: [...(d.assignments || [])],
    },
  };
  const nextRecords = recordsByYear[nextYear] || { modules: [], assignments: [] };
  const termsByYear = {
    ...(d.termsByYear || {}),
    [currentYear]: (Array.isArray(d.terms) ? d.terms : defaultTerms()).map(t => ({ ...t })),
  };
  const nextTerms = Array.isArray(termsByYear[nextYear])
    ? termsByYear[nextYear].map(t => ({ ...t }))
    : defaultTerms();
  return {
    ...d,
    academicYear: nextYear,
    modules: [...nextRecords.modules],
    assignments: [...nextRecords.assignments],
    academicRecordsByYear: recordsByYear,
    terms: nextTerms,
    termsByYear: { ...termsByYear, [nextYear]: nextTerms },
  };
}

// find the current term + calculate its remaining time
export function getCurrentTerm(data, date = localISODate()) {
  const selectedTerms = Array.isArray(data?.terms) ? data.terms : [];
  const savedYears =
    data?.termsByYear && typeof data.termsByYear === "object"
      ? Object.values(data.termsByYear).filter(Array.isArray).flat()
      : [];
  const terms = [...selectedTerms, ...savedYears].filter(
    (t) => t && t.start && t.end && t.start <= date && date <= t.end,
  );
  const term = terms.sort((a, b) => b.start.localeCompare(a.start))[0];
  if (!term) return null;

  const week =
    Math.floor(
      (new Date(`${date}T12:00:00`) - new Date(`${term.start}T12:00:00`)) /
        604800000,
    ) + 1;
  return {
    ...term,
    week,
    daysRemaining: Math.max(
      0,
      Math.ceil(
        (new Date(`${term.end}T12:00:00`) - new Date(`${date}T12:00:00`)) /
          86400000,
      ),
    ),
  };
}

export function termForDate(data, date) {
  return (data?.terms || []).find(
    (t) => t.start && t.end && t.start <= date && date <= t.end,
  );
}

const today = () => localISODate();
const daysUntil = (date) =>
  Math.ceil(
    (new Date(`${date}T12:00:00`) - new Date(new Date().toDateString())) /
      86400000,
  );

// assessment types
const ASSESSMENT_TYPES = [
  "Coursework",
  "Exam",
  "Presentation",
  "Practical / Lab",
  "Project",
  "Other",
];

const assessmentType = (value) =>
  ASSESSMENT_TYPES.includes(value) ? value : "Unspecified";
const dueTimeLabel = (value) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || "")) ? String(value) : "";

// countdown to the deadline
const assessmentCountdown = (assignment) => {
  const time = dueTimeLabel(assignment.dueTime || assignment.due_time);
  if (!time)
    return daysUntil(assignment.due) < 0
      ? "Past deadline"
      : `${daysUntil(assignment.due)} days left`;
  const remaining =
    new Date(`${assignment.due}T${time}:00`).getTime() - Date.now();
  if (remaining < 0) return "Past deadline";
  const hours = Math.floor(remaining / 3600000);
  const days = Math.floor(hours / 24);
  return days > 0
    ? `${days}d ${hours % 24}h left`
    : hours > 0
      ? `${hours}h left`
      : `${Math.max(1, Math.ceil(remaining / 60000))}m left`;
};

export function readStudentData(userId) {
  return normaliseStudentData(getStudentSnapshot(userId) || {});
}
export function saveStudentData(userId, data) {
  updateStudent(userId, data);
}

// keep student data in sync
function useStudentData(userId) {
  const [snapshot, setSnapshot] = useState(() => getStudentSnapshot(userId));
  const [state, setState] = useState(getStudentStatus);
  useEffect(() => {
    const refresh = () => {
      setSnapshot(getStudentSnapshot(userId));
      setState(getStudentStatus());
    };
    const unsub = subscribeStudent(refresh);
    initialiseStudent(userId).catch(() => {});
    refresh();
    return unsub;
  }, [userId]);

  return [
    snapshot ? normaliseStudentData(snapshot) : null,
    (value) => updateStudent(userId, value),
    state,
  ];
}

export default function Academics({ user, onBack }) {
  const [data, setData, sync] = useStudentData(user.id);
  const [moduleName, setModuleName] = useState("");
  const emptyAssessment = () => ({
    title: "",
    module: "",
    due: "",
    dueTime: "",
    type: "",
    status: "Not started",
  });
  const [form, setForm] = useState(emptyAssessment);
  const [editingAssessmentId, setEditingAssessmentId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [moduleFilter, setModuleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assessmentMonth, setAssessmentMonth] = useState("all");
  const [selectedModule, setSelectedModule] = useState("");

  if (!data)
    return (
      <div className="student-page">
        <h2>Loading academics</h2>
        <p>{sync.error || "Synchronising your academic information…"}</p>
        <button onClick={() => initialiseStudent(user.id).catch(() => {})}>
          Retry
        </button>
      </div>
    );

  // count assessments + module progress
  const assignments = [...data.assignments].sort((a, b) =>
    a.due.localeCompare(b.due),
  );
  const completedAssessments = assignments.filter(
    (a) => a.status === "Completed",
  ).length;
  const assessmentProgress = assignments.length
    ? Math.round((completedAssessments / assignments.length) * 100)
    : 0;

  const upcomingByModule = (() => {
    const now = new Date();
    const isUpcoming = (a) => {
      if (a.status === "Completed" || !a.due) return false;
      if (a.due > today()) return true;
      if (a.due < today()) return false;
      const dueTime = dueTimeLabel(a.dueTime || a.due_time);
      return !dueTime || new Date(`${a.due}T${dueTime}:00`) >= now;
    };
    return data.modules.map((name) => {
      const related = assignments.filter((a) => a.module === name);
      return {
        name,
        total: related.length,
        completed: related.filter((a) => a.status === "Completed").length,
        upcoming: related.filter(isUpcoming).length,
      };
    });
  })();

  function addModule(e) {
    e.preventDefault();
    const name = moduleName.trim();
    if (!name || data.modules.includes(name)) return;
    setData((d) => ({ ...d, modules: [...d.modules, name] }));
    setModuleName("");
  }

  function addAssignment(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.due) return;
    const updated = {
      ...form,
      title: form.title.trim(),
      type: assessmentType(form.type),
    };
    if (editingAssessmentId) {
      setData((d) => ({
        ...d,
        assignments: d.assignments.map((a) =>
          a.id === editingAssessmentId ? { ...a, ...updated } : a,
        ),
      }));
    } else {
      setData((d) => ({
        ...d,
        assignments: [
          ...d.assignments,
          { ...updated, id: crypto.randomUUID() },
        ],
      }));
    }

    setEditingAssessmentId(null);
    setForm(emptyAssessment());
    setDialog(null);
  }

  function editAssessment(assessment) {
    setEditingAssessmentId(assessment.id);
    setForm({
      title: assessment.title || "",
      module: assessment.module || "",
      due: assessment.due || "",
      dueTime: assessment.dueTime || assessment.due_time || "",
      type: assessmentType(assessment.type),
      status: assessment.status || "Not started",
    });
    setDialog("assessment");
  }

  function cancelAssessmentEdit() {
    setEditingAssessmentId(null);
    setForm(emptyAssessment());
    setDialog(null);
  }

  function updateAssignment(id, patch) {
    setData((d) => ({
      ...d,
      assignments: d.assignments.map((a) =>
        a.id === id ? { ...a, ...patch } : a,
      ),
    }));
  }

  // exclude completed + overdue assessments

  const isUpcoming = (a) =>
    a.status !== "Completed" &&
    Boolean(a.due) &&
    (a.due > today() ||
      (a.due === today() &&
        (!dueTimeLabel(a.dueTime || a.due_time) ||
          new Date(`${a.due}T${dueTimeLabel(a.dueTime || a.due_time)}:00`) >=
            new Date())));
  const upcoming = assignments.filter(isUpcoming);
  const nextAssessment = upcoming[0];

  // show only months that contain assessments, without changing saved records
  const assessmentMonths = [
    ...new Set(
      assignments
        .map((a) => String(a.due || "").slice(0, 7))
        .filter((month) => /^\d{4}-\d{2}$/.test(month)),
    ),
  ]
    .sort()
    .reverse();

  const filtered = assignments.filter(
    (a) =>
      (!moduleFilter || a.module === moduleFilter) &&
      (!statusFilter || a.status === statusFilter) &&
      (assessmentMonth === "all" ||
        String(a.due || "").startsWith(assessmentMonth)),
  );

  const activeYear = Number(data.academicYear) || academicYearNow();

  // switch to a different academic year while preserving existing records
  const changeAcademicYear = (value) => {
    setModuleFilter("");
    setStatusFilter("");
    setAssessmentMonth("all");
    setDialog(null);
    setData((d) => switchAcademicYear(d, value));
  };

  // keep assessments when removing a module
  const removeModule = (name) => {
    if (
      assignments.some((a) => a.module === name) &&
      !window.confirm(
        `Remove ${name}? Existing assessments will remain, but will no longer have a matching module.`,
      )
    )
      return;
    if (
      !assignments.some((a) => a.module === name) &&
      !window.confirm(`Remove ${name}?`)
    )
      return;
    setData((d) => ({ ...d, modules: d.modules.filter((x) => x !== name) }));
    if (selectedModule === name) setSelectedModule("");
    if (moduleFilter === name) setModuleFilter("");
  };

  const openAdd = () => {
    setEditingAssessmentId(null);
    setForm(emptyAssessment());
    setDialog("assessment");
  };

  return (
    <div className="student-page dt-academics">
      <header className="dt-academics-header">
        <div>
          <p className="dashboard-eyebrow">YOUR UNIVERSITY LIFE</p>
          <h1>Academics</h1>
          <p>Keep your modules, assessments and deadlines in one place.</p>
        </div>
        <div className="dt-academics-actions">
          <button type="button" className="dt-academics-back" onClick={onBack}>
            ← Dashboard
          </button>
          <div className="dt-academics-toolbar">
            <label className="dt-year-field">
              Academic year:{" "}
              <select
                aria-label="Academic year"
                value={activeYear}
                onChange={(e) => changeAcademicYear(e.target.value)}
              >
                {Array.from(
                  { length: 9 },
                  (_, i) => academicYearNow() - 4 + i,
                ).map((y) => (
                  <option key={y} value={y}>
                    {academicYearLabel(y)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="dt-action-primary" onClick={openAdd}>
              <span aria-hidden="true">＋</span> Add assessment
            </button>
          </div>
        </div>
      </header>
      <div className="dt-academics-overview">
        <section className="dt-academic-card dt-progress-card">
          <h2>
            <span aria-hidden="true" className="dt-card-symbol">
              ▥
            </span>{" "}
            Assessment progress
          </h2>
          <div className="dt-progress-number">{assessmentProgress}%</div>
          <p>
            {completedAssessments} of {assignments.length} completed
          </p>
          <div
            className="dt-progress-rail"
            role="progressbar"
            aria-label="Assessments completed"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={assessmentProgress}
          >
            <span style={{ width: `${assessmentProgress}%` }} />
          </div>
        </section>
        <section className="dt-academic-card dt-deadlines-card">
          <div className="dt-card-heading">
            <h2>
              <span aria-hidden="true" className="dt-card-symbol">
                ▣
              </span>{" "}
              Upcoming deadlines
            </h2>
            <button
              type="button"
              className="dt-text-link"
              onClick={() =>
                document
                  .getElementById("dt-assessment-tracker")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              View all <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className="dt-deadline-total">{upcoming.length}</div>
          <div className="dt-next-block">
            <p className="dt-next-label">Next up</p>
            {nextAssessment ? (
              <div className="dt-next-detail">
                <div className="dt-date-square">
                  <strong>{nextAssessment.due.slice(8, 10)}</strong>
                  <span>
                    {new Date(
                      `${nextAssessment.due}T12:00:00`,
                    ).toLocaleDateString("en-GB", { month: "short" })}
                  </span>
                </div>
                <div className="dt-next-copy">
                  <strong>{nextAssessment.title}</strong>
                  <small>
                    {nextAssessment.module || "General"} ·{" "}
                    {assessmentType(nextAssessment.type)}
                  </small>
                  <span>
                    ◷{" "}
                    {dueTimeLabel(
                      nextAssessment.dueTime || nextAssessment.due_time,
                    ) || "Time not set"}
                  </span>
                </div>
                <span className="dt-countdown">
                  {assessmentCountdown(nextAssessment)}
                </span>
              </div>
            ) : (
              <p className="dt-quiet">
                No upcoming deadlines. You're all caught up.
              </p>
            )}
          </div>
        </section>
        <section className="dt-academic-card dt-modules-card">
          <div className="dt-card-heading">
            <h2>
              <span aria-hidden="true" className="dt-card-symbol">
                ▤
              </span>{" "}
              Your modules
            </h2>
            <button
              type="button"
              className="dt-small-action"
              onClick={() => setDialog("module")}
            >
              ＋ Add module
            </button>
          </div>
          {data.modules.length ? (
            <div className="dt-module-list">
              {upcomingByModule.map((m) => (
                <button
                  type="button"
                  key={m.name}
                  className="dt-module-row"
                  onClick={() => {
                    setSelectedModule(m.name);
                    setDialog("moduleDetails");
                  }}
                >
                  <span aria-hidden="true">▣</span>
                  <span className="dt-module-title">{m.name}</span>
                  <span aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="dt-quiet">
              No modules yet. Add one to organise your assessments.
            </p>
          )}
        </section>
      </div>
      <section
        className="dt-academic-card dt-tracker"
        id="dt-assessment-tracker"
      >
        <div className="dt-tracker-head">
          <h2>Assessment tracker</h2>
          <div className="dt-tracker-filters">
            <select
              aria-label="Filter by module"
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
            >
              <option value="">All modules</option>
              {data.modules.map((m) => (
                <option value={m} key={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter assessments by month"
              value={assessmentMonth}
              onChange={(e) => setAssessmentMonth(e.target.value)}
            >
              <option value="all">All months</option>
              {assessmentMonths.map((month) => (
                <option key={month} value={month}>
                  {new Date(`${month}-01T12:00:00`).toLocaleDateString(
                    "en-GB",
                    {
                      month: "long",
                      year: "numeric",
                    },
                  )}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option>Not started</option>
              <option>In progress</option>
              <option>Completed</option>
            </select>
          </div>
        </div>
        {!assignments.length ? (
          <div className="dt-empty-state">
            <p>No assessments yet.</p>
            <button
              type="button"
              className="dt-action-primary"
              onClick={openAdd}
            >
              ＋ Add your first assessment
            </button>
          </div>
        ) : !filtered.length ? (
          <p className="dt-quiet dt-empty-state">
            No assessments match these filters.
          </p>
        ) : (
          <div className="dt-tracker-rows">
            {filtered.map((a) => (
              <div className="dt-tracker-row" key={a.id}>
                <button
                  type="button"
                  className={`dt-completion-toggle ${a.status === "Completed" ? "is-complete" : ""}`}
                  aria-label={`${a.status === "Completed" ? "Mark incomplete" : "Mark completed"}: ${a.title}`}
                  title={
                    a.status === "Completed"
                      ? "Mark not started"
                      : "Mark completed"
                  }
                  onClick={() =>
                    updateAssignment(a.id, {
                      status:
                        a.status === "Completed" ? "Not started" : "Completed",
                    })
                  }
                >
                  {a.status === "Completed" ? "✓" : ""}
                </button>
                <div className="dt-assessment-name">
                  <strong>{a.title}</strong>
                  <span>({assessmentType(a.type)})</span>
                  <small>{a.module || "General"}</small>
                </div>
                <div className="dt-assessment-date">
                  <span aria-hidden="true">▣</span>
                  <span>
                    {displayDate(a.due, "long")}
                    {dueTimeLabel(a.dueTime || a.due_time)
                      ? ` · ${dueTimeLabel(a.dueTime || a.due_time)}`
                      : ""}
                  </span>
                </div>
                <select
                  className={`dt-status-select dt-status-${(a.status || "Not started").toLowerCase().replaceAll(" ", "-")}`}
                  aria-label={`Status for ${a.title}`}
                  value={a.status || "Not started"}
                  onChange={(e) =>
                    updateAssignment(a.id, { status: e.target.value })
                  }
                >
                  <option>Not started</option>
                  <option>In progress</option>
                  <option>Completed</option>
                </select>
                <div className="dt-row-actions">
                  <button
                    type="button"
                    aria-label={`Edit ${a.title}`}
                    title="Edit assessment"
                    onClick={() => editAssessment(a)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${a.title}`}
                    title="Delete assessment"
                    onClick={() => {
                      if (window.confirm(`Delete ${a.title}?`)) {
                        setData((d) => ({
                          ...d,
                          assignments: d.assignments.filter(
                            (x) => x.id !== a.id,
                          ),
                        }));
                        if (editingAssessmentId === a.id)
                          cancelAssessmentEdit();
                      }
                    }}
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {dialog && (
        <div
          className="dt-dialog-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) cancelAssessmentEdit();
          }}
        >
          <section
            className="dt-academic-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dt-dialog-heading"
          >
            <div className="dt-dialog-head">
              <h2 id="dt-dialog-heading">
                {dialog === "assessment"
                  ? editingAssessmentId
                    ? "Edit assessment"
                    : "Add assessment"
                  : dialog === "module"
                    ? "Add module"
                    : selectedModule}
              </h2>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={cancelAssessmentEdit}
              >
                ×
              </button>
            </div>
            {dialog === "assessment" && (
              <form onSubmit={addAssignment} className="dt-dialog-form">
                <label>
                  Assessment name
                  <input
                    value={form.title}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, title: e.target.value }))
                    }
                    required
                    placeholder="e.g. Final report"
                  />
                </label>
                <label>
                  Module
                  <select
                    value={form.module}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, module: e.target.value }))
                    }
                  >
                    <option value="">No module</option>
                    {data.modules.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Assessment type
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, type: e.target.value }))
                    }
                  >
                    <option value="">Unspecified</option>
                    {ASSESSMENT_TYPES.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Deadline
                  <input
                    type="date"
                    value={form.due}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, due: e.target.value }))
                    }
                    required
                    min="2000-01-01"
                  />
                </label>
                <label>
                  Due time (optional)
                  <input
                    type="time"
                    value={form.dueTime}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, dueTime: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Status
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, status: e.target.value }))
                    }
                  >
                    <option>Not started</option>
                    <option>In progress</option>
                    <option>Completed</option>
                  </select>
                </label>
                <div className="dt-dialog-actions">
                  <button
                    type="button"
                    className="dt-button-outline"
                    onClick={cancelAssessmentEdit}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="dt-action-primary">
                    {editingAssessmentId ? "Save changes" : "Add assessment"}
                  </button>
                </div>
              </form>
            )}
            {dialog === "module" && (
              <form
                className="dt-dialog-form"
                onSubmit={(e) => {
                  addModule(e);
                  if (
                    moduleName.trim() &&
                    !data.modules.includes(moduleName.trim())
                  )
                    setDialog(null);
                }}
              >
                <label>
                  Module name
                  <input
                    autoFocus
                    value={moduleName}
                    required
                    onChange={(e) => setModuleName(e.target.value)}
                    placeholder="e.g. Artificial Intelligence"
                  />
                </label>
                <div className="dt-dialog-actions">
                  <button
                    type="button"
                    className="dt-button-outline"
                    onClick={() => setDialog(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="dt-action-primary">
                    Add module
                  </button>
                </div>
              </form>
            )}
            {dialog === "moduleDetails" && (
              <div className="dt-module-details">
                <p>
                  {
                    assignments.filter((a) => a.module === selectedModule)
                      .length
                  }{" "}
                  assessments ·{" "}
                  {
                    assignments.filter(
                      (a) =>
                        a.module === selectedModule && a.status === "Completed",
                    ).length
                  }{" "}
                  completed
                </p>
                <div className="dt-dialog-actions">
                  <button
                    type="button"
                    className="dt-button-outline"
                    onClick={() => {
                      setModuleFilter(selectedModule);
                      setDialog(null);
                      document
                        .getElementById("dt-assessment-tracker")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    View assessments
                  </button>
                  <button
                    type="button"
                    className="dt-danger-button"
                    onClick={() => {
                      removeModule(selectedModule);
                      setDialog(null);
                    }}
                  >
                    Remove module
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export function StudentSettings({ user, onBack }) {
  const [data, setData, sync] = useStudentData(user.id);
  const [termError, setTermError] = useState("");

  if (!data)
    return (
      <div className="student-page">
        <h2>Loading student settings</h2>
        <p>{sync.error || "Synchronising your settings…"}</p>
        <button onClick={() => initialiseStudent(user.id).catch(() => {})}>
          Retry
        </button>
      </div>
    );

  const change = (key, value) => setData((d) => ({ ...d, [key]: value }));

  const changeAcademicYear = (nextYear) => {
    setTermError("");
    setData((d) => switchAcademicYear(d, nextYear));
  };

  // save term edits for the selected academic year
  const changeTerm = (id, key, value) => {
    setTermError("");
    setData((d) => {
      const terms = (Array.isArray(d.terms) ? d.terms : defaultTerms()).map(
        (t) => (t.id === id ? { ...t, [key]: value } : t),
      );
      return {
        ...d,
        terms,
        termsByYear: { ...(d.termsByYear || {}), [d.academicYear]: terms },
      };
    });
  };

  const active = getCurrentTerm(data);

  return (
    <div className="student-page">
      <header className="student-page-head">
        <div>
          <p className="dashboard-eyebrow">PERSONALISE DIMETIME</p>
          <h1>Student settings</h1>
          <p>Configure your university and academic calendar.</p>
        </div>
        <button className="back-button" onClick={onBack}>
          ← Dashboard
        </button>
      </header>
      <section className="student-panel dt-appearance-settings">
        <h2>Appearance</h2>
        <p className="student-muted">
          Choose your preferred theme. Device setting follows your system
          appearance automatically. This preference syncs with your student
          account.
        </p>
        <div className="student-form">
          <label htmlFor="dt-appearance-theme">Colour theme</label>
          <select
            id="dt-appearance-theme"
            value={
              ["system", "light", "dark"].includes(data.appearanceTheme)
                ? data.appearanceTheme
                : "system"
            }
            onChange={(e) => change("appearanceTheme", e.target.value)}
          >
            <option value="system">Use device setting</option>
            <option value="light">Light mode</option>
            <option value="dark">Dark mode</option>
          </select>
        </div>
        <p className="student-muted" role="status" aria-live="polite">
          Current preference:{" "}
          {data.appearanceTheme === "dark"
            ? "Dark mode"
            : data.appearanceTheme === "light"
              ? "Light mode"
              : "Device setting"}
        </p>
      </section>
      <section className="student-panel">
        <h2>Currency</h2>
        <p className="student-muted">
          All existing transactions and budget limits are recorded in GBP.
          Choose a display currency to see converted values throughout DimeTime
          without changing the amounts stored in your account.
        </p>
        <div className="student-form">
          <label htmlFor="dt-display-currency">Display currency</label>
          <select
            id="dt-display-currency"
            value={
              [
                "GBP",
                "EUR",
                "USD",
                "INR",
                "CAD",
                "AUD",
                "NZD",
                "JPY",
                "CHF",
              ].includes(data.displayCurrency)
                ? data.displayCurrency
                : "GBP"
            }
            onChange={(e) => change("displayCurrency", e.target.value)}
          >
            <option value="GBP">British pound (GBP)</option>
            <option value="EUR">Euro (EUR)</option>
            <option value="USD">US dollar (USD)</option>
            <option value="INR">Indian rupee (INR)</option>
            <option value="CAD">Canadian dollar (CAD)</option>
            <option value="AUD">Australian dollar (AUD)</option>
            <option value="NZD">New Zealand dollar (NZD)</option>
            <option value="JPY">Japanese yen (JPY)</option>
            <option value="CHF">Swiss franc (CHF)</option>
          </select>
        </div>
        <p className="student-muted">
          Exchange rates update daily. Conversion is for display only;
          transaction and budget input amounts remain GBP. This is not a bank
          exchange rate.
        </p>
      </section>
      <section className="student-panel">
        <h2>Academic profile</h2>
        <div className="student-form">
          <label>
            University
            <input
              value={data.university}
              onChange={(e) => change("university", e.target.value)}
              placeholder="Your university"
            />
          </label>
          <label>
            Course
            <input
              value={data.course}
              onChange={(e) => change("course", e.target.value)}
              placeholder="Your degree"
            />
          </label>
        </div>
      </section>
      <section className="student-panel">
        <h2>Academic year & terms</h2>
        <p className="student-muted">
          Choose your academic year and enter your university’s actual term
          dates. Dates are never guessed or overwritten.
        </p>
        <div className="student-form">
          <label>
            Academic year
            <select
              value={data.academicYear}
              onChange={(e) => changeAcademicYear(Number(e.target.value))}
            >
              {Array.from(
                { length: 9 },
                (_, i) => academicYearNow() - 4 + i,
              ).map((y) => (
                <option key={y} value={y}>
                  {academicYearLabel(y)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="student-muted">
          Each academic year has its own term dates. A new year starts with
          blank Michaelmas, Lent and Summer dates; switching back restores
          previously entered dates.
        </p>
        {active && (
          <p className="student-term-status">
            📚 Currently in {active.name} · Week {active.week} ·{" "}
            {active.daysRemaining} days remaining
          </p>
        )}
        {!active && (
          <p className="student-muted">
            You are currently outside your configured terms, or no term dates
            have been entered yet.
          </p>
        )}
        <div className="student-term-list">
          {(Array.isArray(data.terms) ? data.terms : defaultTerms()).map(
            (t) => (
              <div className="student-term-card" key={t.id}>
                <div className="student-term-title">
                  <label>
                    Term name
                    <input
                      value={t.name}
                      onChange={(e) => changeTerm(t.id, "name", e.target.value)}
                      aria-label="Term name"
                    />
                  </label>
                  <button
                    type="button"
                    className="student-remove"
                    onClick={() =>
                      setData((d) => ({
                        ...d,
                        terms: (Array.isArray(d.terms)
                          ? d.terms
                          : defaultTerms()
                        ).filter((x) => x.id !== t.id),
                      }))
                    }
                  >
                    Remove
                  </button>
                </div>
                <div className="student-term-dates">
                  <label>
                    Start date (DD/MM/YYYY)
                    <input
                      type="date"
                      value={t.start}
                      aria-invalid={Boolean(
                        t.start && t.end && t.end < t.start,
                      )}
                      aria-describedby={
                        t.start && t.end && t.end < t.start
                          ? `term-date-error-${t.id}`
                          : undefined
                      }
                      onChange={(e) =>
                        changeTerm(t.id, "start", e.target.value)
                      }
                    />
                  </label>
                  <label>
                    End date (DD/MM/YYYY)
                    <input
                      type="date"
                      value={t.end}
                      min={t.start || undefined}
                      aria-invalid={Boolean(
                        t.start && t.end && t.end < t.start,
                      )}
                      aria-describedby={
                        t.start && t.end && t.end < t.start
                          ? `term-date-error-${t.id}`
                          : undefined
                      }
                      onChange={(e) => changeTerm(t.id, "end", e.target.value)}
                    />
                  </label>
                </div>
                {t.start && t.end && t.end < t.start && (
                  <p
                    id={`term-date-error-${t.id}`}
                    className="student-term-error"
                    role="alert"
                  >
                    End date must be after the start date.
                  </p>
                )}
              </div>
            ),
          )}
        </div>
        <button
          type="button"
          className="student-outline"
          onClick={() =>
            setData((d) => ({
              ...d,
              terms: [
                ...(Array.isArray(d.terms) ? d.terms : defaultTerms()),
                {
                  id: crypto.randomUUID(),
                  name:
                    standardNames.find(
                      (name) =>
                        !(
                          Array.isArray(d.terms) ? d.terms : defaultTerms()
                        ).some((t) => t.name === name),
                    ) ||
                    `Term ${(Array.isArray(d.terms) ? d.terms : defaultTerms()).length + 1}`,
                  start: "",
                  end: "",
                },
              ],
            }))
          }
        >
          + Add another term
        </button>
        {termError && (
          <p className="student-term-error" role="alert">
            {termError}
          </p>
        )}
        <p className="student-muted">
          Your dashboard shows your current term and week. The planner
          highlights days within terms, and Academics groups assessment
          deadlines by term. Changes save to your account when online.
        </p>
      </section>
    </div>
  );
}