import test from "node:test";
import assert from "node:assert/strict";
import { initialOnboardingData, type OnboardingData } from "./types";
import { canOpenMainExperience, resolveLifecycle, resolvePlanAcknowledgement, resolvePreviewAcknowledgement, validatePlanCourseOwnership } from "./lifecycle";
import { createNewSemesterSetup } from "@/features/semester/lifecycle";

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

test("new-semester transition is pending until acknowledgement then active", () => {
  const oldActive = setup({ semester: "Ganjil 2026/2027", previewAcknowledgedAt: "2026-08-23T00:00:00.000Z" });
  const fresh = createNewSemesterSetup(oldActive, true, "Genap 2026/2027");
  const pending = {
    ...fresh,
    step: 5,
    krsFileName: "new-krs.pdf",
    courses: [{ id: "new", name: "Sistem Informasi", credits: 3 }],
    planActive: true,
    planningSnapshot: oldActive.planningSnapshot,
    studyPlan: {} as OnboardingData["studyPlan"],
    previewAcknowledgedAt: null,
  };
  assert.equal(resolveLifecycle(pending), "initial-plan/preview-pending");
  assert.equal(resolveLifecycle({ ...pending, previewAcknowledgedAt: "2026-08-24T00:00:00.000Z" }), "active-use");
});

test("explicit pending acknowledgement never inherits remote acknowledgement", () => {
  assert.equal(resolvePreviewAcknowledgement(null, "2026-08-24T00:00:00.000Z"), null);
  assert.equal(resolvePreviewAcknowledgement(undefined, "2026-08-24T00:00:00.000Z"), "2026-08-24T00:00:00.000Z");
});

test("acknowledgement retry reuses the existing remote timestamp", () => {
  assert.equal(resolvePlanAcknowledgement(null, "2026-08-24T00:00:00.000Z"), "2026-08-24T00:00:00.000Z");
  assert.equal(resolvePlanAcknowledgement("2026-08-23T00:00:00.000Z", "2026-08-24T00:00:00.000Z"), "2026-08-23T00:00:00.000Z");
});

test("ownership rencana menolak sesi dan faktor dari semester lain", () => {
  const current = setup({ planningSnapshot: { reason: "initial", generatedAt: "now", planningPeriod: { start: "2026-08-26", end: "2026-09-22" }, weights: { academicLoad: 0.2, knowledgeGap: 0.2, difficulty: 0.2, urgency: 0.2, adaptation: 0.2 }, courseFactors: [{ courseId: "old", name: "Lama", factors: { academicLoad: 0, knowledgeGap: 0, difficulty: 0, urgency: 0, adaptation: 0 }, score: 0 }], availability: [] } });
  const plan = { prioritySnapshot: { courseFactors: [{ courseId: "current", name: "Kini", factors: { academicLoad: 0, knowledgeGap: 0, difficulty: 0, urgency: 0, adaptation: 0 }, score: 0 }] }, sessions: [{ courseId: "current" }] } as unknown as NonNullable<OnboardingData["studyPlan"]>;
  assert.deepEqual(validatePlanCourseOwnership({ courses: [{ id: "current", name: "Kini", credits: 3 }], planningSnapshot: current.planningSnapshot }, plan), { ok: false, courseIds: ["old"] });
});

test("setup semester baru yang sudah diakui tetap memuat data plan", () => {
  const active = setup({
    semester: "Genap 2026/2027",
    courses: [{ id: "new-course", name: "Sistem Informasi", credits: 3 }],
    planActive: true,
    studyPlan: { id: "plan", sessions: [] } as unknown as OnboardingData["studyPlan"],
    planningSnapshot: { reason: "initial", generatedAt: "2026-08-23T00:00:00.000Z", planningPeriod: { start: "2026-08-24", end: "2026-09-20" }, weights: { academicLoad: 0.2, knowledgeGap: 0.2, difficulty: 0.2, urgency: 0.2, adaptation: 0.2 }, courseFactors: [], availability: [] },
    previewAcknowledgedAt: "2026-08-23T00:00:00.000Z",
  });
  assert.equal(active.semester, "Genap 2026/2027");
  assert.equal(active.courses.length, 1);
  assert.equal(active.planActive, true);
  assert.ok(active.studyPlan);
  assert.equal(canOpenMainExperience(active), true);
});
