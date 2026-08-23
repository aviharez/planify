import test from "node:test";
import assert from "node:assert/strict";
import { calculateProgressMetrics, formatProgressMinutes, formatProgressPercent } from "./metrics";

const courses = [{ id: "a", code: "IF-001", name: "Algoritma", credits: 3, semester: 3 }];

test("metrik mingguan menghitung menit selesai tanpa mengarang durasi parsial", () => {
  const metrics = calculateProgressMetrics([
    { courseId: "a", courseName: "Algoritma", date: "2026-08-24", duration: 45, status: "completed" },
    { courseId: "a", courseName: "Algoritma", date: "2026-08-25", duration: 45, status: "partial" },
    { courseId: "a", courseName: "Algoritma", date: "2026-08-26", duration: 60, status: "missed" },
    { courseId: "a", courseName: "Algoritma", date: "2026-08-26", duration: 30, status: "planned" },
    { courseId: "a", courseName: "Algoritma", date: "2026-08-27", duration: 45, status: "planned" },
  ], courses, "2026-08-27");
  assert.equal(metrics.weekStart, "2026-08-24");
  assert.equal(metrics.plannedMinutes, 225);
  assert.equal(metrics.completedMinutes, 45);
  assert.deepEqual(metrics.counts, { completed: 1, missed: 1, partial: 1, planned: 2 });
  assert.equal(metrics.adherence, 1 / 4);
  assert.equal(metrics.consistency, 1 / 3);
});

test("metrik kosong jujur dan rangkuman format id-ID", () => {
  const metrics = calculateProgressMetrics([], courses, "2026-08-23");
  assert.equal(metrics.hasEnoughData, false);
  assert.equal(metrics.adherence, null);
  assert.equal(metrics.consistency, null);
  assert.equal(formatProgressMinutes(90), "1 jam 30 menit");
  assert.equal(formatProgressPercent(null), "—");
});

test("sinyal perhatian memakai feedback dan sinyal peningkatan butuh dua minggu", () => {
  const metrics = calculateProgressMetrics([
    { courseId: "a", courseName: "Algoritma", date: "2026-08-17", duration: 45, status: "completed", feedback: { understanding: 2, recordedAt: "2026-08-17T12:00:00.000Z" } },
    { courseId: "a", courseName: "Algoritma", date: "2026-08-24", duration: 45, status: "completed", feedback: { understanding: 4, recordedAt: "2026-08-24T12:00:00.000Z" } },
  ], courses, "2026-08-24");
  assert.equal(metrics.strongestImprovement?.courseId, "a");
  assert.equal(metrics.needsAttention, undefined);
});
