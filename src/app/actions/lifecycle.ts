"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { initialOnboardingData, type OnboardingData } from "@/features/onboarding/types";
import { onboardingDataSchema } from "@/features/onboarding/state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createNewSemesterSetup, nextSemesterName } from "@/features/semester/lifecycle";
import { resolvePlanAcknowledgement, validatePlanCourseOwnership } from "@/features/onboarding/lifecycle";
import { syncCalendar } from "@/app/actions/calendar";

async function context() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { supabase: null, user: null };
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

const finalizationInputSchema = z.object({
  planId: z.string().uuid(),
  setup: z.unknown(),
  acknowledge: z.boolean(),
});

/**
 * Persists the complete pending setup during preparation. On acknowledgement,
 * acknowledge the verified remote plan first, then write the setup; an explicit
 * null remains pending if the second write fails.
 */
export async function finalizePlanPreview(input: unknown) {
  const parsedInput = finalizationInputSchema.safeParse(input);
  if (!parsedInput.success) return { ok: false as const, message: "Rencana belum siap disimpan." };
  const setup = onboardingDataSchema.safeParse(parsedInput.data.setup);
  if (!setup.success || !setup.data.planActive || !setup.data.studyPlan) {
    return { ok: false as const, message: "Data rencana belum lengkap untuk disimpan." };
  }
  const ownership = validatePlanCourseOwnership(setup.data, setup.data.studyPlan);
  if (!ownership.ok) {
    return { ok: false as const, message: `Rencana memuat mata kuliah yang bukan bagian dari semester aktif: ${ownership.courseIds.join(", ")}.` };
  }
  if (!parsedInput.data.acknowledge && setup.data.previewAcknowledgedAt !== null) {
    return { ok: false as const, message: "Preview baru harus berstatus menunggu konfirmasi." };
  }
  const { supabase, user } = await context();
  if (!supabase || !user) return { ok: true as const, acknowledgedAt: parsedInput.data.acknowledge ? new Date().toISOString() : null };
  const { data: semester } = await supabase.from("semesters").select("id").eq("user_id", user.id).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!semester?.id) return { ok: false as const, message: "Semester aktif belum tersedia." };
  if (setup.data.semesterId !== semester.id) {
    return { ok: false as const, message: "Data onboarding bukan milik semester aktif. Muat ulang halaman lalu coba lagi." };
  }
  const remotePlan = await supabase.from("study_plans").select("id, semester_id, preview_acknowledged_at").eq("id", parsedInput.data.planId).eq("user_id", user.id).eq("semester_id", semester.id).eq("status", "active").maybeSingle();
  if (remotePlan.error || !remotePlan.data?.id || remotePlan.data.semester_id !== semester.id) return { ok: false as const, message: "Rencana remote belum tersedia. Coba simpan ulang." };

  let acknowledgedAt: string | null = null;
  if (parsedInput.data.acknowledge) {
    acknowledgedAt = resolvePlanAcknowledgement(remotePlan.data.preview_acknowledged_at, new Date().toISOString());
    if (!remotePlan.data.preview_acknowledged_at) {
      const acknowledged = await supabase
        .from("study_plans")
        .update({ preview_acknowledged_at: acknowledgedAt, updated_at: acknowledgedAt })
        .eq("id", remotePlan.data.id)
        .eq("user_id", user.id)
        .eq("semester_id", semester.id)
        .eq("status", "active")
        .is("preview_acknowledged_at", null)
        .select("id")
        .maybeSingle();
      if (acknowledged.error || !acknowledged.data?.id) return { ok: false as const, message: "Preview belum berhasil disimpan. Coba lagi." };
    }
  }
  const payload = parsedInput.data.acknowledge
    ? { ...setup.data, previewAcknowledgedAt: acknowledgedAt }
    : setup.data;
  const saved = await supabase
    .from("semesters")
    .update({ setup_payload: payload, onboarding_step: payload.step, updated_at: new Date().toISOString() })
    .eq("id", semester.id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (saved.error || !saved.data?.id) return { ok: false as const, message: "Data semester belum berhasil disimpan. Tetap di halaman ini dan coba lagi." };
  let warning: string | undefined;
  if (parsedInput.data.acknowledge) {
    const calendar = await syncCalendar();
    if (!calendar.ok && !calendar.message.includes("Sambungkan Google Calendar")) warning = calendar.message;
  }
  revalidatePath("/");
  revalidatePath("/hari-ini");
  revalidatePath("/rencana");
  return { ok: true as const, acknowledgedAt, warning };
}

export async function savePreferences(input: unknown) {
  const parsed = onboardingDataSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Preferensi belum lengkap atau belum valid." };
  const { supabase, user } = await context();
  if (!supabase || !user) return { ok: true as const, message: "Preferensi tersimpan di perangkat ini." };
  const { data: semester } = await supabase.from("semesters").select("id").eq("user_id", user.id).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!semester?.id) return { ok: false as const, message: "Semester aktif belum tersedia." };
  if (parsed.data.semesterId !== semester.id) return { ok: false as const, message: "Preferensi bukan milik semester aktif. Muat ulang halaman lalu coba lagi." };
  const saved = await supabase.from("semesters").update({ setup_payload: parsed.data, onboarding_step: parsed.data.step, updated_at: new Date().toISOString() }).eq("id", semester.id).eq("user_id", user.id);
  if (saved.error) return { ok: false as const, message: "Preferensi belum berhasil disimpan." };
  revalidatePath("/profil");
  return { ok: true as const, message: "Preferensi tersimpan." };
}

export async function startNewSemester(reusePreferences = true) {
  const { supabase, user } = await context();
  if (!supabase || !user) return { ok: false as const, message: "Masuk ke akun untuk memulai semester baru." };
  const [{ data: active }, { data: semesters }] = await Promise.all([
    supabase.from("semesters").select("id, name, setup_payload").eq("user_id", user.id).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("semesters").select("name").eq("user_id", user.id),
  ]);
  const previous = onboardingDataSchema.safeParse(active?.setup_payload).success ? onboardingDataSchema.parse(active?.setup_payload) as OnboardingData : initialOnboardingData;
  const now = new Date();
  const name = nextSemesterName(active?.name, (semesters ?? []).map((semester) => semester.name), now.getFullYear());
  const fresh: OnboardingData = createNewSemesterSetup(previous, reusePreferences, name);
  let setup: OnboardingData;
  try {
    const created = await supabase.rpc("start_new_semester", { p_name: name, p_setup_payload: fresh });
    if (created.error || !created.data) return { ok: false as const, message: "Semester baru belum berhasil dibuat." };
    const semesterId = String(created.data);
    const { data: createdSemester } = await supabase
      .from("semesters")
      .select("id, started_at")
      .eq("id", semesterId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!createdSemester?.id) return { ok: false as const, message: "Semester baru belum berhasil dibaca ulang." };
    setup = {
      ...fresh,
      semesterId: createdSemester.id,
      semesterStartedAt: createdSemester.started_at,
    };
  } catch {
    return { ok: false as const, message: "Semester baru belum berhasil dibuat." };
  }
  revalidatePath("/");
  revalidatePath("/profil");
  return { ok: true as const, setup };
}
