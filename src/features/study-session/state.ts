import { z } from "zod";
import type { SessionFeedback, StudySession, StudySessionStatus } from "@/features/onboarding/types";

export const sessionReasonSchema = z.enum([
  "Tidak cukup waktu",
  "Terlalu lelah",
  "Materinya terasa sulit",
  "Lupa",
  "Ada kegiatan mendadak",
  "Lainnya",
]);

export const sessionMutationSchema = z.object({
  planId: z.string().uuid().optional(),
  sessionKey: z.string().min(1).max(120),
  status: z.enum(["completed", "partial", "missed"]),
  reason: sessionReasonSchema.optional(),
  understanding: z.number().int().min(1).max(5).optional(),
}).superRefine((value, context) => {
  if ((value.status === "partial" || value.status === "missed") && !value.reason)
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "Alasan diperlukan untuk sesi ini." });
});

export function canTransitionSession(current: StudySessionStatus, next: StudySessionStatus) {
  if (current === "completed") return next === "completed";
  if (current === "missed") return next === "missed";
  if (current === "partial") return next === "partial" || next === "completed";
  return next === "completed" || next === "partial" || next === "missed";
}

export function transitionSession(
  session: StudySession,
  status: Exclude<StudySessionStatus, "planned">,
  feedback?: Omit<SessionFeedback, "recordedAt">,
  now = new Date().toISOString(),
) {
  if (!canTransitionSession(session.status, status))
    throw new Error("Status sesi tidak dapat diubah lagi.");
  return {
    ...session,
    status,
    completedAt: session.completedAt ?? now,
    feedback: feedback
      ? { ...feedback, recordedAt: now }
      : session.feedback,
  };
}

export function shouldAskUnderstanding(completedCount: number) {
  return completedCount >= 0 && (completedCount + 1) % 3 === 0;
}
