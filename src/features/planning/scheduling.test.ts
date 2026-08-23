import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanningSnapshot } from "./priority";
import {
  calculateWeeklyCapacity,
  generateStudyPlan,
} from "./scheduling";
import type { Course, FocusPeriod, StudySession } from "@/features/onboarding/types";

const courses: Course[] = [
  { id: "a", code: "IF-001", name: "Algoritma", credits: 3, semester: 3 },
  { id: "b", code: "IF-002", name: "Basis Data", credits: 3, semester: 3 },
  { id: "c", code: "IF-003", name: "Sistem Operasi", credits: 3, semester: 3 },
];

function snapshot() {
  return buildPlanningSnapshot(
    {
      courses,
      evaluations: {
        a: { understanding: 2, difficulty: 4 },
        b: { understanding: 3, difficulty: 3 },
        c: { understanding: 1, difficulty: 5 },
      },
      academicEvents: [
        { id: "event", courseId: "c", type: "UTS", title: "UTS", date: "2026-08-30", importance: 5, notes: "" },
      ],
      availability: [
        { id: "mon", day: "Senin", start: "18:00", end: "22:00" },
        { id: "wed", day: "Rabu", start: "18:00", end: "22:00" },
        { id: "sat", day: "Sabtu", start: "09:00", end: "13:00" },
      ],
    },
    { today: "2026-08-23" },
  );
}

test("kapasitas aman memakai kepadatan dan tidak mengisi semua waktu", () => {
  const availability = [{ id: "mon", day: "Senin", start: "18:00", end: "22:00" }];
  const longgar = calculateWeeklyCapacity(availability, "Cukup Longgar");
  const padat = calculateWeeklyCapacity(availability, "Sangat Padat");
  assert.equal(longgar.availableMinutes, 240);
  assert.ok(longgar.weeklyCapacityMinutes < longgar.availableMinutes);
  assert.ok(padat.weeklyCapacityMinutes < longgar.weeklyCapacityMinutes);
});

test("jadwal menghormati kelas, sesi tersimpan, batas harian, dan empat minggu", () => {
  const preserved: StudySession = {
    id: "existing",
    sessionKey: "existing",
    courseId: "a",
    courseCode: "IF-001",
    courseName: "Algoritma",
    date: "2026-08-24",
    startTime: "18:00",
    endTime: "18:45",
    duration: 45,
    status: "completed",
    prioritySnapshot: { academicLoad: 0.6, knowledgeGap: 0.75, difficulty: 0.75, urgency: 0, adaptation: 0, score: 0.6 },
  };
  const plan = generateStudyPlan({
    courses,
    availability: [
      { id: "mon", day: "Senin", start: "18:00", end: "22:00" },
      { id: "wed", day: "Rabu", start: "18:00", end: "22:00" },
    ],
    classSchedules: { a: [{ id: "class", day: "Senin", start: "19:00", end: "20:00" }] },
    focusPeriods: ["Malam"],
    focusDuration: 90,
    activityDensity: "Seimbang",
    academicEvents: [],
    snapshot: snapshot(),
    today: "2026-08-23",
    preservedSessions: [preserved],
  });
  assert.equal(plan.sessions[0]?.id, "existing");
  assert.ok(plan.sessions.every((session) => session.date >= "2026-08-23" && session.date <= "2026-09-19"));
  assert.ok(plan.sessions.every((session) => session.duration <= 90));
  const daily = new Map<string, number>();
  for (const session of plan.sessions) daily.set(session.date, (daily.get(session.date) ?? 0) + session.duration);
  assert.ok([...daily.values()].every((total) => total <= 180));
  for (const session of plan.sessions.filter((item) => item.status === "planned")) {
    assert.equal(
      session.date === "2026-08-24" && session.startTime < "20:00" && session.endTime > "19:00",
      false,
    );
  }
});

test("alokasi stabil, terdistribusi, dan mengutamakan mata kuliah mendesak", () => {
  const input = {
    courses,
    availability: snapshot().availability,
    classSchedules: {},
    focusPeriods: ["Pagi", "Malam"] as FocusPeriod[],
    focusDuration: 45,
    activityDensity: "Cukup Longgar" as const,
    academicEvents: [{ id: "event", courseId: "c", type: "UTS" as const, title: "UTS", date: "2026-08-30", importance: 5 as const, notes: "" }],
    snapshot: snapshot(),
    today: "2026-08-23",
  };
  const first = generateStudyPlan(input);
  const second = generateStudyPlan(input);
  assert.deepEqual(first, second);
  assert.ok(new Set(first.sessions.map((session) => session.date)).size > 1);
  assert.ok(first.sessions.some((session) => session.courseId === "c"));
});
