import { z } from "zod";
import type { OnboardingData, StudyPlan, StudySession } from "@/features/onboarding/types";
import { buildPlanningSnapshot } from "./priority";
import { generateStudyPlan } from "./scheduling";

export const weeklyEvaluationSchema = z.object({
  perceivedLoad: z.number().int().min(1).max(5),
  realism: z.enum(["Ya", "Sebagian Besar", "Tidak"]),
  courseId: z.string().optional(),
});

export type WeeklyEvaluation = z.infer<typeof weeklyEvaluationSchema>;

export type AdaptationChange = {
  sessionKey: string;
  courseId: string;
  courseName: string;
  reason: string;
  sourceSessionId?: string;
};

export type AdaptationResult = {
  plan: StudyPlan;
  snapshot: StudyPlan["prioritySnapshot"];
  changes: AdaptationChange[];
  adaptationByCourse: Record<string, number>;
  remainingMinutes: Record<string, number>;
  noSlotCourseIds: string[];
};

type AdaptationInput = {
  data: Pick<
    OnboardingData,
    | "courses"
    | "evaluations"
    | "academicEvents"
    | "availability"
    | "classSchedules"
    | "focusPeriods"
    | "focusDuration"
    | "activityDensity"
    | "procrastination"
  >;
  plan: StudyPlan;
  today: string;
  evaluation?: WeeklyEvaluation;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function timeMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function overlaps(a: StudySession, b: StudySession) {
  return a.date === b.date && timeMinutes(a.startTime) < timeMinutes(b.endTime) && timeMinutes(b.startTime) < timeMinutes(a.endTime);
}

function tooClose(a: StudySession, b: StudySession, minimumBreak: number) {
  if (a.date !== b.date) return false;
  const aStart = timeMinutes(a.startTime);
  const aEnd = timeMinutes(a.endTime);
  const bStart = timeMinutes(b.startTime);
  const bEnd = timeMinutes(b.endTime);
  return aStart < bStart ? aEnd + minimumBreak > bStart : bEnd + minimumBreak > aStart;
}

function weekOffset(start: string, date: string) {
  return Math.floor((new Date(`${date}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime()) / 86_400_000 / 7);
}

export function calculateAdaptationSignals(
  plan: StudyPlan,
  courses: OnboardingData["courses"],
  today: string,
  evaluation?: WeeklyEvaluation,
) {
  const signals: Record<string, number> = {};
  for (const course of courses) {
    const sessions = plan.sessions.filter((session) => session.courseId === course.id && session.date <= today);
    const missed = sessions.filter((session) => session.status === "missed").length;
    const partial = sessions.filter((session) => session.status === "partial").length;
    const lowUnderstanding = sessions.filter((session) => (session.feedback?.understanding ?? 5) <= 2).length;
    const selected = evaluation?.courseId === course.id ? 0.1 : 0;
    signals[course.id] = clamp(Math.min(0.35, missed * 0.12 + partial * 0.07 + lowUnderstanding * 0.08 + selected));
  }
  return signals;
}

function remainingByCourse(plan: StudyPlan, today: string, evaluation?: WeeklyEvaluation) {
  const remaining: Record<string, number> = {};
  for (const session of plan.sessions) {
    if (session.date > today || (session.date === today && session.status === "planned")) continue;
    if (session.status === "missed") remaining[session.courseId] = (remaining[session.courseId] ?? 0) + session.duration;
    if (session.status === "partial") remaining[session.courseId] = (remaining[session.courseId] ?? 0) + Math.ceil(session.duration / 2);
  }
  if (evaluation?.courseId && !(evaluation.courseId in remaining)) remaining[evaluation.courseId] = 45;
  return remaining;
}

function sourceForCourse(plan: StudyPlan, courseId: string, today: string) {
  return plan.sessions.find(
    (session) => session.courseId === courseId && session.date <= today && (session.status === "missed" || session.status === "partial"),
  );
}

function sortSessions(sessions: StudySession[]) {
  return [...sessions].sort((a, b) => `${a.date}T${a.startTime}|${a.id}`.localeCompare(`${b.date}T${b.startTime}|${b.id}`));
}

export function adaptStudyPlan(input: AdaptationInput): AdaptationResult {
  const evaluation = input.evaluation ? weeklyEvaluationSchema.parse(input.evaluation) : undefined;
  const adaptationByCourse = calculateAdaptationSignals(input.plan, input.data.courses, input.today, evaluation);
  const snapshot = buildPlanningSnapshot(input.data, {
    today: input.today,
    reason: "adaptation",
    adaptationByCourse,
  });
  const remainingMinutes = remainingByCourse(input.plan, input.today, evaluation);
  const loadFactor = evaluation && (evaluation.perceivedLoad >= 4 || evaluation.realism === "Tidak")
    ? 0.8
    : evaluation?.perceivedLoad === 1 && evaluation.realism === "Ya"
      ? 1.05
      : 1;
  const historical = input.plan.sessions.filter((session) => session.date < input.today || session.status !== "planned");
  const futurePlanned = input.plan.sessions.filter((session) => session.date >= input.today && session.status === "planned");
  const fresh = generateStudyPlan({
    courses: input.data.courses,
    availability: input.data.availability,
    classSchedules: input.data.classSchedules,
    focusPeriods: input.data.focusPeriods,
    focusDuration: input.data.focusDuration,
    activityDensity: input.data.activityDensity,
    procrastination: input.data.procrastination,
    academicEvents: input.data.academicEvents,
    snapshot,
    today: input.today,
    preservedSessions: historical,
    policy: { capacityFactor: Math.min(0.75, freshCapacityFactor(input.plan) * loadFactor) },
  });
  const occupied = [...historical, ...futurePlanned];
  const additions: StudySession[] = [];
  const changes: AdaptationChange[] = [];
  const usedByCourse: Record<string, number> = {};
  const usedByDay: Record<string, number> = {};
  const usedByWeek: Record<number, number> = {};
  for (const session of occupied) {
    const offset = weekOffset(input.today, session.date);
    if (offset >= 0 && offset < 4) usedByWeek[offset] = (usedByWeek[offset] ?? 0) + session.duration;
    if (session.date >= input.today) usedByDay[session.date] = (usedByDay[session.date] ?? 0) + session.duration;
  }
  const existingKeys = new Set(futurePlanned.map((session) => session.sessionKey));
  const freshCandidates = fresh.sessions
    .filter((session) => session.status === "planned" && !existingKeys.has(session.sessionKey))
    .sort((a, b) => {
      const aPending = (remainingMinutes[a.courseId] ?? 0) > 0;
      const bPending = (remainingMinutes[b.courseId] ?? 0) > 0;
      return Number(bPending) - Number(aPending) || `${a.date}T${a.startTime}|${a.id}`.localeCompare(`${b.date}T${b.startTime}|${b.id}`);
    });
  for (const candidate of freshCandidates) {
    const needed = remainingMinutes[candidate.courseId] ?? 0;
    if (needed <= (usedByCourse[candidate.courseId] ?? 0)) continue;
    const offset = weekOffset(input.today, candidate.date);
    const withCandidate = [...occupied, ...additions, candidate];
    if (withCandidate.some((session, index) => index < withCandidate.length - 1 && (overlaps(candidate, session) || tooClose(candidate, session, input.plan.capacityPolicy.minimumBreakMinutes)))) continue;
    if ((usedByDay[candidate.date] ?? 0) + candidate.duration > input.plan.capacityPolicy.dailyMaximumMinutes) continue;
    if ((usedByWeek[offset] ?? 0) + candidate.duration > fresh.weeklyCapacityMinutes) continue;
    const source = sourceForCourse(input.plan, candidate.courseId, input.today);
    const reason = source
      ? source.status === "missed" ? "Mengganti sesi yang tidak sempat dijalankan." : "Menambah ruang untuk menyelesaikan sesi sebagian."
      : "Menambah ruang sesuai evaluasi mingguan.";
    const addition = {
      ...candidate,
      sourceSessionId: source?.id,
      changeReason: reason,
    };
    additions.push(addition);
    changes.push({ sessionKey: addition.sessionKey, courseId: addition.courseId, courseName: addition.courseName, reason, sourceSessionId: source?.id });
    usedByCourse[candidate.courseId] = (usedByCourse[candidate.courseId] ?? 0) + candidate.duration;
    usedByDay[candidate.date] = (usedByDay[candidate.date] ?? 0) + candidate.duration;
    usedByWeek[offset] = (usedByWeek[offset] ?? 0) + candidate.duration;
  }
  const noSlotCourseIds = Object.entries(remainingMinutes)
    .filter(([courseId, minutes]) => minutes > (usedByCourse[courseId] ?? 0))
    .map(([courseId]) => courseId)
    .sort();
  const reason = changes.length
    ? `Rencana diperbarui untuk menampung ${changes.length} sesi yang perlu mendapat ruang.`
    : noSlotCourseIds.length
      ? "Belum ada slot valid tambahan; beban belajar tetap dijaga agar tidak berlebihan."
      : "Rencana dipertahankan karena belum ada perubahan yang perlu dilakukan.";
  const plan: StudyPlan = {
    ...input.plan,
    id: `plan-${input.today}-${addDays(input.today, 27)}-adaptasi`,
    sourcePlanId: input.plan.remoteId ?? input.plan.id,
    adaptationReason: reason,
    changeSummary: changes,
    generatedAt: `${input.today}T00:00:00.000Z`,
    planningPeriod: { start: input.today, end: addDays(input.today, 27) },
    weeklyCapacityMinutes: fresh.weeklyCapacityMinutes,
    prioritySnapshot: snapshot,
    sessions: sortSessions([...historical, ...futurePlanned, ...additions]),
  };
  return { plan, snapshot, changes, adaptationByCourse, remainingMinutes, noSlotCourseIds };
}

function freshCapacityFactor(plan: StudyPlan) {
  return plan.capacityPolicy.capacityFactor || 0.65;
}
