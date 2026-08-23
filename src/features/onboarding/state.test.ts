import test from "node:test";
import assert from "node:assert/strict";
import { mockCourses } from "./mock-data";
import { normalizeMockCourses } from "./normalize";
import { canAdvance, nextStep } from "./state";
import { initialOnboardingData } from "./types";

test("wizard hanya maju jika KRS dan mata kuliah tersedia", () => {
  assert.equal(canAdvance(initialOnboardingData), false);
  const ready = { ...initialOnboardingData, krsFileName: "krs.pdf", courses: mockCourses };
  assert.equal(canAdvance(ready), true);
  assert.equal(nextStep(ready).step, 1);
});

test("wizard tidak maju saat KRS masih diproses atau gagal", () => {
  const ready = {
    ...initialOnboardingData,
    krsFileName: "krs.pdf",
    courses: mockCourses,
  };
  assert.equal(
    canAdvance({ ...ready, krsExtraction: { ...initialOnboardingData.krsExtraction!, status: "processing" } }),
    false,
  );
  assert.equal(
    canAdvance({ ...ready, krsExtraction: { ...initialOnboardingData.krsExtraction!, status: "failed" } }),
    false,
  );
});

test("normalisasi mock KRS menghapus duplikasi identik dan menjaga konflik", () => {
  const [first] = mockCourses;
  const duplicate = { ...first, name: ` ${first.name.toLowerCase()} ` };
  const conflict = { ...first, id: "conflict", semester: 4 };
  const result = normalizeMockCourses([first, duplicate, conflict]);
  assert.equal(result.courses.length, 1);
  assert.equal(result.conflicts.length, 1);
});
