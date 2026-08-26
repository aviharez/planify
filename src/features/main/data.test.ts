import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanningSnapshot } from "@/features/planning/priority";
import { generateStudyPlan } from "@/features/planning/scheduling";
import { initialOnboardingData, type OnboardingData } from "@/features/onboarding/types";
import { loadMainData, ONBOARDING_STORAGE_KEY } from "./data";

test("rencana lokal aktif tidak membuka main tanpa Supabase atau autentikasi", async () => {
  const courses = [{ id: "course-1", name: "Algoritma", credits: 3 }];
  const availability = [{ id: "senin", day: "Senin", start: "19:00", end: "22:00" }];
  const evaluations = { "course-1": { understanding: 3, difficulty: 3 } };
  const snapshot = buildPlanningSnapshot({ courses, evaluations, academicEvents: [], availability }, { today: "2026-08-23" });
  const studyPlan = generateStudyPlan({ courses, availability, classSchedules: {}, focusPeriods: ["Malam"], focusDuration: 45, activityDensity: "Seimbang", procrastination: "Kadang-kadang", academicEvents: [], snapshot, today: "2026-08-23" });
  const setup: OnboardingData = { ...initialOnboardingData, step: 5, timezone: "Etc/GMT-7", krsFileName: "download.pdf", courses, availability, evaluations, planActive: true, studyPlan };
  const legacySetup = { ...setup, courses: [{ ...courses[0], code: "IF-001", semester: 3 }] };
  const previousWindow = (globalThis as { window?: unknown }).window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => key === ONBOARDING_STORAGE_KEY ? JSON.stringify(legacySetup) : null } } });
  const fakeSupabase = { auth: { getUser: async () => ({ data: { user: null } }) } } as unknown as NonNullable<Parameters<typeof loadMainData>[0]>;
  try {
    const result = await loadMainData(fakeSupabase);
    assert.equal(result, null);
    assert.equal(await loadMainData(null), null);
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("main tidak memakai sesi lokal lama saat plan remote aktif belum memiliki sesi", async () => {
  const semesterId = "00000000-0000-4000-8000-000000000001";
  const planId = "00000000-0000-4000-8000-000000000002";
  const courses = [{ id: "current-course", name: "Skripsi", credits: 3 }];
  const availability = [{ id: "senin", day: "Senin", start: "19:00", end: "22:00" }];
  const snapshot = buildPlanningSnapshot({ courses, evaluations: {}, academicEvents: [], availability }, { today: "2026-08-26" });
  const generated = generateStudyPlan({ courses, availability, classSchedules: {}, focusPeriods: ["Malam"], focusDuration: 45, activityDensity: "Seimbang", academicEvents: [], snapshot, today: "2026-08-26" });
  const staleSession = { ...generated.sessions[0], courseId: "old-course", courseName: "Basis Data" };
  const setup: OnboardingData = { ...initialOnboardingData, step: 5, timezone: "Etc/GMT-7", krsFileName: "new-krs.pdf", courses, availability, planActive: true, previewAcknowledgedAt: "2026-08-26T00:00:00.000Z", planningSnapshot: snapshot, studyPlan: { ...generated, sessions: staleSession ? [staleSession] : [] } };
  const remotePlan = { id: planId, semester_id: semesterId, planning_period_start: generated.planningPeriod.start, planning_period_end: generated.planningPeriod.end, weekly_capacity_minutes: generated.weeklyCapacityMinutes, capacity_policy: generated.capacityPolicy, priority_snapshot: generated.prioritySnapshot, generated_at: generated.generatedAt, source_plan_id: null, adaptation_reason: null, change_summary: [], preview_acknowledged_at: "2026-08-26T00:00:00.000Z" };
  const query = (result: unknown) => {
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.in = () => chain;
    chain.maybeSingle = async () => ({ data: result, error: null });
    chain.then = (resolve, reject) => Promise.resolve({ data: result, error: null }).then(
      resolve as (value: unknown) => unknown,
      reject as ((reason: unknown) => unknown) | undefined,
    );
    return chain;
  };
  const fakeSupabase = {
    auth: { getUser: async () => ({ data: { user: { id: "user" } } }) },
    from: (table: string) => query(table === "semesters" ? { id: semesterId, setup_payload: setup } : table === "study_plans" ? remotePlan : []),
  } as unknown as NonNullable<Parameters<typeof loadMainData>[0]>;
  const result = await loadMainData(fakeSupabase);
  assert.ok(result);
  assert.equal(result.semesterId, semesterId);
  assert.deepEqual(result.setup.studyPlan?.sessions, []);
});
