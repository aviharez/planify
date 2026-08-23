"use server";

import { revalidatePath } from "next/cache";
import { onboardingDataSchema } from "@/features/onboarding/state";
import type { StudySessionStatus } from "@/features/onboarding/types";
import { decryptCalendarToken, encryptCalendarToken } from "@/features/calendar/crypto";
import { refreshGoogleAccessToken } from "@/features/calendar/oauth";
import { CalendarProviderError, GoogleCalendarProvider, syncManagedEvents } from "@/features/calendar/provider";
import { dateInTimeZone } from "@/features/planning/priority";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CalendarActionResult = { ok: boolean; message: string };

async function context() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { supabase: null, user: null };
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

function calendarError() {
  return "Kalender belum berhasil disinkronkan. Coba lagi sebentar lagi.";
}

export async function getCalendarStatus() {
  const { supabase, user } = await context();
  if (!supabase || !user) return { authenticated: false as const, configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI && process.env.CALENDAR_TOKEN_ENCRYPTION_KEY), connected: false as const };
  const { data } = await supabase
    .from("calendar_connections")
    .select("id, provider, calendar_id, account_email, status, last_synced_at, granted_scope")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();
  return {
    authenticated: true as const,
    configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI && process.env.CALENDAR_TOKEN_ENCRYPTION_KEY),
    connected: Boolean(data?.id),
    accountEmail: data?.account_email ?? undefined,
    status: data?.status ?? undefined,
    lastSyncedAt: data?.last_synced_at ?? undefined,
  };
}

