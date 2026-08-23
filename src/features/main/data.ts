import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { onboardingDataSchema } from "@/features/onboarding/state";
import type { OnboardingData, StudyPlan, StudySession } from "@/features/onboarding/types";

export const ONBOARDING_STORAGE_KEY = "planify:onboarding:v1";

const remoteSessionSchema = z.object({
  id: z.string(),
  session_key: z.string(),
  course_key: z.string(),
  course_code: z.string(),
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
  remotePlanId?: string;
};

function readLocal() {
  try {
    const setup = onboardingDataSchema.parse(
      JSON.parse(window.localStorage.getItem(ONBOARDING_STORAGE_KEY) ?? "null"),
    ) as OnboardingData;
    return setup.planActive && setup.studyPlan ? setup : null;
  } catch {
    return null;
  }
}

export async function loadMainData(): Promise<MainData | null> {
  const local = readLocal();
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return local ? { setup: local, authenticated: false } : null;
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;
  const { data: semester } = await supabase
    .from("semesters")
    .select("setup_payload")
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
  if (!setup.planActive || !setup.studyPlan) return null;
  const { data: remotePlan } = await supabase
    .from("study_plans")
    .select("id, planning_period_start, planning_period_end, weekly_capacity_minutes, capacity_policy, priority_snapshot, generated_at, source_plan_id, adaptation_reason, change_summary")
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!remotePlan?.id) return { setup, authenticated: true };
  const { data: remoteSessions } = await supabase
    .from("study_sessions")
    .select("id, session_key, course_key, course_code, course_name, session_date, start_time, end_time, duration_minutes, status, priority_snapshot, study_method, study_goal, explanation, completed_at, source_session_id, change_reason")
    .eq("study_plan_id", remotePlan.id)
    .eq("user_id", authData.user.id)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true });
  const parsedSessions = z.array(remoteSessionSchema).safeParse(remoteSessions ?? []);
  if (!parsedSessions.success || parsedSessions.data.length === 0)
    return { setup: { ...setup, studyPlan: { ...setup.studyPlan, remoteId: remotePlan.id } }, authenticated: true, remotePlanId: remotePlan.id };
  const sessions: StudySession[] = parsedSessions.data.map((session) => ({
    id: session.session_key,
    sessionKey: session.session_key,
    courseId: session.course_key,
    courseCode: session.course_code,
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
  }));
  const studyPlan: StudyPlan = {
    ...setup.studyPlan,
    id: setup.studyPlan.id,
    remoteId: remotePlan.id,
    generatedAt: remotePlan.generated_at,
    planningPeriod: {
      start: remotePlan.planning_period_start,
      end: remotePlan.planning_period_end,
    },
    weeklyCapacityMinutes: remotePlan.weekly_capacity_minutes,
    capacityPolicy: remotePlan.capacity_policy as StudyPlan["capacityPolicy"],
    prioritySnapshot: remotePlan.priority_snapshot as StudyPlan["prioritySnapshot"],
    sourcePlanId: remotePlan.source_plan_id ?? undefined,
    adaptationReason: remotePlan.adaptation_reason ?? undefined,
    changeSummary: Array.isArray(remotePlan.change_summary) ? remotePlan.change_summary as StudyPlan["changeSummary"] : undefined,
    sessions,
  };
  return { setup: { ...setup, studyPlan }, authenticated: true, remotePlanId: remotePlan.id };
}

export function saveLocalMainData(setup: OnboardingData) {
  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(setup));
}
