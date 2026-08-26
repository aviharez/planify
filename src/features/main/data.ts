import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { onboardingDataSchema } from "@/features/onboarding/state";
import type { OnboardingData, StudyPlan, StudySession } from "@/features/onboarding/types";
import { canOpenMainExperience, resolvePreviewAcknowledgement, validatePlanCourseOwnership } from "@/features/onboarding/lifecycle";

export const ONBOARDING_STORAGE_KEY = "planify:onboarding:v1";

const remoteSessionSchema = z.object({
  id: z.string(),
  study_plan_id: z.string().uuid(),
  semester_id: z.string().uuid(),
  session_key: z.string(),
  course_key: z.string(),
  course_name: z.string(),
  session_date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  duration_minutes: z.number(),
  status: z.enum(["planned", "completed", "partial", "missed"]),
  priority_snapshot: z.object({
    academicLoad: z.number(),
    knowledgeGap: z.number(),
    difficulty: z.number(),
    urgency: z.number(),
    adaptation: z.number(),
    score: z.number(),
  }),
  study_method: z.string().nullable(),
  study_goal: z.string().nullable(),
  explanation: z.string().nullable(),
  completed_at: z.string().nullable(),
  source_session_id: z.string().nullable(),
  change_reason: z.string().nullable(),
});

export type MainData = {
  setup: OnboardingData;
  authenticated: boolean;
  semesterId: string;
  remotePlanId?: string;
};

export async function loadMainData(supabase = createSupabaseBrowserClient()): Promise<MainData | null> {
  if (!supabase) return null;
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;
  const { data: semester } = await supabase
    .from("semesters")
    .select("id, setup_payload")
    .eq("user_id", authData.user.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let setup: OnboardingData;
  try {
    setup = onboardingDataSchema.parse(semester?.setup_payload) as OnboardingData;
  } catch {
    return null;
  }
  if (!setup.planActive || !setup.studyPlan || !semester?.id) return null;
  if (setup.semesterId && setup.semesterId !== semester.id) return null;
  const { data: remotePlan } = await supabase
    .from("study_plans")
    .select("id, semester_id, planning_period_start, planning_period_end, weekly_capacity_minutes, capacity_policy, priority_snapshot, generated_at, source_plan_id, adaptation_reason, change_summary, preview_acknowledged_at")
    .eq("user_id", authData.user.id)
    .eq("semester_id", semester.id)
    .eq("status", "active")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!remotePlan?.id || remotePlan.semester_id !== semester.id) return null;
  const previewAcknowledgedAt = resolvePreviewAcknowledgement(setup.previewAcknowledgedAt, remotePlan.preview_acknowledged_at);
  const hydratedSetup = { ...setup, semesterId: semester.id, previewAcknowledgedAt };
  if (!canOpenMainExperience(hydratedSetup)) return null;
  const { data: remoteSessions, error: remoteSessionsError } = await supabase
    .from("study_sessions")
    .select("id, study_plan_id, semester_id, session_key, course_key, course_name, session_date, start_time, end_time, duration_minutes, status, priority_snapshot, study_method, study_goal, explanation, completed_at, source_session_id, change_reason")
    .eq("study_plan_id", remotePlan.id)
    .eq("semester_id", semester.id)
    .eq("user_id", authData.user.id)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (remoteSessionsError) return null;
  const parsedSessions = z.array(remoteSessionSchema).safeParse(remoteSessions ?? []);
  if (!parsedSessions.success || parsedSessions.data.some((session) => session.study_plan_id !== remotePlan.id || session.semester_id !== semester.id)) return null;
  const { data: remoteFeedback } = await supabase
    .from("session_feedback")
    .select("study_session_id, reason, understanding, recorded_at")
    .in("study_session_id", parsedSessions.data.map((session) => session.id))
    .order("recorded_at", { ascending: false });
  const feedbackBySession = new Map<string, { reason?: string; understanding?: number; recordedAt: string }>();
  for (const feedback of remoteFeedback ?? []) {
    if (!feedbackBySession.has(feedback.study_session_id)) {
      feedbackBySession.set(feedback.study_session_id, {
        reason: feedback.reason ?? undefined,
        understanding: feedback.understanding ?? undefined,
        recordedAt: feedback.recorded_at,
      });
    }
  }
  const sessions: StudySession[] = parsedSessions.data.map((session) => ({
    id: session.session_key,
    sessionKey: session.session_key,
    courseId: session.course_key,
    courseName: session.course_name,
    date: session.session_date,
    startTime: session.start_time.slice(0, 5),
    endTime: session.end_time.slice(0, 5),
    duration: session.duration_minutes,
    status: session.status,
    prioritySnapshot: session.priority_snapshot,
    studyMethod: session.study_method ?? undefined,
    studyGoal: session.study_goal ?? undefined,
    explanation: session.explanation ?? undefined,
    completedAt: session.completed_at ?? undefined,
    sourceSessionId: session.source_session_id ?? undefined,
    changeReason: session.change_reason ?? undefined,
    feedback: feedbackBySession.get(session.id),
  }));
  const prioritySnapshot = z.object({
    reason: z.enum(["initial", "adaptation"]),
    generatedAt: z.string(),
    planningPeriod: z.object({ start: z.string(), end: z.string() }),
    weights: z.object({ academicLoad: z.number(), knowledgeGap: z.number(), difficulty: z.number(), urgency: z.number(), adaptation: z.number() }),
    courseFactors: z.array(z.object({ courseId: z.string(), name: z.string(), factors: z.object({ academicLoad: z.number(), knowledgeGap: z.number(), difficulty: z.number(), urgency: z.number(), adaptation: z.number() }), score: z.number() })),
    availability: z.array(z.object({ id: z.string(), day: z.string(), start: z.string(), end: z.string() })),
  }).safeParse(remotePlan.priority_snapshot);
  if (!prioritySnapshot.success) return null;
  const studyPlan: StudyPlan = {
    id: setup.studyPlan.id,
    remoteId: remotePlan.id,
    generatedAt: remotePlan.generated_at,
    planningPeriod: {
      start: remotePlan.planning_period_start,
      end: remotePlan.planning_period_end,
    },
    weeklyCapacityMinutes: remotePlan.weekly_capacity_minutes,
    capacityPolicy: remotePlan.capacity_policy as StudyPlan["capacityPolicy"],
    prioritySnapshot: prioritySnapshot.data as StudyPlan["prioritySnapshot"],
    sourcePlanId: remotePlan.source_plan_id ?? undefined,
    adaptationReason: remotePlan.adaptation_reason ?? undefined,
    changeSummary: Array.isArray(remotePlan.change_summary) ? remotePlan.change_summary as StudyPlan["changeSummary"] : undefined,
    sessions,
  };
  const ownership = validatePlanCourseOwnership({ courses: hydratedSetup.courses, planningSnapshot: hydratedSetup.planningSnapshot }, studyPlan);
  if (!ownership.ok) return null;
  return { setup: { ...hydratedSetup, studyPlan }, authenticated: true, semesterId: semester.id, remotePlanId: remotePlan.id };
}

export function saveLocalMainData(setup: OnboardingData) {
  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(setup));
}
