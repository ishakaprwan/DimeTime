const db = require('../db');

const iso = date => date.toISOString().slice(0, 10);
const validISO = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());
const clean = (value, max = 100) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const normalDate = value => value instanceof Date ? iso(value) : String(value || '').slice(0, 10);

function summariseAcademicData(profile, plannerRows = [], currentDate = new Date()) {
  const data = profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {};
  const today = iso(currentDate);
  const horizon = new Date(`${today}T12:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 56);
  const end = iso(horizon);
  const termsByYear = data.termsByYear && typeof data.termsByYear === 'object' && !Array.isArray(data.termsByYear) ? data.termsByYear : {};
  const terms = [...Object.entries(termsByYear).flatMap(([year, values]) =>
    Array.isArray(values) ? values.map(t => ({ ...t, academicYear: year })) : []),
    ...(Array.isArray(data.terms) ? data.terms.map(t => ({ ...t, academicYear: String(data.academicYear || '') })) : [])];
  const uniqueTerms = Array.from(new Map(terms.filter(t => validISO(t.start) && validISO(t.end))
    .map(t => [`${t.start}:${t.end}:${clean(t.name)}`, t])).values());
  const active = uniqueTerms.filter(t => t.start <= today && today <= t.end)
    .sort((a, b) => b.start.localeCompare(a.start))[0];
  const upcomingTerms = uniqueTerms.filter(t => t.end >= today && t.start <= end)
    .sort((a,b) => a.start.localeCompare(b.start)).slice(0, 8)
    .map(t => ({ name: clean(t.name, 70), start: t.start, end: t.end, academicYear: t.academicYear }));
  const allUpcomingAssessments = (Array.isArray(data.assignments) ? data.assignments : [])
    .filter(a => a && validISO(a.due) && a.due >= today && a.due <= end && String(a.status || '').toLowerCase() !== 'completed')
    .sort((a,b) => a.due.localeCompare(b.due))
    .map(a => ({ title: clean(a.title), module: clean(a.module, 70), type: clean(a.type, 50), due: a.due,
      dueTime: clean(a.dueTime || a.due_time, 8), status: clean(a.status, 35) || 'Not started' }));
  const assessments = allUpcomingAssessments.slice(0, 45);
  const events = plannerRows.filter(e => e && validISO(normalDate(e.item_date)))
    .filter(e => normalDate(e.item_date) >= today && normalDate(e.item_date) <= end && !e.completed)
    .sort((a,b) => normalDate(a.item_date).localeCompare(normalDate(b.item_date)))
    .slice(0, 55).map(e => ({ title: clean(e.title), category: clean(e.item_type, 35), date: normalDate(e.item_date),
      startTime: String(e.start_time || '').slice(0,5) }));
  const calendarDeadlineDates = allUpcomingAssessments.map(a => a.due);
  const weekMs = 7 * 86400000;
  const anchor = new Date(`${today}T12:00:00Z`).getTime();
  const weeklyDeadlineCounts = Array.from({length:8}, (_,i) => {
    const start = new Date(anchor + i * weekMs);
    const finish = new Date(anchor + (i + 1) * weekMs - 86400000);
    return { start: iso(start), end: iso(finish), assessments: allUpcomingAssessments.filter(a => a.due >= iso(start) && a.due <= iso(finish)).length };
  });
  return {
    asOf: today, windowEnd: end, university: clean(data.university, 120), course: clean(data.course, 120),
    selectedAcademicYear: data.academicYear ?? null,
    currentTerm: active ? { name: clean(active.name,70), start: active.start, end: active.end } : null,
    configuredTerms: upcomingTerms,
    modules: (Array.isArray(data.modules) ? data.modules : []).map(m => clean(m,80)).filter(Boolean).slice(0, 40),
    upcomingAssessments: assessments,
    upcomingAssessmentCount: allUpcomingAssessments.length,
    calendarDeadlineDates,
    assessmentsListTruncated: allUpcomingAssessments.length > assessments.length,
    upcomingPlannerEvents: events,
    weeklyDeadlineCounts,
    limitations: [
      'Only recorded academic information is available. Missing deadlines or events may not have been entered.',
      'Planner recurring templates are not expanded into individual future occurrences in this snapshot.',
      'Only upcoming outstanding assessments and incomplete one-off Planner events are listed for the next 56 days.',
    ],
  };
}

async function academicSnapshot(userId) {
  const now = new Date();
  const start = iso(now);
  const endDate = new Date(`${start}T12:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 56);
  const end = iso(endDate);
  const [profile, planner] = await Promise.all([
    db.query('SELECT data FROM student_profiles WHERE user_id=$1', [userId]),
    db.query(`SELECT title, item_type, item_date, start_time, completed
              FROM planner_items WHERE user_id=$1 AND item_date BETWEEN $2 AND $3
              ORDER BY item_date ASC, start_time ASC NULLS LAST LIMIT 120`, [userId, start, end]),
  ]);
  return summariseAcademicData(profile.rows[0]?.data, planner.rows, now);
}

module.exports = { academicSnapshot, summariseAcademicData };
