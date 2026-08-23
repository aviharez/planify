import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanningSnapshot } from "./priority";
import { adaptStudyPlan, calculateAdaptationSignals, resolveSourceSessionId, weeklyEvaluationSchema } from "./adaptation";
import { generateStudyPlan } from "./scheduling";
import type { OnboardingData } from "@/features/onboarding/types";

const data: Pick<OnboardingData, "courses" | "evaluations" | "academicEvents" | "availability" | "classSchedules" | "focusPeriods" | "focusDuration" | "activityDensity" | "procrastination"> = {
  courses: [
    { id: "a", code: "IF-001", name: "Algoritma", credits: 3, semester: 3 },
    { id: "b", code: "IF-002", name: "Basis Data", credits: 3, semester: 3 },
  ],
  evaluations: { a: { understanding: 2, difficulty: 4 }, b: { understanding: 4, difficulty: 2 } },
  academicEvents: [],
  availability: [
    { id: "mon", day: "Senin", start: "18:00", end: "22:00" },
    { id: "tue", day: "Selasa", start: "18:00", end: "22:00" },
    { id: "wed", day: "Rabu", start: "18:00", end: "22:00" },
  ],
  classSchedules: {},
  focusPeriods: ["Malam"],
  focusDuration: 45,
  activityDensity: "Seimbang",
  procrastination: "Kadang-kadang",
};

function makePlan() {
  const snapshot = buildPlanningSnapshot(data, { today: "2026-08-24" });
  return generateStudyPlan({
    ...data,
    academicEvents: [],
    snapshot,
    today: "2026-08-24",
  });
}

test("adaptasi memberi sinyal berbatas dan memindahkan beban terlewat ke slot masa depan", () => {
  const original = makePlan();
  const [first, second, ...future] = original.sessions;
  assert.ok(first && second);
  const plan = {
    ...original,
    sessions: [
      { ...first, date: "2026-08-23", status: "missed" as const },
      { ...second, date: "2026-08-23", status: "completed" as const, completedAt: "2026-08-23T13:00:00.000Z" },
      ...future,
    ],
  };
  const result = adaptStudyPlan({ data, plan, today: "2026-08-24", evaluation: { perceivedLoad: 3, realism: "Sebagian Besar" } });
  assert.ok(result.adaptationByCourse[first.courseId] <= 0.35);
  assert.equal(result.plan.sessions.find((session) => session.id === first.id)?.status, "missed");
  assert.equal(result.plan.sessions.find((session) => session.id === second.id)?.status, "completed");
  assert.ok(result.changes.some((change) => change.sourceSessionId === first.id) || result.noSlotCourseIds.includes(first.courseId));
  assert.ok(result.plan.sessions.every((session) => session.date >= "2026-08-23"));
  assert.deepEqual(adaptStudyPlan({ data, plan, today: "2026-08-24", evaluation: { perceivedLoad: 3, realism: "Sebagian Besar" } }).plan, result.plan);
});

test("evaluasi berat mengurangi kapasitas dan slot kosong dijelaskan", () => {
  const original = makePlan();
  const first = original.sessions[0];
  assert.ok(first);
  const noSlotPlan = {
    ...original,
    sessions: [{ ...first, date: "2026-08-23", status: "missed" as const }],
  };
  const result = adaptStudyPlan({
    data: { ...data, availability: [] },
    plan: noSlotPlan,
    today: "2026-08-24",
    evaluation: { perceivedLoad: 5, realism: "Tidak" },
  });
  assert.ok(result.noSlotCourseIds.includes(first.courseId));
  assert.match(result.plan.adaptationReason ?? "", /slot valid|diperbarui/);
  const signals = calculateAdaptationSignals(noSlotPlan, data.courses, "2026-08-24");
  assert.ok(Object.values(signals).every((value) => value >= 0 && value <= 0.35));
});

