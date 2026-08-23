import type {
  AcademicEvent,
  ActivityDensity,
  Course,
  FocusPeriod,
  PlanningSnapshot,
  StudyPlan,
  StudySession,
  TimeRange,
} from "@/features/onboarding/types";

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;

export const DEFAULT_SCHEDULING_POLICY = Object.freeze({
  capacityFactor: 0.65,
  densityFactors: {
    "Sangat Longgar": 0.8,
    "Cukup Longgar": 0.7,
    Seimbang: 0.6,
    Padat: 0.45,
    "Sangat Padat": 0.3,
  } satisfies Record<ActivityDensity, number>,
  procrastinationFactors: {
    Jarang: 1,
    "Kadang-kadang": 0.95,
    Sering: 0.9,
    "Sangat Sering": 0.8,
  },
  dailyMaximumMinutes: 180,
  maximumSessionDuration: 90,
  minimumBreakMinutes: 15,
  horizonDays: 28,
});

export type SchedulingPolicy = {
  capacityFactor: number;
  densityFactors: Record<ActivityDensity, number>;
  procrastinationFactors: Record<string, number>;
  dailyMaximumMinutes: number;
  maximumSessionDuration: number;
  minimumBreakMinutes: number;
  horizonDays: number;
};

export type SchedulingInput = {
  courses: Course[];
  availability: TimeRange[];
  classSchedules: Record<string, TimeRange[]>;
  focusPeriods: FocusPeriod[];
  focusDuration: number;
  activityDensity: ActivityDensity;
  procrastination?: string;
  academicEvents: AcademicEvent[];
  snapshot: PlanningSnapshot;
  today: string | Date;
  preservedSessions?: StudySession[];
  policy?: Partial<SchedulingPolicy>;
};

export type WeeklyCapacity = {
  availableMinutes: number;
  densityFactor: number;
  procrastinationFactor: number;
  capacityFactor: number;
  weeklyCapacityMinutes: number;
};

