"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  canTransitionSession,
  sessionMutationSchema,
} from "@/features/study-session/state";
import type { StudySessionStatus } from "@/features/onboarding/types";

export async function updateStudySession(input: unknown) {
  const parsed = sessionMutationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Data sesi belum lengkap atau belum valid." };
  if (!parsed.data.planId) return { ok: false, message: "Sesi akun belum dapat diverifikasi." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Layanan akun belum tersedia." };
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { ok: false, message: "Kamu perlu masuk terlebih dahulu." };
  const { data: activeSemester } = await supabase
    .from("semesters")
    .select("id")
    .eq("user_id", authData.user.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!activeSemester?.id) return { ok: false, message: "Semester aktif belum tersedia." };
  const { data: activePlan } = await supabase
    .from("study_plans")
    .select("id, semester_id")
    .eq("id", parsed.data.planId)
    .eq("user_id", authData.user.id)
    .eq("semester_id", activeSemester.id)
    .eq("status", "active")
    .maybeSingle();
  if (!activePlan?.id || activePlan.semester_id !== activeSemester.id) return { ok: false, message: "Rencana aktif tidak ditemukan." };
  const { data: session } = await supabase
    .from("study_sessions")
    .select("id, status, semester_id, study_plan_id")
    .eq("study_plan_id", activePlan.id)
    .eq("semester_id", activeSemester.id)
    .eq("session_key", parsed.data.sessionKey)
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (!session || session.study_plan_id !== activePlan.id || session.semester_id !== activeSemester.id) return { ok: false, message: "Sesi tidak ditemukan." };
  const currentStatus = session.status as StudySessionStatus;
  if (!canTransitionSession(currentStatus, parsed.data.status))
    return { ok: false, message: "Sesi yang sudah tercatat tidak dapat diubah lagi." };
  const updated = await supabase
    .from("study_sessions")
    .update({
      status: parsed.data.status,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.id)
    .eq("user_id", authData.user.id);
  if (updated.error) return { ok: false, message: "Status sesi belum berhasil disimpan." };
  if (parsed.data.reason || parsed.data.understanding !== undefined) {
    const feedback = await supabase.from("session_feedback").insert({
      study_session_id: session.id,
      user_id: authData.user.id,
      reason: parsed.data.reason ?? null,
      understanding: parsed.data.understanding ?? null,
    });
    if (feedback.error) return { ok: false, message: "Status tersimpan, tetapi umpan balik belum berhasil disimpan." };
  }
  revalidatePath("/hari-ini");
  revalidatePath("/rencana");
  revalidatePath("/mata-kuliah");
  return { ok: true, message: "Perubahan sesi tersimpan." };
}
