import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { exchangeGoogleCode } from "@/features/calendar/oauth";
import { encryptCalendarToken } from "@/features/calendar/crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CALENDAR_STATE_COOKIE, verifyCalendarState } from "@/features/calendar/state";

function redirect(request: Request, status: string) {
  const destination = new URL("/profil", request.url);
  destination.searchParams.set("calendar", status);
  return NextResponse.redirect(destination);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(CALENDAR_STATE_COOKIE)?.value;
  cookieStore.delete(CALENDAR_STATE_COOKIE);
  if (url.searchParams.get("error") || !code || !verifyCalendarState(expectedState, returnedState)) return redirect(request, "invalid_state");
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return redirect(request, "login");
  try {
    const tokens = await exchangeGoogleCode(code);
    const existing = await supabase.from("calendar_connections").select("id, refresh_token_ciphertext").eq("user_id", user.id).eq("provider", "google").maybeSingle();
    const refreshTokenCiphertext = tokens.refresh_token ? encryptCalendarToken(tokens.refresh_token) : existing.data?.refresh_token_ciphertext;
    if (!refreshTokenCiphertext) return redirect(request, "missing_refresh");
    const saved = await supabase.from("calendar_connections").upsert({
      user_id: user.id,
      provider: "google",
      calendar_id: "primary",
      access_token_ciphertext: encryptCalendarToken(tokens.access_token),
      refresh_token_ciphertext: refreshTokenCiphertext,
      access_token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      granted_scope: tokens.scope ?? "https://www.googleapis.com/auth/calendar.events",
      status: "connected",
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider" });
    if (saved.error) return redirect(request, "save_error");
    return redirect(request, "connected");
  } catch {
    return redirect(request, "error");
  }
}