export async function syncCalendar(): Promise<CalendarActionResult> {
  const { supabase, user } = await context();
  if (!supabase) return { ok: false, message: "Layanan akun belum tersedia." };
  if (!user) return { ok: false, message: "Masuk terlebih dahulu untuk menyambungkan kalender." };
  const { data: connection } = await supabase
    .from("calendar_connections")
    .select("id, calendar_id, access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();
  if (!connection?.id) return { ok: false, message: "Sambungkan Google Calendar terlebih dahulu." };
  const { data: semester } = await supabase.from("semesters").select("setup_payload").eq("user_id", user.id).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const setup = onboardingDataSchema.safeParse(semester?.setup_payload);
  if (!setup.success || !setup.data.planActive) return { ok: false, message: "Rencana aktif belum tersedia untuk disinkronkan." };
  const { data: plan } = await supabase.from("study_plans").select("id").eq("user_id", user.id).eq("status", "active").order("generated_at", { ascending: false }).limit(1).maybeSingle();
  if (!plan?.id) return { ok: false, message: "Rencana belajar aktif belum tersedia." };
  const { data: sessions } = await supabase.from("study_sessions").select("id, session_key, course_name, session_date, start_time, end_time, study_goal, status").eq("study_plan_id", plan.id).eq("user_id", user.id);
  const { data: links } = await supabase.from("calendar_event_links").select("study_session_id, session_key, google_event_id, google_calendar_id").eq("connection_id", connection.id).eq("user_id", user.id);
  const linkedSessionIds = (links ?? []).map((link) => link.study_session_id);
  const { data: linkedSessions } = linkedSessionIds.length ? await supabase.from("study_sessions").select("id, session_date").in("id", linkedSessionIds).eq("user_id", user.id) : { data: [] as Array<{ id: string; session_date: string }> };
  const sessionDates = new Map((linkedSessions ?? []).map((session) => [session.id, session.session_date]));
  let accessToken: string;
  let refreshedCiphertext: string | undefined;
  let refreshedExpiresIn = 3600;
  try {
    accessToken = decryptCalendarToken(connection.access_token_ciphertext);
    const expiresAt = connection.access_token_expires_at ? Date.parse(connection.access_token_expires_at) : 0;
    if (expiresAt <= Date.now() + 60_000) {
      if (!connection.refresh_token_ciphertext) return { ok: false, message: "Sesi Google perlu disambungkan ulang." };
      const refreshToken = decryptCalendarToken(connection.refresh_token_ciphertext);
      const refreshed = await refreshGoogleAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      refreshedCiphertext = encryptCalendarToken(accessToken);
      refreshedExpiresIn = refreshed.expires_in ?? 3600;
    }
    const provider = new GoogleCalendarProvider(accessToken);
    const result = await syncManagedEvents(provider, {
      sessions: (sessions ?? []).map((session) => ({ id: session.id, sessionKey: session.session_key, courseName: session.course_name, date: session.session_date, startTime: session.start_time.slice(0, 5), endTime: session.end_time.slice(0, 5), studyGoal: session.study_goal ?? undefined, status: session.status as StudySessionStatus })),
      links: (links ?? []).map((link) => ({ studySessionId: link.study_session_id, sessionKey: link.session_key, googleEventId: link.google_event_id, googleCalendarId: link.google_calendar_id, sessionDate: sessionDates.get(link.study_session_id) })),
      calendarId: connection.calendar_id,
      timeZone: setup.data.timezone,
      today: dateInTimeZone(new Date(), setup.data.timezone),
    });
    for (const created of result.inserts) {
      const inserted = await supabase.from("calendar_event_links").insert({ user_id: user.id, connection_id: connection.id, study_session_id: created.sessionId, google_calendar_id: connection.calendar_id, google_event_id: created.eventId, session_key: created.sessionKey, synced_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      if (inserted.error) throw new Error("Tautan acara belum tersimpan.");
    }
    for (const updated of result.updates) {
      const saved = await supabase.from("calendar_event_links").update({ google_event_id: updated.eventId, synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("connection_id", connection.id).eq("study_session_id", updated.sessionId).eq("user_id", user.id);
      if (saved.error) throw new Error("Status tautan acara belum tersimpan.");
    }
    for (const removed of result.deletes) {
      const deleted = await supabase.from("calendar_event_links").delete().eq("connection_id", connection.id).eq("study_session_id", removed.linkId).eq("user_id", user.id);
      if (deleted.error) throw new Error("Tautan acara lama belum dihapus.");
    }
    const updatedConnection: Record<string, unknown> = { status: "connected", last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() };
    if (refreshedCiphertext) {
      updatedConnection.access_token_ciphertext = refreshedCiphertext;
      updatedConnection.access_token_expires_at = new Date(Date.now() + refreshedExpiresIn * 1000).toISOString();
    }
    const savedConnection = await supabase.from("calendar_connections").update(updatedConnection).eq("id", connection.id).eq("user_id", user.id);
    if (savedConnection.error) throw new Error("Status koneksi kalender belum tersimpan.");
    revalidatePath("/profil");
    return { ok: true, message: "Google Calendar berhasil disinkronkan." };
  } catch {
    await supabase.from("calendar_connections").update({ status: "error", last_error: "Sinkronisasi gagal", updated_at: new Date().toISOString() }).eq("id", connection.id).eq("user_id", user.id);
    return { ok: false, message: calendarError() };
  }
}

export async function disconnectCalendar(): Promise<CalendarActionResult> {
  const { supabase, user } = await context();
  if (!supabase || !user) return { ok: false, message: "Masuk terlebih dahulu untuk mengelola kalender." };
  const { data: connection } = await supabase.from("calendar_connections").select("id, calendar_id, access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at").eq("user_id", user.id).eq("provider", "google").maybeSingle();
  if (!connection?.id) return { ok: true, message: "Google Calendar sudah tidak tersambung." };
  try {
    const { data: semester } = await supabase.from("semesters").select("setup_payload").eq("user_id", user.id).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const setup = onboardingDataSchema.safeParse(semester?.setup_payload);
    if (!setup.success) return { ok: false, message: "Preferensi timezone belum tersedia untuk melepas kalender." };
    const { data: links } = await supabase.from("calendar_event_links").select("study_session_id, google_event_id, google_calendar_id").eq("connection_id", connection.id).eq("user_id", user.id);
    const linkedIds = (links ?? []).map((link) => link.study_session_id);
    const { data: linkedSessions } = linkedIds.length ? await supabase.from("study_sessions").select("id, session_date").in("id", linkedIds).eq("user_id", user.id) : { data: [] as Array<{ id: string; session_date: string }> };
    const sessionDates = new Map((linkedSessions ?? []).map((session) => [session.id, session.session_date]));
    let accessToken = decryptCalendarToken(connection.access_token_ciphertext);
    if (connection.access_token_expires_at && Date.parse(connection.access_token_expires_at) <= Date.now() + 60_000) {
      if (!connection.refresh_token_ciphertext) return { ok: false, message: "Sesi Google perlu disambungkan ulang sebelum kalender dilepas." };
      const refreshed = await refreshGoogleAccessToken(decryptCalendarToken(connection.refresh_token_ciphertext));
      accessToken = refreshed.access_token;
    }
    const provider = new GoogleCalendarProvider(accessToken);
    const today = dateInTimeZone(new Date(), setup.data.timezone);
    for (const link of links ?? []) {
      if (sessionDates.get(link.study_session_id) && sessionDates.get(link.study_session_id)! >= today) {
        try {
          await provider.delete(link.google_calendar_id, link.google_event_id);
        } catch (error) {
          if (!(error instanceof CalendarProviderError) || error.status !== 404) return { ok: false, message: "Acara mendatang belum berhasil dihapus dari Google Calendar. Coba lagi." };
        }
      }
    }
    const token = connection.refresh_token_ciphertext ? decryptCalendarToken(connection.refresh_token_ciphertext) : accessToken;
    const revoked = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", headers: { "content-length": "0" } });
    if (!revoked.ok && revoked.status !== 400) return { ok: false, message: "Akses Google belum berhasil dicabut. Coba lagi." };
  } catch {
    return { ok: false, message: "Kalender belum berhasil dilepas. Coba lagi." };
  }
  const removed = await supabase.from("calendar_connections").delete().eq("id", connection.id).eq("user_id", user.id);
  if (removed.error) return { ok: false, message: "Koneksi kalender belum berhasil dilepas." };
  revalidatePath("/profil");
  return { ok: true, message: "Google Calendar dilepas dari Planify." };
}
