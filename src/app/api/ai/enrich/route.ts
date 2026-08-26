import { NextResponse } from "next/server";
import {
  enrichStudySessionsInputSchema,
  fallbackEnrichment,
  type EnrichStudySessionsResult,
} from "@/features/ai/provider";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createGroqAiProvider } from "@/server/ai/groq";

function fallback(input: ReturnType<typeof enrichStudySessionsInputSchema.parse>): EnrichStudySessionsResult {
  return {
    sessions: input.sessions.map((session) =>
      fallbackEnrichment({
        sessionKey: session.sessionKey,
        courseName: session.courseName,
        prioritySnapshot: {
          academicLoad: 0,
          knowledgeGap: session.knowledgeGap,
          difficulty: session.difficulty,
          urgency: session.urgency,
          adaptation: 0,
          score: session.priorityScore,
        },
      }),
    ),
  };
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ message: "Layanan akun belum tersedia." }, { status: 503 });
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ message: "Kamu perlu masuk terlebih dahulu." }, { status: 401 });
  let input: ReturnType<typeof enrichStudySessionsInputSchema.parse>;
  try {
    input = enrichStudySessionsInputSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ message: "Data sesi belum valid." }, { status: 400 });
  }
  if (!input.planId)
    return NextResponse.json({ message: "Rencana sesi belum terverifikasi." }, { status: 400 });
  const { data: semester } = await supabase
    .from("semesters")
    .select("id")
    .eq("user_id", authData.user.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!semester?.id) return NextResponse.json({ message: "Semester aktif belum tersedia." }, { status: 404 });
  const { data: plan } = await supabase
    .from("study_plans")
    .select("id, semester_id")
    .eq("id", input.planId)
    .eq("user_id", authData.user.id)
    .eq("semester_id", semester.id)
    .eq("status", "active")
    .maybeSingle();
  if (!plan || plan.semester_id !== semester.id) return NextResponse.json({ message: "Rencana sesi tidak ditemukan." }, { status: 404 });
  try {
    const result = await createGroqAiProvider().enrichStudySessions(input);
    const { data: storedSessions } = await supabase
      .from("study_sessions")
      .select("id, session_key")
      .eq("study_plan_id", input.planId)
      .eq("semester_id", semester.id)
      .eq("user_id", authData.user.id)
      .in("session_key", result.sessions.map((session) => session.sessionKey));
    const ids = new Map((storedSessions ?? []).map((session) => [session.session_key, session.id]));
    const updates = result.sessions
      .map((session) => ({
        id: ids.get(session.sessionKey),
        study_method: session.studyMethod,
        study_goal: session.goal,
        explanation: session.explanation,
      }))
      .filter((session): session is { id: string; study_method: string; study_goal: string; explanation: string } => Boolean(session.id));
    await Promise.all(
      updates.map((session) =>
        supabase
          .from("study_sessions")
          .update({
            study_method: session.study_method,
            study_goal: session.study_goal,
            explanation: session.explanation,
          })
          .eq("id", session.id)
          .eq("user_id", authData.user.id),
      ),
    );
    return NextResponse.json({ ...result, fallback: false });
  } catch {
    return NextResponse.json({ ...fallback(input), fallback: true });
  }
}
