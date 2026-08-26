"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { onboardingDataSchema } from "@/features/onboarding/state";
import { resolveSourceSessionId, weeklyEvaluationSchema } from "@/features/planning/adaptation";
import { validatePlanCourseOwnership } from "@/features/onboarding/lifecycle";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);
const factorsSchema = z.object({
  academicLoad: z.number(),
  knowledgeGap: z.number(),
  difficulty: z.number(),
  urgency: z.number(),
  adaptation: z.number(),
  score: z.number(),
});
const snapshotSchema = z.object({
  reason: z.enum(["initial", "adaptation"]),
  generatedAt: z.string(),
  planningPeriod: z.object({ start: dateSchema, end: dateSchema }),
  weights: z.object({
    academicLoad: z.number(),
    knowledgeGap: z.number(),
    difficulty: z.number(),
    urgency: z.number(),
    adaptation: z.number(),
  }),
  courseFactors: z.array(z.object({
    courseId: z.string(),
    name: z.string(),
    factors: factorsSchema.omit({ score: true }),
    score: z.number(),
  })),
  availability: z.array(z.object({ id: z.string(), day: z.string(), start: timeSchema, end: timeSchema })),
});
const sessionSchema = z.object({
  id: z.string().min(1),
  sessionKey: z.string().min(1),
  courseId: z.string().min(1),
  courseName: z.string().min(1),
  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  duration: z.number().int().min(15).max(180),
  status: z.enum(["planned", "completed", "partial", "missed"]),
  prioritySnapshot: factorsSchema,
  studyMethod: z.string().optional(),
  studyGoal: z.string().optional(),
  explanation: z.string().optional(),
  completedAt: z.string().optional(),
  sourceSessionId: z.string().optional(),
  changeReason: z.string().optional(),
});
const adaptationPlanSchema = z.object({
  id: z.string().min(1),
  remoteId: z.string().uuid().optional(),
  sourcePlanId: z.string().uuid(),
  adaptationReason: z.string().min(1).max(500),
  changeSummary: z.array(z.object({
    sessionKey: z.string().min(1),
    courseId: z.string().min(1),
    courseName: z.string().min(1),
    reason: z.string().min(1).max(300),
    sourceSessionId: z.string().optional(),
  })).max(200),
  generatedAt: z.string(),
  planningPeriod: z.object({ start: dateSchema, end: dateSchema }),
  weeklyCapacityMinutes: z.number().int().nonnegative(),
  capacityPolicy: z.object({
    capacityFactor: z.number().min(0).max(1),
    densityFactor: z.number().min(0).max(1),
    dailyMaximumMinutes: z.number().int().positive(),
    maximumSessionDuration: z.number().int().positive(),
    minimumBreakMinutes: z.number().int().nonnegative(),
  }),
  prioritySnapshot: snapshotSchema,
  sessions: z.array(sessionSchema).max(500),
});

const evaluationInputSchema = weeklyEvaluationSchema.extend({ weekStart: dateSchema });

type ActionResult = { ok: boolean; message: string; remotePlanId?: string };

async function getAuthenticatedContext() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { supabase: null, user: null };
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

export async function saveWeeklyEvaluation(input: unknown): Promise<ActionResult> {
  const parsed = evaluationInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Evaluasi mingguan belum lengkap atau belum valid." };
  const { supabase, user } = await getAuthenticatedContext();
  if (!supabase) return { ok: false, message: "Layanan akun belum tersedia." };
  if (!user) return { ok: false, message: "Kamu perlu masuk terlebih dahulu." };
  const { data: semester } = await supabase
    .from("semesters")
    .select("id, setup_payload")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!semester?.id) return { ok: false, message: "Semester aktif belum tersedia." };
  const setup = onboardingDataSchema.safeParse(semester.setup_payload);
  if (!setup.success || !setup.data.planActive) return { ok: false, message: "Rencana belajar aktif belum tersedia." };
  if (parsed.data.courseId && !setup.data.courses.some((course) => course.id === parsed.data.courseId)) {
    return { ok: false, message: "Mata kuliah evaluasi tidak dikenali." };
  }
  const result = await supabase.from("weekly_evaluations").upsert({
    user_id: user.id,
    semester_id: semester.id,
    week_start: parsed.data.weekStart,
    perceived_load: parsed.data.perceivedLoad,
    realism: parsed.data.realism,
    course_key: parsed.data.courseId ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,semester_id,week_start" });
  if (result.error) return { ok: false, message: "Evaluasi mingguan belum berhasil disimpan." };
  return { ok: true, message: "Evaluasi mingguan tersimpan." };
}

export async function persistAdaptedPlan(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ sourcePlanId: z.string().uuid(), plan: adaptationPlanSchema }).safeParse(input);
  if (!parsed.success || parsed.data.plan.sourcePlanId !== parsed.data.sourcePlanId)
    return { ok: false, message: "Perubahan rencana belum lolos validasi." };
  const { supabase, user } = await getAuthenticatedContext();
  if (!supabase) return { ok: false, message: "Layanan akun belum tersedia." };
  if (!user) return { ok: false, message: "Kamu perlu masuk terlebih dahulu." };
  const { data: activeSemester } = await supabase
    .from("semesters")
    .select("id, setup_payload")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!activeSemester?.id) return { ok: false, message: "Semester aktif belum tersedia." };
  const setup = onboardingDataSchema.safeParse(activeSemester.setup_payload);
  if (!setup.success || !setup.data.planActive || (setup.data.semesterId && setup.data.semesterId !== activeSemester.id)) return { ok: false, message: "Rencana belajar aktif belum tersedia." };
  const { data: source } = await supabase
    .from("study_plans")
    .select("id, semester_id")
    .eq("id", parsed.data.sourcePlanId)
    .eq("user_id", user.id)
    .eq("semester_id", activeSemester.id)
    .eq("status", "active")
    .maybeSingle();
  if (!source) return { ok: false, message: "Rencana aktif tidak ditemukan." };
  const ownership = validatePlanCourseOwnership(setup.data, parsed.data.plan);
  if (!ownership.ok) return { ok: false, message: `Perubahan rencana memuat mata kuliah yang bukan bagian dari semester aktif: ${ownership.courseIds.join(", ")}.` };
  const { data: sourceSessions } = await supabase
    .from("study_sessions")
    .select("id, session_key")
    .eq("study_plan_id", source.id)
    .eq("semester_id", activeSemester.id)
    .eq("user_id", user.id);
  const persistedPlan = {
    ...parsed.data.plan,
    sessions: parsed.data.plan.sessions.map((session) => ({
      ...session,
      sourceSessionId: resolveSourceSessionId(sourceSessions ?? [], session.sourceSessionId, session.sessionKey) ?? undefined,
    })),
  };
  const stored = await supabase.rpc("replace_active_study_plan", {
    p_semester_id: activeSemester.id,
    p_plan: persistedPlan,
    p_setup_payload: {
      ...setup.data,
      planningSnapshot: persistedPlan.prioritySnapshot,
      studyPlan: persistedPlan,
      planActive: true,
    },
    p_source_plan_id: source.id,
  });
  if (stored.error || !stored.data)
    return { ok: false, message: "Perubahan rencana belum berhasil disimpan secara utuh." };
  revalidatePath("/hari-ini");
  revalidatePath("/rencana");
  revalidatePath("/mata-kuliah");
  return { ok: true, message: "Rencanamu diperbarui.", remotePlanId: stored.data };
}