test("adaptasi menjaga batas sesi, jeda, harian, dan mingguan", () => {
  const original = makePlan();
  const first = original.sessions[0];
  assert.ok(first);
  const plan = {
    ...original,
    sessions: original.sessions.map((session, index) => index === 0 ? { ...session, date: "2026-08-23", status: "partial" as const } : session),
  };
  const result = adaptStudyPlan({ data, plan, today: "2026-08-24", evaluation: { perceivedLoad: 2, realism: "Ya" } });
  const future = result.plan.sessions.filter((session) => session.date >= "2026-08-24");
  for (const session of future) {
    const daily = future.filter((item) => item.date === session.date).reduce((total, item) => total + item.duration, 0);
    assert.ok(daily <= result.plan.capacityPolicy.dailyMaximumMinutes);
    assert.ok(session.date >= result.plan.planningPeriod.start && session.date <= result.plan.planningPeriod.end);
  }
  for (let index = 0; index < future.length; index += 1) {
    for (let other = index + 1; other < future.length; other += 1) {
      const a = future[index];
      const b = future[other];
      if (a.date !== b.date) continue;
      const startA = Number(a.startTime.slice(0, 2)) * 60 + Number(a.startTime.slice(3));
      const endA = Number(a.endTime.slice(0, 2)) * 60 + Number(a.endTime.slice(3));
      const startB = Number(b.startTime.slice(0, 2)) * 60 + Number(b.startTime.slice(3));
      const endB = Number(b.endTime.slice(0, 2)) * 60 + Number(b.endTime.slice(3));
      assert.equal(startA < endB && startB < endA, false);
      assert.ok(startA < startB ? endA + result.plan.capacityPolicy.minimumBreakMinutes <= startB : endB + result.plan.capacityPolicy.minimumBreakMinutes <= startA);
    }
  }
  const weekly = new Map<number, number>();
  for (const session of future) {
    const offset = Math.floor((Date.parse(`${session.date}T12:00:00Z`) - Date.parse("2026-08-24T12:00:00Z")) / 86_400_000 / 7);
    weekly.set(offset, (weekly.get(offset) ?? 0) + session.duration);
  }
  for (const minutes of weekly.values()) assert.ok(minutes <= result.plan.weeklyCapacityMinutes);
  assert.equal(result.plan.sessions.find((session) => session.id === first.id)?.status, "partial");
});

test("evaluasi mingguan menolak nilai di luar batas", () => {
  assert.equal(weeklyEvaluationSchema.safeParse({ perceivedLoad: 5, realism: "Ya" }).success, true);
  assert.equal(weeklyEvaluationSchema.safeParse({ perceivedLoad: 6, realism: "Ya" }).success, false);
  assert.equal(weeklyEvaluationSchema.safeParse({ perceivedLoad: 2, realism: "mungkin" }).success, false);
});

test("lineage UUID tetap terpetakan pada adaptasi berikutnya", () => {
  const sourceSessions = [{ id: "row-uuid", session_key: "session-2026-08-24-1800-a" }];
  assert.equal(resolveSourceSessionId(sourceSessions, "row-uuid", "new-key"), "row-uuid");
  assert.equal(resolveSourceSessionId(sourceSessions, undefined, sourceSessions[0].session_key), "row-uuid");
});

test("replanFuture mempertahankan sesi selesai dan mengganti pekerjaan masa depan", () => {
  const original = makePlan();
  const [completed, future] = original.sessions;
  assert.ok(completed && future);
  const oldFutureId = "future-old-session";
  const plan = {
    ...original,
    sessions: [
      { ...completed, date: "2026-08-23", status: "completed" as const, completedAt: "2026-08-23T13:00:00.000Z" },
      { ...future, id: oldFutureId, sessionKey: oldFutureId, date: "2026-08-25", status: "planned" as const },
    ],
  };
  const result = adaptStudyPlan({ data, plan, today: "2026-08-24", evaluation: { perceivedLoad: 3, realism: "Ya" }, replanFuture: true });
  assert.equal(result.plan.sessions.find((session) => session.id === completed.id)?.status, "completed");
  assert.equal(result.plan.sessions.some((session) => session.id === oldFutureId), false);
  assert.ok(result.plan.sessions.some((session) => session.date >= "2026-08-24" && session.status === "planned"));
});
