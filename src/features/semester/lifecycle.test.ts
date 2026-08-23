import test from "node:test";
import assert from "node:assert/strict";
import { initialOnboardingData } from "@/features/onboarding/types";
import { createNewSemesterSetup, nextSemesterName } from "./lifecycle";

test("semester baru hanya memakai preferensi umum", () => {
  const previous = { ...initialOnboardingData, courses: [{ id: "c", code: "IF", name: "Basis Data", credits: 3, semester: 3 }], classSchedules: { c: [{ id: "class", day: "Senin", start: "09:00", end: "10:00" }] }, academicEvents: [{ id: "event", courseId: "c", type: "UTS" as const, title: "UTS", date: "2026-09-01", importance: 5 as const, notes: "" }], availability: [{ id: "a", day: "Senin", start: "19:00", end: "21:00" }], planActive: true };
  const next = createNewSemesterSetup(previous, true, "Genap 2026/2027");
  assert.equal(next.semester, "Genap 2026/2027");
  assert.deepEqual(next.availability.map(({ day, start, end }) => ({ day, start, end })), [{ day: "Senin", start: "19:00", end: "21:00" }]);
  assert.equal(next.courses.length, 0);
  assert.deepEqual(next.classSchedules, {});
  assert.equal(next.academicEvents.length, 0);
  assert.equal(next.planActive, false);
});

test("nama semester berikutnya mengikuti kalender akademik dan menghindari duplikasi", () => {
  assert.equal(nextSemesterName("Ganjil 2026/2027", [], 2026), "Genap 2026/2027");
  assert.equal(nextSemesterName("Genap 2026/2027", [], 2026), "Ganjil 2027/2028");
  assert.equal(nextSemesterName("Ganjil 2026/2027", ["Genap 2026/2027"], 2026), "Ganjil 2027/2028");
  assert.equal(nextSemesterName(undefined, [], 2026), "Ganjil 2026/2027");
});
