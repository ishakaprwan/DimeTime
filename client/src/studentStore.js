const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

const listeners = new Set();

let activeUser = null;
let cached = null;
let ready = false;
let pending = Promise.resolve();
let generation = 0;
let status = "idle";
let error = "";

// remove old browser copies so another account cant accidentally use them
const clearLegacyStudentCopies = () => {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const name = localStorage.key(index);

    if (name && name.startsWith("dimetime-student-")) {
      localStorage.removeItem(name);
    }
  }
};

const emit = () => {
  window.dispatchEvent(new Event("dimetime-student-updated"));
  listeners.forEach((fn) => fn());
};

// give new profiles empty academic collections without changing other saved fields
const defaultTermList = () => [
  { id: "autumn", name: "Michaelmas Term", start: "", end: "" },
  { id: "spring", name: "Lent Term", start: "", end: "" },
  { id: "summer", name: "Summer Term", start: "", end: "" },
];

const defaultAcademicYear = () => {
  const date = new Date();

  return date.getFullYear() - (date.getMonth() < 7 ? 1 : 0);
};

const ensureStudentShape = (value) => {
  const data =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};

  const academicYear =
    Number.isInteger(Number(data.academicYear)) &&
    data.academicYear !== undefined &&
    data.academicYear !== null
      ? Number(data.academicYear)
      : defaultAcademicYear();

  const knownTerms = Array.isArray(data.terms) ? data.terms : null;

  const years =
    data.termsByYear &&
    typeof data.termsByYear === "object" &&
    !Array.isArray(data.termsByYear)
      ? data.termsByYear
      : {};

  const terms =
    knownTerms ||
    (Array.isArray(years[academicYear])
      ? years[academicYear]
      : defaultTermList());

  return {
    ...data,
    academicYear,
    university: typeof data.university === "string" ? data.university : "",
    course: typeof data.course === "string" ? data.course : "",
    modules: Array.isArray(data.modules) ? data.modules : [],
    assignments: Array.isArray(data.assignments) ? data.assignments : [],
    funding: Array.isArray(data.funding) ? data.funding : [],
    terms: terms.map((term) => ({ ...term })),
    termsByYear: { ...years },
  };
};

const token = () => localStorage.getItem("token");

const request = async (method, data, authToken = token()) => {
  const response = await fetch(`${BASE}/student`, {
    method,
    headers: {
      Authorization: `Bearer ${authToken}`,
      ...(method === "PUT" ? { "Content-Type": "application/json" } : {}),
    },
    ...(method === "PUT" ? { body: JSON.stringify({ data }) } : {}),
  });

  if (!response.ok) {
    throw new Error(
      (await response.json().catch(() => ({}))).error ||
        `Server error ${response.status}`,
    );
  }

  return response.json();
};

export const getStudentSnapshot = (id) =>
  activeUser === String(id) && ready ? cached : null;

export const getStudentStatus = () => ({ status, error });

export const subscribeStudent = (callback) => {
  listeners.add(callback);

  return () => listeners.delete(callback);
};

export async function initialiseStudent(id) {
  const who = String(id);

  if (activeUser === who && ready) {
    return cached;
  }

  const currentGeneration = ++generation;
  const authToken = token();

  activeUser = who;
  cached = null;
  ready = false;
  status = "loading";
  error = "";

  clearLegacyStudentCopies();
  emit();

  try {
    const remote = await request("GET", undefined, authToken);

    if (
      generation !== currentGeneration ||
      activeUser !== who ||
      token() !== authToken
    ) {
      return null;
    }

    // only load the profile from the server, never import old browser records
    cached = ensureStudentShape(remote.exists ? remote.data : null);
    ready = true;
    status = "ready";
    error = "";

    emit();

    return cached;
  } catch (e) {
    if (generation !== currentGeneration || activeUser !== who) {
      return null;
    }

    status = "error";
    error = `Could not load academic data: ${e.message}`;

    emit();

    throw e;
  }
}

export function updateStudent(id, updater) {
  const who = String(id);

  if (who !== activeUser || !ready) {
    return;
  }

  const next = ensureStudentShape(
    typeof updater === "function"
      ? updater(ensureStudentShape(cached))
      : updater,
  );

  const currentGeneration = generation;
  const authToken = token();

  cached = next;
  status = "saving";
  error = "";

  emit();

  pending = pending
    .catch(() => {})
    .then(async () => {
      // dont save changes from an old account after switching users
      if (
        generation !== currentGeneration ||
        activeUser !== who ||
        token() !== authToken
      ) {
        return;
      }

      await request("PUT", next, authToken);

      if (
        generation === currentGeneration &&
        activeUser === who &&
        cached === next
      ) {
        status = "ready";
        error = "";

        emit();
      }
    })
    .catch((e) => {
      if (generation === currentGeneration && activeUser === who) {
        status = "error";
        error = `Save failed: ${e.message}. Please try saving again before leaving this page.`;

        emit();
      }
    });
}

export function resetStudent() {
  generation += 1;
  activeUser = null;
  cached = null;
  ready = false;
  status = "idle";
  error = "";

  clearLegacyStudentCopies();
  emit();
}