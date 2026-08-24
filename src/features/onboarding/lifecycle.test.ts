import test from "node:test";
import assert from "node:assert/strict";
import { initialOnboardingData, type OnboardingData } from "./types";
import { canOpenMainExperience, resolveLifecycle } from "./lifecycle";

function setup(patch: Partial<OnboardingData>): OnboardingData {
  return { ...initialOnboardingData, krsFileName: "krs.pdf", courses: [{ id: "c", name: "Basis Data", credits: 3 }], step: 5, planActive: true, studyPlan: {} as OnboardingData["studyPlan"], ...patch };
}

test("lifecycle membedakan setup, plan baru, preview, dan penggunaan aktif", () => {
  assert.equal(resolveLifecycle({ ...setup({ step: 2, planActive: false, studyPlan: undefined }) }), "setup-incomplete");
  assert.equal(resolveLifecycle({ ...setup({ planActive: false, studyPlan: undefined }) }), "setup-complete/no-plan");
  assert.equal(resolveLifecycle({ ...setup({ previewAcknowledgedAt: null }) }), "initial-plan/preview-pending");
  assert.equal(resolveLifecycle({ ...setup({ previewAcknowledgedAt: "2026-08-23T00:00:00.000Z" }) }), "active-use");
});

test("payload lama tanpa acknowledgement tetap dianggap aktif", () => {
  assert.equal(resolveLifecycle(setup({ previewAcknowledgedAt: undefined })), "active-use");
});

test("logout dan login tidak mengubah lifecycle plan yang sudah diakui", () => {
  const active = setup({ previewAcknowledgedAt: "2026-08-23T00:00:00.000Z" });
  assert.equal(resolveLifecycle(active), resolveLifecycle({ ...active }));
});

test("main experience hanya terbuka setelah preview diakui", () => {
  assert.equal(canOpenMainExperience(setup({ previewAcknowledgedAt: null })), false);
  assert.equal(canOpenMainExperience(setup({ previewAcknowledgedAt: "2026-08-23T00:00:00.000Z" })), true);
});
