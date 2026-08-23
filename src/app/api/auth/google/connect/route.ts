import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CALENDAR_STATE_COOKIE, createCalendarState } from "@/features/calendar/state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const callbackPath = "/api/auth/google/callback";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  const destination = new URL("/profil", request.url);
  if (!user) {
    destination.searchParams.set("calendar", "login");
    return NextResponse.redirect(destination);
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
    destination.searchParams.set("calendar", "unavailable");
    return NextResponse.redirect(destination);
  }
  if (new URL(process.env.GOOGLE_REDIRECT_URI).pathname !== callbackPath) {
    destination.searchParams.set("calendar", "unavailable");
    return NextResponse.redirect(destination);
  }
  const state = createCalendarState();
  const cookieStore = await cookies();
  cookieStore.set(CALENDAR_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/google/callback",
    maxAge: 600,
  });
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return NextResponse.redirect(authorization);
}
