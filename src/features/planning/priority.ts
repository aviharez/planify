import type {
  OnboardingData,
  PlanningSnapshot,
  PriorityFactors,
  PriorityWeights,
} from "@/features/onboarding/types";

export type PriorityPolicy = Readonly<PriorityWeights> & {
  academicLoadCap: number;
  urgencyHorizonDays: number;
};

export const DEFAULT_PRIORITY_POLICY: PriorityPolicy = Object.freeze({
  academicLoad: 0.2,
  knowledgeGap: 0.3,
  difficulty: 0.2,
  urgency: 0.25,
  adaptation: 0.05,
  academicLoadCap: 5,
  urgencyHorizonDays: 30,
});

export type PriorityEvent = {
  courseId?: string;
  date: string;
  importance: number;
};

export type PriorityCourseInput = {
  courseId?: string;
  code?: string;
  name?: string;
  credits: number;
  understanding?: number;
  difficulty?: number;
  adaptation?: number;
  events?: PriorityEvent[];
};

export type PriorityResult = {
  courseId?: string;
  code?: string;
  name?: string;
  factors: PriorityFactors;
  finalScore: number;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function asDateString(today: string | Date) {
  return typeof today === "string" ? today.slice(0, 10) : today.toISOString().slice(0, 10);
}

export function dateInTimeZone(now: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function daysBetween(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

export function validatePriorityPolicy(policy: PriorityPolicy | PriorityWeights = DEFAULT_PRIORITY_POLICY) {
  const total = policy.academicLoad + policy.knowledgeGap + policy.difficulty + policy.urgency + policy.adaptation;
  if (Math.abs(total - 1) > 1e-9) throw new Error("Bobot prioritas harus berjumlah 1.");
  if (Object.values(policy).some((value) => typeof value !== "number" || value < 0))
    throw new Error("Bobot prioritas tidak valid.");
  return true;
}

export function normalizeUrgency(
  events: PriorityEvent[] = [],
  today: string | Date,
  policy: PriorityPolicy = DEFAULT_PRIORITY_POLICY,
) {
  validatePriorityPolicy(policy);
  const todayString = asDateString(today);
  return clamp(
    events.reduce((highest, event) => {
      const days = daysBetween(todayString, event.date.slice(0, 10));
      if (days < 0) return highest;
      const proximity = clamp((policy.urgencyHorizonDays - days) / policy.urgencyHorizonDays);
      return Math.max(highest, clamp(event.importance / 5) * proximity);
    }, 0),
  );
}

export function calculatePriority(
  input: PriorityCourseInput,
  options: { today: string | Date; policy?: PriorityPolicy } = { today: new Date(0) },
): PriorityResult {
  const policy = options.policy ?? DEFAULT_PRIORITY_POLICY;
  validatePriorityPolicy(policy);
  const factors: PriorityFactors = {
    academicLoad: clamp(input.credits / policy.academicLoadCap),
    knowledgeGap: clamp((5 - (input.understanding ?? 5)) / 4),
    difficulty: clamp(((input.difficulty ?? 1) - 1) / 4),
    urgency: normalizeUrgency(input.events, options.today, policy),
    adaptation: clamp(input.adaptation ?? 0),
  };
  const finalScore =
    factors.academicLoad * policy.academicLoad +
    factors.knowledgeGap * policy.knowledgeGap +
    factors.difficulty * policy.difficulty +
    factors.urgency * policy.urgency +
    factors.adaptation * policy.adaptation;
  return { courseId: input.courseId, code: input.code, name: input.name, factors, finalScore };
}

export function rankPriorities(results: PriorityResult[]) {
  return results
    .map((result, index) => ({ result, index }))
    .sort((a, b) => {
      const difference = b.result.finalScore - a.result.finalScore;
      if (Math.abs(difference) > 1e-9) return difference;
      const aKey = `${a.result.code ?? ""}|${a.result.name ?? ""}|${a.result.courseId ?? ""}`;
      const bKey = `${b.result.code ?? ""}|${b.result.name ?? ""}|${b.result.courseId ?? ""}`;
      return (aKey < bKey ? -1 : aKey > bKey ? 1 : 0) || a.index - b.index;
    })
    .map(({ result }) => result);
}

function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function buildPlanningSnapshot(
  data: Pick<OnboardingData, "courses" | "evaluations" | "academicEvents" | "availability">,
  options: { today: string | Date; reason?: "initial" | "adaptation"; policy?: PriorityPolicy },
): PlanningSnapshot {
  const policy = options.policy ?? DEFAULT_PRIORITY_POLICY;
  const today = asDateString(options.today);
  const courseFactors = rankPriorities(
    data.courses.map((course) => {
      const result = calculatePriority(
        {
          courseId: course.id,
          code: course.code,
          name: course.name,
          credits: course.credits,
          understanding: data.evaluations[course.id]?.understanding,
          difficulty: data.evaluations[course.id]?.difficulty,
          events: data.academicEvents
            .filter((event) => event.courseId === course.id)
            .map((event) => ({ date: event.date, importance: event.importance, courseId: event.courseId })),
        },
        { today, policy },
      );
      return result;
    }),
  ).map((result) => ({
    courseId: result.courseId ?? "",
    code: result.code ?? "",
    name: result.name ?? "",
    factors: result.factors,
    score: result.finalScore,
  }));
  const generated = new Date(`${today}T00:00:00Z`);
  const end = new Date(generated);
  end.setUTCDate(end.getUTCDate() + 27);
  return {
    reason: options.reason ?? "initial",
    generatedAt: typeof options.today === "string" ? `${today}T00:00:00.000Z` : options.today.toISOString(),
    planningPeriod: { start: today, end: dateString(end) },
    weights: {
      academicLoad: policy.academicLoad,
      knowledgeGap: policy.knowledgeGap,
      difficulty: policy.difficulty,
      urgency: policy.urgency,
      adaptation: policy.adaptation,
    },
    courseFactors,
    availability: data.availability,
  };
}
