import { z } from "zod";
import type { StudySession } from "@/features/onboarding/types";

export const enrichStudySessionsInputSchema = z.object({
  planId: z.string().uuid().optional(),
  sessions: z
    .array(
      z.object({
        sessionKey: z.string().min(1).max(120),
        courseName: z.string().min(1).max(180),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        duration: z.number().int().min(15).max(180),
        priorityScore: z.number().min(0).max(1),
        knowledgeGap: z.number().min(0).max(1),
        difficulty: z.number().min(0).max(1),
        urgency: z.number().min(0).max(1),
      }),
    )
    .min(1)
    .max(100)
    .superRefine((sessions, context) => {
      if (new Set(sessions.map((session) => session.sessionKey)).size !== sessions.length)
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Kunci sesi harus unik." });
    }),
});

export type EnrichStudySessionsInput = z.infer<typeof enrichStudySessionsInputSchema>;

export const enrichmentItemSchema = z.object({
  sessionKey: z.string().min(1).max(120),
  studyMethod: z.string().min(1).max(80),
  goal: z.string().min(1).max(360),
  explanation: z.string().min(1).max(420),
});

export type EnrichmentItem = z.infer<typeof enrichmentItemSchema>;

export const enrichStudySessionsResultSchema = z.object({
  sessions: z.array(enrichmentItemSchema),
});

export type EnrichStudySessionsResult = z.infer<typeof enrichStudySessionsResultSchema>;

export type AiProvider = {
  enrichStudySessions(input: EnrichStudySessionsInput): Promise<EnrichStudySessionsResult>;
};

const ENGLISH_WORDS = /\b(the|and|or|study|learn|learning|goal|method|because|you|your|session|review|practice|this|with|from)\b/i;

export function isNaturalIndonesian(value: string) {
  return value.trim().length > 0 && !ENGLISH_WORDS.test(value);
}

export function isValidEnrichment(value: unknown): value is EnrichStudySessionsResult {
  const result = enrichStudySessionsResultSchema.safeParse(value);
  return Boolean(
    result.success &&
      result.data.sessions.every(
        (session) =>
          isNaturalIndonesian(session.studyMethod) &&
          isNaturalIndonesian(session.goal) &&
          isNaturalIndonesian(session.explanation),
      ),
  );
}

export function fallbackEnrichment(session: Pick<StudySession, "sessionKey" | "courseName" | "prioritySnapshot">): EnrichmentItem {
  const { knowledgeGap, difficulty, urgency } = session.prioritySnapshot;
  const studyMethod = knowledgeGap >= 0.7
    ? "Mengingat Aktif"
    : difficulty >= 0.7
      ? "Latihan Konsep"
      : "Membuat Ringkasan";
  const goal = knowledgeGap >= 0.7
    ? `Tinjau materi ${session.courseName}, lalu jelaskan kembali gagasan utamanya tanpa melihat catatan.`
    : `Pelajari satu bagian ${session.courseName} dan tuliskan tiga hal penting yang kamu pahami.`;
  const explanation = urgency >= 0.5
    ? `${session.courseName} perlu dijaga ritmenya karena ada agenda akademik yang semakin dekat.`
    : difficulty >= 0.7
      ? `${session.courseName} mendapat waktu untuk membantu mengurai materi yang terasa menantang.`
      : `Sesi ini menjaga pemahaman ${session.courseName} tetap bertumbuh secara bertahap.`;
  return { sessionKey: session.sessionKey, studyMethod, goal, explanation };
}

export function fallbackEnrichments(sessions: StudySession[]) {
  return {
    sessions: sessions.map((session) => fallbackEnrichment(session)),
  } satisfies EnrichStudySessionsResult;
}

export function applyEnrichments(
  sessions: StudySession[],
  result: EnrichStudySessionsResult,
) {
  const byKey = new Map(result.sessions.map((session) => [session.sessionKey, session]));
  return sessions.map((session) => {
    const enrichment = byKey.get(session.sessionKey);
    return enrichment
      ? {
          ...session,
          studyMethod: enrichment.studyMethod,
          studyGoal: enrichment.goal,
          explanation: enrichment.explanation,
        }
      : session;
  });
}
