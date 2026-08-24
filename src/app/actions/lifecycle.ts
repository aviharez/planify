"use server";

import { revalidatePath } from "next/cache";
import { initialOnboardingData, type OnboardingData } from "@/features/onboarding/types";
import { onboardingDataSchema } from "@/features/onboarding/state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createNewSemesterSetup, nextSemesterName } from "@/features/semester/lifecycle";

async function context() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { supabase: null, user: null };
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

export async function acknowledgePlanPreview(planId?: string) {
  const { supabase, user } = await context();
  if (!supabase || !user) return { ok: true as const, acknowledgedAt: new Date().toISOString() };
  const acknowledgedAt = new Date().toISOString();
  const { data: semester } = await supabase.from("semesters").select("id, setup_payload").eq("user_id", user.id).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!semester?.id) return { ok: false as const, message: "Semester aktif belum tersedia." };
  let setup: OnboardingData | null = null;
  const parsed = onboardingDataSchema.safeParse(semester.setup_payload);
  if (parsed.success) setup = parsed.data as OnboardingData;
  let query = supabase.from("study_plans").update({ preview_acknowledged_at: acknowledgedAt, updated_at: acknowledgedAt }).eq("user_id", user.id).eq("semester_id", semester.id).eq("status", "active");
  if (planId) query = query.eq("id", planId);
  const updated = await query;
  if (updated.error) return { ok: false as const, message: "Preview belum berhasil disimpan." };
  const payload = setup ? { ...setup, previewAcknowledgedAt: acknowledgedAt } : { ...(semester.setup_payload as Record<string, unknown>), previewAcknowledgedAt: acknowledgedAt };
  const saved = await supabase.from("semesters").update({ setup_payload: payload, updated_at: acknowledgedAt }).eq("id", semester.id).eq("user_id", user.id);
  if (saved.error) return { ok: false as const, message: "Status preview belum berhasil disimpan." };
  revalidatePath("/");
  revalidatePath("/hari-ini");
  return { ok: true as const, acknowledgedAt };
}

export async function savePreferences(input: unknown) {
  const parsed = onboardingDataSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Preferensi belum lengkap atau belum valid." };
  const { supabase, user } = await context();
  if (!supabase || !user) return { ok: true as const, message: "Preferensi tersimpan di perangkat ini." };
  const { data: semester } = await supabase.from("semesters").select("id").eq("user_id", user.id).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!semester?.id) return { ok: false as const, message: "Semester aktif belum tersedia." };
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
  try {
    const created = await supabase.rpc("start_new_semester", { p_name: name, p_setup_payload: fresh });
    if (created.error || !created.data) return { ok: false as const, message: "Semester baru belum berhasil dibuat." };
  } catch {
    return { ok: false as const, message: "Semester baru belum berhasil dibuat." };
  }
  revalidatePath("/");
  revalidatePath("/profil");
  return { ok: true as const, setup: fresh };
}
