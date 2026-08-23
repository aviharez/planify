"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { onboardingDataSchema } from "@/features/onboarding/state";
import { resolveSourceSessionId, weeklyEvaluationSchema } from "@/features/planning/adaptation";
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
    code: z.string(),
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
  courseCode: z.string().min(1),
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
  const { data: source } = await supabase
    .from("study_plans")
    .select("id, semester_id")
    .eq("id", parsed.data.sourcePlanId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!source) return { ok: false, message: "Rencana aktif tidak ditemukan." };
  const { data: sourceSessions } = await supabase
    .from("study_sessions")
    .select("id, session_key")
    .eq("study_plan_id", source.id)
    .eq("user_id", user.id);
  const inserted = await supabase
    .from("study_plans")
    .insert({
      user_id: user.id,
      semester_id: source.semester_id,
      status: "active",
      source_plan_id: source.id,
      adaptation_reason: parsed.data.plan.adaptationReason,
      change_summary: parsed.data.plan.changeSummary,
      priority_snapshot: parsed.data.plan.prioritySnapshot,
      capacity_policy: parsed.data.plan.capacityPolicy,
      weekly_capacity_minutes: parsed.data.plan.weeklyCapacityMinutes,
      planning_period_start: parsed.data.plan.planningPeriod.start,
      planning_period_end: parsed.data.plan.planningPeriod.end,
      generated_at: parsed.data.plan.generatedAt,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data?.id)
    return { ok: false, message: "Perubahan rencana belum berhasil disimpan." };
  const sessions = parsed.data.plan.sessions.map((session) => ({
    study_plan_id: inserted.data.id,
    user_id: user.id,
    semester_id: source.semester_id,
    course_key: session.courseId,
    course_code: session.courseCode,
    course_name: session.courseName,
    session_key: session.sessionKey,
    session_date: session.date,
    start_time: session.startTime,
    end_time: session.endTime,
    duration_minutes: session.duration,
    status: session.status,
    priority_snapshot: session.prioritySnapshot,
    study_method: session.studyMethod ?? null,
    study_goal: session.studyGoal ?? null,
    explanation: session.explanation ?? null,
    completed_at: session.completedAt ?? null,
    source_session_id: resolveSourceSessionId(sourceSessions ?? [], session.sourceSessionId, session.sessionKey),
    change_reason: session.changeReason ?? null,
  }));
  const storedSessions = sessions.length ? await supabase.from("study_sessions").insert(sessions) : { error: null };
  if (storedSessions.error) {
    await supabase.from("study_plans").delete().eq("id", inserted.data.id).eq("user_id", user.id);
    return { ok: false, message: "Perubahan rencana belum berhasil menyimpan semua sesi." };
  }
  const archived = await supabase
    .from("study_plans")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", source.id)
    .eq("user_id", user.id);
  if (archived.error) {
    await supabase.from("study_plans").delete().eq("id", inserted.data.id).eq("user_id", user.id);
    return { ok: false, message: "Perubahan rencana belum berhasil mengarsipkan rencana lama." };
  }
  revalidatePath("/hari-ini");
  revalidatePath("/rencana");
  revalidatePath("/mata-kuliah");
  return { ok: true, message: "Rencanamu diperbarui.", remotePlanId: inserted.data.id };
}