type Candidate = {
  date: string;
  day: string;
  startTime: string;
  endTime: string;
  duration: number;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function dateString(value: string | Date) {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function dateAtUtc(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function addDays(value: string, days: number) {
  const date = dateAtUtc(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function minutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return NaN;
  const result = Number(match[1]) * 60 + Number(match[2]);
  return result >= 0 && result <= 1439 ? result : NaN;
}

function timeString(value: number) {
  const hours = Math.floor(value / 60).toString().padStart(2, "0");
  const remainder = (value % 60).toString().padStart(2, "0");
  return `${hours}:${remainder}`;
}

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && startB < endA;
}

function dayForDate(date: string) {
  return DAY_NAMES[dateAtUtc(date).getUTCDay()];
}

function mergeAvailability(availability: TimeRange[]) {
  const merged: TimeRange[] = [];
  for (const day of new Set(availability.map((range) => range.day))) {
    const ranges = availability
      .filter((range) => range.day === day)
      .map((range) => ({ ...range, startMinutes: minutes(range.start), endMinutes: minutes(range.end) }))
      .filter((range) => Number.isFinite(range.startMinutes) && Number.isFinite(range.endMinutes) && range.startMinutes < range.endMinutes)
      .sort((a, b) => a.startMinutes - b.startMinutes);
    for (const range of ranges) {
      const previous = merged.at(-1);
      if (previous?.day === day && minutes(previous.end) >= range.startMinutes) {
        if (range.endMinutes > minutes(previous.end)) previous.end = timeString(range.endMinutes);
      } else {
        merged.push({ id: range.id, day, start: range.start, end: range.end });
      }
    }
  }
  return merged;
}

function resolvePolicy(policy: Partial<SchedulingPolicy> = {}): SchedulingPolicy {
  return {
    ...DEFAULT_SCHEDULING_POLICY,
    ...policy,
    densityFactors: { ...DEFAULT_SCHEDULING_POLICY.densityFactors, ...policy.densityFactors },
    procrastinationFactors: {
      ...DEFAULT_SCHEDULING_POLICY.procrastinationFactors,
      ...policy.procrastinationFactors,
    },
  };
}

export function calculateWeeklyCapacity(
  availability: TimeRange[],
  activityDensity: ActivityDensity,
  procrastination = "Kadang-kadang",
  policy: Partial<SchedulingPolicy> = {},
): WeeklyCapacity {
  const resolved = resolvePolicy(policy);
  const availableMinutes = mergeAvailability(availability).reduce(
    (total, range) => total + Math.max(0, minutes(range.end) - minutes(range.start)),
    0,
  );
  const densityFactor = clamp(resolved.densityFactors[activityDensity] ?? 0.6);
  const procrastinationFactor = clamp(resolved.procrastinationFactors[procrastination] ?? 0.9);
  const weeklyCapacityMinutes = Math.floor(
    availableMinutes * densityFactor * procrastinationFactor * resolved.capacityFactor,
  );
  return {
    availableMinutes,
    densityFactor,
    procrastinationFactor,
    capacityFactor: resolved.capacityFactor,
    weeklyCapacityMinutes,
  };
}

function periodAt(startTime: string): FocusPeriod {
  const hour = Math.floor(minutes(startTime) / 60);
  if (hour < 12) return "Pagi";
  if (hour < 15) return "Siang";
  if (hour < 18) return "Sore";
  return "Malam";
}

function sessionOverlaps(candidate: Candidate, session: StudySession) {
  return (
    candidate.date === session.date &&
    overlaps(minutes(candidate.startTime), minutes(candidate.endTime), minutes(session.startTime), minutes(session.endTime))
  );
}

function sessionTooClose(candidate: Candidate, session: StudySession, minimumBreak: number) {
  if (candidate.date !== session.date) return false;
  const candidateStart = minutes(candidate.startTime);
  const candidateEnd = minutes(candidate.endTime);
  const sessionStart = minutes(session.startTime);
  const sessionEnd = minutes(session.endTime);
  return candidateStart < sessionStart
    ? candidateEnd + minimumBreak > sessionStart
    : sessionEnd + minimumBreak > candidateStart;
}

function nearestDeadline(events: AcademicEvent[], courseId: string, date: string) {
  return events
    .filter((event) => event.courseId === courseId && event.date >= date)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}

function candidateScore(
  candidate: Candidate,
  course: PlanningSnapshot["courseFactors"][number],
  assigned: StudySession[],
  input: SchedulingInput,
) {
  let score = course.score;
  const sameDay = assigned.some((session) => session.courseId === course.courseId && session.date === candidate.date);
  if (sameDay) score -= 0.45;
  const lastSession = assigned
    .filter((session) => session.courseId === course.courseId)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (lastSession && lastSession.date === addDays(candidate.date, -1)) score -= 0.2;
  if (input.focusPeriods.includes(periodAt(candidate.startTime))) score += course.score * 0.12;
  const deadline = nearestDeadline(input.academicEvents, course.courseId, candidate.date);
  if (deadline) {
    const days = Math.round((dateAtUtc(deadline.date).getTime() - dateAtUtc(candidate.date).getTime()) / 86_400_000);
    if (days <= 7) score += deadline.importance / 20;
    else if (days <= 14) score += deadline.importance / 40;
  }
  return score;
}

function createCandidates(
  start: string,
  duration: number,
  availability: TimeRange[],
  classSchedules: Record<string, TimeRange[]>,
  preserved: StudySession[],
  minimumBreak: number,
  horizonDays: number,
) {
  const classes = Object.values(classSchedules).flat();
  const candidates: Candidate[] = [];
  const merged = mergeAvailability(availability);
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const date = addDays(start, offset);
    const day = dayForDate(date);
    for (const range of merged.filter((item) => item.day === day)) {
      let cursor = minutes(range.start);
      const end = minutes(range.end);
      while (cursor + duration <= end) {
        const candidate = {
          date,
          day,
          startTime: timeString(cursor),
          endTime: timeString(cursor + duration),
          duration,
        };
        const classConflict = classes.some(
          (fixed) => fixed.day === day && overlaps(cursor, cursor + duration, minutes(fixed.start), minutes(fixed.end)),
        );
        const historyConflict = preserved.some((session) => sessionOverlaps(candidate, session));
        const historySpacing = preserved.some((session) => sessionTooClose(candidate, session, minimumBreak));
        if (!classConflict && !historyConflict && !historySpacing) candidates.push(candidate);
        cursor += duration + minimumBreak;
      }
    }
  }
  return candidates;
}

export function generateStudyPlan(input: SchedulingInput): StudyPlan {
  const policy = resolvePolicy(input.policy);
  const start = dateString(input.today);
  const end = addDays(start, policy.horizonDays - 1);
  const sessionDuration = Math.min(
    policy.maximumSessionDuration,
    Math.max(15, Math.round(input.focusDuration / 5) * 5),
  );
  const capacity = calculateWeeklyCapacity(
    input.availability,
    input.activityDensity,
    input.procrastination,
    policy,
  );
  const preserved = [...(input.preservedSessions ?? [])];
  const candidates = createCandidates(
    start,
    sessionDuration,
    input.availability,
    input.classSchedules,
    preserved,
    policy.minimumBreakMinutes,
    policy.horizonDays,
  );
  const courses = input.snapshot.courseFactors.filter((factor) => input.courses.some((course) => course.id === factor.courseId));
  const totalScore = courses.reduce((sum, course) => sum + course.score, 0) || 1;
  const assigned: StudySession[] = [];
  const weeklyMinutes = new Map<number, number>();
  const dailyMinutes = new Map<string, number>();
  for (const session of preserved) {
    const offset = Math.floor((dateAtUtc(session.date).getTime() - dateAtUtc(start).getTime()) / 86_400_000);
    if (offset >= 0 && offset < policy.horizonDays) {
      dailyMinutes.set(session.date, (dailyMinutes.get(session.date) ?? 0) + session.duration);
      weeklyMinutes.set(Math.floor(offset / 7), (weeklyMinutes.get(Math.floor(offset / 7)) ?? 0) + session.duration);
    }
  }
  for (const candidate of candidates) {
    const offset = Math.floor((dateAtUtc(candidate.date).getTime() - dateAtUtc(start).getTime()) / 86_400_000);
    const week = Math.floor(offset / 7);
    const currentWeek = weeklyMinutes.get(week) ?? 0;
    if (currentWeek + candidate.duration > capacity.weeklyCapacityMinutes) continue;
    if ((dailyMinutes.get(candidate.date) ?? 0) + candidate.duration > policy.dailyMaximumMinutes) continue;
    if (assigned.some((session) => sessionTooClose(candidate, session, policy.minimumBreakMinutes))) continue;
    const ranked = courses
      .map((course) => {
        const target = capacity.weeklyCapacityMinutes * (course.score / totalScore);
        const used = assigned
          .filter((session) => session.courseId === course.courseId && Math.floor((dateAtUtc(session.date).getTime() - dateAtUtc(start).getTime()) / 86_400_000 / 7) === week)
          .reduce((sum, session) => sum + session.duration, 0);
        const remaining = Math.max(0, target - used);
        return { course, score: remaining / sessionDuration + candidateScore(candidate, course, [...preserved, ...assigned], input) };
      })
      .sort((a, b) => b.score - a.score || a.course.courseId.localeCompare(b.course.courseId));
    const selected = ranked[0]?.course;
    if (!selected) continue;
    const course = input.courses.find((item) => item.id === selected.courseId);
    if (!course) continue;
    const sessionKey = `session-${candidate.date}-${candidate.startTime.replace(":", "")}-${course.id}`;
    assigned.push({
      id: sessionKey,
      sessionKey,
      courseId: course.id,
      courseCode: course.code,
      courseName: course.name,
      date: candidate.date,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      duration: candidate.duration,
      status: "planned",
      prioritySnapshot: { ...selected.factors, score: selected.score },
    });
    dailyMinutes.set(candidate.date, (dailyMinutes.get(candidate.date) ?? 0) + candidate.duration);
    weeklyMinutes.set(week, currentWeek + candidate.duration);
  }
  const sessions = [...preserved, ...assigned].sort((a, b) =>
    `${a.date}T${a.startTime}|${a.id}`.localeCompare(`${b.date}T${b.startTime}|${b.id}`),
  );
  return {
    id: `plan-${start}-${end}`,
    generatedAt: typeof input.today === "string" ? `${start}T00:00:00.000Z` : input.today.toISOString(),
    planningPeriod: { start, end },
    weeklyCapacityMinutes: capacity.weeklyCapacityMinutes,
    capacityPolicy: {
      capacityFactor: capacity.capacityFactor,
      densityFactor: capacity.densityFactor,
      dailyMaximumMinutes: policy.dailyMaximumMinutes,
      maximumSessionDuration: policy.maximumSessionDuration,
      minimumBreakMinutes: policy.minimumBreakMinutes,
    },
    prioritySnapshot: input.snapshot,
    sessions,
  };
}

export function isSessionWithinPlan(session: StudySession, plan: Pick<StudyPlan, "planningPeriod">) {
  return session.date >= plan.planningPeriod.start && session.date <= plan.planningPeriod.end;
}
