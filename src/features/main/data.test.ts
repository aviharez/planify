import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanningSnapshot } from "@/features/planning/priority";
import { generateStudyPlan } from "@/features/planning/scheduling";
import { initialOnboardingData, type OnboardingData } from "@/features/onboarding/types";
import { loadMainData, ONBOARDING_STORAGE_KEY } from "./data";

test("akun yang sudah sign-out tetap dapat membuka rencana lokal saat Supabase terkonfigurasi", async () => {
  const courses = [{ id: "course-1", code: "IF-001", name: "Algoritma", credits: 3, semester: 3 }];
  const availability = [{ id: "senin", day: "Senin", start: "19:00", end: "22:00" }];
  const evaluations = { "course-1": { understanding: 3, difficulty: 3 } };
  const snapshot = buildPlanningSnapshot({ courses, evaluations, academicEvents: [], availability }, { today: "2026-08-23" });
  const studyPlan = generateStudyPlan({ courses, availability, classSchedules: {}, focusPeriods: ["Malam"], focusDuration: 45, activityDensity: "Seimbang", procrastination: "Kadang-kadang", academicEvents: [], snapshot, today: "2026-08-23" });
  const setup: OnboardingData = { ...initialOnboardingData, step: 5, timezone: "Asia/Jakarta", krsFileName: "download.pdf", courses, availability, evaluations, planActive: true, studyPlan };
  const previousWindow = (globalThis as { window?: unknown }).window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => key === ONBOARDING_STORAGE_KEY ? JSON.stringify(setup) : null } } });
  const fakeSupabase = { auth: { getUser: async () => ({ data: { user: null } }) } } as unknown as NonNullable<Parameters<typeof loadMainData>[0]>;
  try {
    const result = await loadMainData(fakeSupabase);
    assert.equal(result?.authenticated, false);
    assert.equal(result?.setup.studyPlan?.id, studyPlan.id);
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});
