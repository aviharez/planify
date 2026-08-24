import test from "node:test";
import assert from "node:assert/strict";
import { canAdvance, nextStep, onboardingDataSchema } from "./state";
import { initialOnboardingData } from "./types";

test("wizard hanya maju jika KRS dan mata kuliah tersedia", () => {
  assert.equal(canAdvance(initialOnboardingData), false);
  const ready = {
    ...initialOnboardingData,
    krsFileName: "krs.pdf",
    courses: [{ id: "a", name: "Algoritma", credits: 3 }],
  };
  assert.equal(canAdvance(ready), true);
  assert.equal(nextStep(ready).step, 1);
});

test("wizard tidak maju saat KRS masih diproses atau gagal", () => {
  const ready = {
    ...initialOnboardingData,
    krsFileName: "krs.pdf",
    courses: [{ id: "a", name: "Algoritma", credits: 3 }],
  };
  assert.equal(canAdvance({ ...ready, krsExtraction: { ...initialOnboardingData.krsExtraction!, status: "processing" } }), false);
  assert.equal(canAdvance({ ...ready, krsExtraction: { ...initialOnboardingData.krsExtraction!, status: "failed" } }), false);
});

test("payload lama dinormalisasi menjadi state kanonik tanpa kode atau demo", () => {
  const result = onboardingDataSchema.safeParse({
    ...initialOnboardingData,
    timezone: "Etc/GMT-7",
    courses: [{ id: "a", code: "IF-001", semester: 3, status: "Approved", name: " Algoritma ", credits: 3 }],
    krsExtraction: { ...initialOnboardingData.krsExtraction!, source: "demo" },
    planningSnapshot: undefined,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.courses, [{ id: "a", name: " Algoritma ", credits: 3 }]);
    assert.equal(result.data.krsExtraction?.source, "manual");
    assert.equal("code" in result.data.courses[0], false);
  }
});
