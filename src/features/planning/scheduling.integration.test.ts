import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { KrsExtractionService } from "@/features/krs/extraction";
import { buildPlanningSnapshot } from "./priority";
import { generateStudyPlan } from "./scheduling";

test("download.pdf nyata memberi tujuh mata kuliah dan 21 SKS ke scheduler", async () => {
  const pdf = await readFile("download.pdf");
  const extraction = await new KrsExtractionService({
    extractText: async () => {
      throw new Error("OCR tidak boleh dipakai untuk PDF digital");
    },
  }).extract(new File([pdf], "download.pdf", { type: "application/pdf" }));
  assert.equal(extraction.candidates.length, 7);
  assert.equal(extraction.totalCredits, 21);
  const courses = extraction.candidates.map((course) => ({ ...course, id: course.code }));
  const availability = [
    { id: "mon", day: "Senin", start: "18:00", end: "22:00" },
    { id: "tue", day: "Selasa", start: "18:00", end: "22:00" },
    { id: "wed", day: "Rabu", start: "18:00", end: "22:00" },
    { id: "thu", day: "Kamis", start: "18:00", end: "22:00" },
    { id: "sat", day: "Sabtu", start: "09:00", end: "13:00" },
  ];
  const snapshot = buildPlanningSnapshot(
    {
      courses,
      evaluations: Object.fromEntries(courses.map((course, index) => [course.id, { understanding: (index % 5) + 1, difficulty: 5 - (index % 5) }])),
      academicEvents: [],
      availability,
    },
    { today: "2026-08-23" },
  );
  const plan = generateStudyPlan({
    courses,
    availability,
    classSchedules: {},
    focusPeriods: ["Malam"],
    focusDuration: 45,
    activityDensity: "Seimbang",
    academicEvents: [],
    snapshot,
    today: "2026-08-23",
  });
  assert.equal(plan.planningPeriod.end, "2026-09-19");
  assert.ok(plan.sessions.length > 0);
  assert.ok(plan.sessions.every((session) => courses.some((course) => course.id === session.courseId)));
});
