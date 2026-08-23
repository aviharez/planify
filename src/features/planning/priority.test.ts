import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlanningSnapshot,
  calculatePriority,
  dateInTimeZone,
  DEFAULT_PRIORITY_POLICY,
  normalizeUrgency,
  rankPriorities,
  validatePriorityPolicy,
} from "./priority";

test("bobot prioritas terpusat dan berjumlah satu", () => {
  assert.equal(validatePriorityPolicy(DEFAULT_PRIORITY_POLICY), true);
  assert.throws(() => validatePriorityPolicy({ ...DEFAULT_PRIORITY_POLICY, urgency: 0.3 }));
});

test("normalisasi faktor memakai cap SKS 5 dan rentang 0 sampai 1", () => {
  const result = calculatePriority(
    { courseId: "a", credits: 3, understanding: 1, difficulty: 5 },
    { today: "2026-08-23" },
  );
  assert.equal(result.factors.academicLoad, 0.6);
  assert.equal(result.factors.knowledgeGap, 1);
  assert.equal(result.factors.difficulty, 1);
  assert.equal(result.factors.adaptation, 0);
  assert.ok(result.finalScore <= 1);
});

test("urgensi mengikuti batas tanggal dan kepentingan", () => {
  const today = "2026-08-23";
  assert.equal(normalizeUrgency([], today), 0);
  assert.equal(normalizeUrgency([{ date: "2026-08-22", importance: 5 }], today), 0);
  assert.equal(normalizeUrgency([{ date: today, importance: 5 }], today), 1);
  assert.equal(normalizeUrgency([{ date: "2026-09-22", importance: 5 }], today), 0);
  assert.ok(
    normalizeUrgency([{ date: "2026-08-30", importance: 5 }], today) >
      normalizeUrgency([{ date: "2026-09-15", importance: 5 }], today),
  );
});

test("tanggal prioritas mengikuti zona waktu pengguna", () => {
  const instant = new Date("2026-08-23T23:30:00.000Z");
  assert.equal(dateInTimeZone(instant, "Asia/Jakarta"), "2026-08-24");
  assert.equal(dateInTimeZone(instant, "America/Los_Angeles"), "2026-08-23");
});

test("pemeringkatan stabil dan snapshot menyimpan rincian yang dapat dijelaskan", () => {
  const ranked = rankPriorities([
    calculatePriority({ courseId: "b", code: "IF-002", credits: 3 }, { today: "2026-08-23" }),
    calculatePriority({ courseId: "a", code: "IF-001", credits: 3 }, { today: "2026-08-23" }),
  ]);
  assert.deepEqual(ranked.map((item) => item.code), ["IF-001", "IF-002"]);
  const snapshot = buildPlanningSnapshot(
    {
      courses: [{ id: "a", code: "IF-001", name: "Algoritma", credits: 3, semester: 3 }],
      evaluations: { a: { understanding: 2, difficulty: 4 } },
      academicEvents: [],
      availability: [],
    },
    { today: "2026-08-23" },
  );
  assert.equal(snapshot.weights.knowledgeGap, 0.3);
  assert.equal(snapshot.courseFactors[0].factors.knowledgeGap, 0.75);
  assert.equal(snapshot.planningPeriod.end, "2026-09-19");
});
