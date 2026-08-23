import test from "node:test";
import assert from "node:assert/strict";
import { initialOnboardingData, type OnboardingData } from "@/features/onboarding/types";
import { createNewSemesterSetup, nextSemesterName } from "./lifecycle";

test("semester baru hanya memakai preferensi umum", () => {
  const previous: OnboardingData = { ...initialOnboardingData, timezone: "Asia/Singapore", focusPeriods: ["Pagi", "Malam"], focusDuration: 90, activityDensity: "Padat", procrastination: "Sering", courses: [{ id: "c", code: "IF", name: "Basis Data", credits: 3, semester: 3 }], classSchedules: { c: [{ id: "class", day: "Senin", start: "09:00", end: "10:00" }] }, evaluations: { c: { understanding: 2, difficulty: 5 } }, academicEvents: [{ id: "event", courseId: "c", type: "UTS", title: "UTS", date: "2026-09-01", importance: 5, notes: "" }], availability: [{ id: "a", day: "Senin", start: "19:00", end: "21:00" }], planningSnapshot: { reason: "initial", generatedAt: "2026-08-23T00:00:00.000Z", planningPeriod: { start: "2026-08-24", end: "2026-09-20" }, weights: { academicLoad: 0.2, knowledgeGap: 0.2, difficulty: 0.2, urgency: 0.2, adaptation: 0.2 }, courseFactors: [], availability: [] }, studyPlan: {} as NonNullable<OnboardingData["studyPlan"]>, planActive: true };
  const next = createNewSemesterSetup(previous, true, "Genap 2026/2027");
  assert.equal(next.semester, "Genap 2026/2027");
  assert.equal(next.timezone, previous.timezone);
  assert.deepEqual(next.focusPeriods, previous.focusPeriods);
  assert.equal(next.focusDuration, previous.focusDuration);
  assert.equal(next.activityDensity, previous.activityDensity);
  assert.equal(next.procrastination, previous.procrastination);
  assert.deepEqual(next.availability, []);
  assert.equal(next.courses.length, 0);
  assert.deepEqual(next.classSchedules, {});
  assert.deepEqual(next.evaluations, {});
  assert.equal(next.academicEvents.length, 0);
  assert.equal(next.planningSnapshot, undefined);
  assert.equal(next.studyPlan, undefined);
  assert.equal(next.planActive, false);
});

test("nama semester berikutnya mengikuti kalender akademik dan menghindari duplikasi", () => {
  assert.equal(nextSemesterName("Ganjil 2026/2027", [], 2026), "Genap 2026/2027");
  assert.equal(nextSemesterName("Genap 2026/2027", [], 2026), "Ganjil 2027/2028");
  assert.equal(nextSemesterName("Ganjil 2026/2027", ["Genap 2026/2027"], 2026), "Ganjil 2027/2028");
  assert.equal(nextSemesterName(undefined, [], 2026), "Ganjil 2026/2027");
});
