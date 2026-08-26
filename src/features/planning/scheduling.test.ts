import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanningSnapshot } from "./priority";
import {
  calculateWeeklyCapacity,
  generateStudyPlan,
} from "./scheduling";
import type { Course, FocusPeriod, StudySession } from "@/features/onboarding/types";

const courses: Course[] = [
  { id: "a", name: "Algoritma", credits: 3 },
  { id: "b", name: "Basis Data", credits: 3 },
  { id: "c", name: "Sistem Operasi", credits: 3 },
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

test("rencana awal dimulai dari batas aktivasi dan tidak membawa sesi lama", () => {
  const oldSession: StudySession = {
    id: "old-session",
    sessionKey: "old-session",
    courseId: "a",
    courseName: "Algoritma",
    date: "2026-08-25",
    startTime: "19:00",
    endTime: "19:45",
    duration: 45,
    status: "completed",
    prioritySnapshot: { academicLoad: 0, knowledgeGap: 0, difficulty: 0, urgency: 0, adaptation: 0, score: 0 },
  };
  const plan = generateStudyPlan({
    courses,
    availability: [{ id: "wed", day: "Rabu", start: "18:00", end: "22:00" }],
    classSchedules: {},
    focusPeriods: ["Malam"],
    focusDuration: 45,
    activityDensity: "Seimbang",
    academicEvents: [],
    snapshot: buildPlanningSnapshot({ courses, evaluations: {}, academicEvents: [], availability: [] }, { today: "2026-08-26" }),
    today: "2026-08-26",
  });
  assert.equal(plan.planningPeriod.start, "2026-08-26");
  assert.equal(plan.sessions.some((session) => session.id === oldSession.id || session.date < "2026-08-26"), false);
});

test("setiap mata kuliah mendapat baseline dan prioritas mengatur waktu tambahan", () => {
  const manyCourses: Course[] = ["Algoritma", "Basis Data", "Sistem Operasi", "Jaringan", "Statistika"].map((name, index) => ({ id: `course-${index}`, name, credits: 3 }));
  const manySnapshot = buildPlanningSnapshot({
    courses: manyCourses,
    evaluations: Object.fromEntries(manyCourses.map((course, index) => [course.id, { understanding: index === 0 ? 5 : 2, difficulty: index === 0 ? 1 : 5 }])),
    academicEvents: [],
    availability: [{ id: "wide", day: "Senin", start: "08:00", end: "20:00" }, { id: "wide-2", day: "Selasa", start: "08:00", end: "20:00" }],
  }, { today: "2026-08-23" });
  const plan = generateStudyPlan({ courses: manyCourses, availability: manySnapshot.availability, classSchedules: {}, focusPeriods: ["Pagi", "Malam"], focusDuration: 45, activityDensity: "Cukup Longgar", academicEvents: [], snapshot: manySnapshot, today: "2026-08-23" });
  const weekly = new Map<string, number>();
  for (const session of plan.sessions) {
    const week = session.date <= "2026-08-29" ? "first" : "second";
    weekly.set(`${week}|${session.courseId}`, (weekly.get(`${week}|${session.courseId}`) ?? 0) + session.duration);
  }
  assert.ok(manyCourses.every((course) => (weekly.get(`first|${course.id}`) ?? 0) >= 30));
  assert.ok((weekly.get("first|course-1") ?? 0) > (weekly.get("first|course-0") ?? 0));
});

test("kapasitas terbatas memaksimalkan coverage 15 menit, deterministik, dan berotasi", () => {
  const limitedCourses: Course[] = ["A", "B", "C", "D", "E"].map((name, index) => ({ id: `limited-${index}`, name, credits: 3 }));
  const limitedSnapshot = buildPlanningSnapshot({ courses: limitedCourses, evaluations: {}, academicEvents: [], availability: [{ id: "short", day: "Senin", start: "18:00", end: "20:00" }] }, { today: "2026-08-23" });
  const input = { courses: limitedCourses, availability: limitedSnapshot.availability, classSchedules: {}, focusPeriods: ["Malam"] as FocusPeriod[], focusDuration: 45, activityDensity: "Cukup Longgar" as const, academicEvents: [], snapshot: limitedSnapshot, today: "2026-08-23" };
  const first = generateStudyPlan(input);
  const second = generateStudyPlan(input);
  assert.deepEqual(first, second);
  const maximumCoverage = Math.min(limitedCourses.length, Math.floor(first.weeklyCapacityMinutes / 15));
  const weekly = new Map<number, StudySession[]>();
  for (const session of first.sessions) {
    const week = Math.floor((Date.parse(`${session.date}T00:00:00Z`) - Date.parse("2026-08-23T00:00:00Z")) / 86_400_000 / 7);
    weekly.set(week, [...(weekly.get(week) ?? []), session]);
    assert.ok(session.duration >= 15);
  }
  assert.equal(weekly.size, 4);
  const courseCounts = new Map<string, number>();
  const courseSets: string[][] = [];
  for (const [week, sessions] of weekly) {
    const coursesThisWeek = [...new Set(sessions.map((session) => session.courseId))].sort();
    courseSets[week] = coursesThisWeek;
    assert.equal(coursesThisWeek.length, maximumCoverage);
    assert.ok(sessions.reduce((total, session) => total + session.duration, 0) <= first.weeklyCapacityMinutes);
    for (const courseId of coursesThisWeek) courseCounts.set(courseId, (courseCounts.get(courseId) ?? 0) + 1);
  }
  assert.ok(courseSets.slice(1).every((set, index) => JSON.stringify(set) !== JSON.stringify(courseSets[index])));
  assert.ok(Math.max(...courseCounts.values()) - Math.min(...courseCounts.values()) <= 1);
  for (const left of first.sessions) for (const right of first.sessions) {
    if (left.id === right.id || left.date !== right.date) continue;
    assert.ok(left.endTime <= right.startTime || right.endTime <= left.startTime);
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
