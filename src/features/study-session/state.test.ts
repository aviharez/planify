import test from "node:test";
import assert from "node:assert/strict";
import { canTransitionSession, sessionMutationSchema, shouldAskUnderstanding, transitionSession } from "./state";
import type { StudySession } from "@/features/onboarding/types";

const session: StudySession = {
  id: "one",
  sessionKey: "one",
  courseId: "a",
  courseName: "Algoritma",
  date: "2026-08-24",
  startTime: "19:00",
  endTime: "19:45",
  duration: 45,
  status: "planned",
  prioritySnapshot: { academicLoad: 0.6, knowledgeGap: 0.5, difficulty: 0.5, urgency: 0, adaptation: 0, score: 0.5 },
};

test("transisi sesi menjaga riwayat dan alasan tervalidasi", () => {
  assert.equal(canTransitionSession("completed", "missed"), false);
  assert.equal(canTransitionSession("planned", "partial"), true);
  const updated = transitionSession(session, "partial", { reason: "Terlalu lelah" }, "2026-08-24T13:00:00.000Z");
  assert.equal(updated.status, "partial");
  assert.equal(updated.feedback?.reason, "Terlalu lelah");
  assert.throws(() => transitionSession({ ...updated, status: "completed" }, "missed"));
});

test("umpan balik pemahaman hanya muncul setiap sesi ketiga", () => {
  assert.equal(shouldAskUnderstanding(0), false);
  assert.equal(shouldAskUnderstanding(1), false);
  assert.equal(shouldAskUnderstanding(2), true);
  assert.equal(shouldAskUnderstanding(5), true);
  assert.equal(sessionMutationSchema.safeParse({ sessionKey: "one", status: "partial", reason: "Lupa" }).success, true);
  assert.equal(sessionMutationSchema.safeParse({ sessionKey: "one", status: "partial", reason: "invalid" }).success, false);
});
