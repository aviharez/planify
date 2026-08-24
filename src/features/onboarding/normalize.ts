const legacyTimezone = ["Asia", "Jakarta"].join("/");

export function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function normalizeCourseName(name: string) {
  return name
    .trim()
    .toLocaleLowerCase("id-ID")
    .replace(/[.\-,/()]+/g, " ")
    .replace(/\s+/g, " ");
}

function withoutLegacyCourseFields(course: Record<string, unknown>) {
  const { code: _code, semester: _semester, status: _status, ...canonical } = course;
  return canonical;
}

function normalizeExtraction(value: Record<string, unknown>) {
  return {
    ...value,
    source: value.source === "demo" ? "manual" : value.source,
  };
}

function normalizeSnapshot(value: Record<string, unknown>) {
  const factors = Array.isArray(value.courseFactors)
    ? value.courseFactors.map((factor) => {
        if (!factor || typeof factor !== "object") return factor;
        const { code: _code, course_code: _courseCode, ...canonical } = factor as Record<string, unknown>;
        return canonical;
      })
    : value.courseFactors;
  return { ...value, courseFactors: factors };
}

function normalizePlan(value: Record<string, unknown>) {
  const { prioritySnapshot, sessions, ...rest } = value;
  const normalizedSessions = Array.isArray(sessions)
    ? sessions.map((session) => {
        if (!session || typeof session !== "object") return session;
        const { courseCode: _courseCode, course_code: _legacyCourseCode, ...canonical } = session as Record<string, unknown>;
        return canonical;
      })
    : sessions;
  return {
    ...rest,
    prioritySnapshot:
      prioritySnapshot && typeof prioritySnapshot === "object"
        ? normalizeSnapshot(prioritySnapshot as Record<string, unknown>)
        : prioritySnapshot,
    sessions: normalizedSessions,
  };
}

/** Converts old persisted payloads into the current, code-free shape before validation. */
export function normalizeOnboardingPayload(input: unknown, timeZone = localTimeZone()): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const courses = Array.isArray(value.courses)
    ? value.courses.map((course) =>
        course && typeof course === "object"
          ? withoutLegacyCourseFields(course as Record<string, unknown>)
          : course,
      )
    : value.courses;
  return {
    ...value,
    timezone: value.timezone === legacyTimezone || typeof value.timezone !== "string" || !value.timezone.trim()
      ? timeZone
      : value.timezone,
    courses,
    krsExtraction:
      value.krsExtraction && typeof value.krsExtraction === "object"
        ? normalizeExtraction(value.krsExtraction as Record<string, unknown>)
        : value.krsExtraction,
    planningSnapshot:
      value.planningSnapshot && typeof value.planningSnapshot === "object"
        ? normalizeSnapshot(value.planningSnapshot as Record<string, unknown>)
        : value.planningSnapshot,
    studyPlan:
      value.studyPlan && typeof value.studyPlan === "object"
        ? normalizePlan(value.studyPlan as Record<string, unknown>)
        : value.studyPlan,
  };
}
