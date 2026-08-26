import type { OnboardingData, StudyPlan } from "./types";

export type LifecycleState =
  | "setup-incomplete"
  | "setup-complete/no-plan"
  | "initial-plan/preview-pending"
  | "active-use";

export function resolveLifecycle(data: Pick<OnboardingData, "step" | "courses" | "krsFileName" | "planActive" | "studyPlan" | "previewAcknowledgedAt">): LifecycleState {
  if (data.step < 5 || !data.krsFileName || data.courses.length === 0) return "setup-incomplete";
  if (!data.planActive || !data.studyPlan) return "setup-complete/no-plan";
  // Older local payloads never had the field; their existing plans are already in normal use.
  if (data.previewAcknowledgedAt === undefined || data.previewAcknowledgedAt !== null) return "active-use";
  return "initial-plan/preview-pending";
}

export function isActiveUse(data: Parameters<typeof resolveLifecycle>[0]) {
  return resolveLifecycle(data) === "active-use";
}

export function canOpenMainExperience(data: Parameters<typeof resolveLifecycle>[0]) {
  return isActiveUse(data);
}

/** Preserve an explicit pending preview; only legacy payloads may inherit remote acknowledgement. */
export function resolvePreviewAcknowledgement(
  persisted: string | null | undefined,
  remote: string | null | undefined,
) {
  return persisted === undefined ? remote : persisted;
}

/** Reuse an existing remote acknowledgement so a retry can finish setup persistence. */
export function resolvePlanAcknowledgement(current: string | null | undefined, now: string) {
  return current ?? now;
}

/** Rejects sessions and priority factors that cross the active semester boundary. */
export function validatePlanCourseOwnership(
  data: Pick<OnboardingData, "courses" | "planningSnapshot">,
  plan?: Pick<StudyPlan, "sessions" | "prioritySnapshot">,
) {
  if (!plan) return { ok: false as const, courseIds: [] as string[] };
  const courseIds = new Set(data.courses.map((course) => course.id));
  const referenced = [
    ...plan.sessions.map((session) => session.courseId),
    ...plan.prioritySnapshot.courseFactors.map((factor) => factor.courseId),
    ...(data.planningSnapshot?.courseFactors.map((factor) => factor.courseId) ?? []),
  ];
  const invalid = [...new Set(referenced.filter((courseId) => !courseIds.has(courseId)))];
  return invalid.length
    ? { ok: false as const, courseIds: invalid }
    : { ok: true as const, courseIds: [] as string[] };
}
