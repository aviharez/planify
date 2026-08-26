import test from "node:test";
import assert from "node:assert/strict";
import { calendarRangeToUtc, combineCalendarEvents, groupMonthEvents, mapGoogleEventToCalendarEvent } from "./transform";

const source = {
  courses: [{ id: "c", name: "Basis Data", credits: 3 }],
  classSchedules: { c: [{ id: "r", day: "Senin", start: "09:00", end: "10:30" }] },
  sessions: [{ id: "s", sessionKey: "s", courseId: "c", courseName: "Basis Data", date: "2026-08-24", startTime: "19:00", endTime: "19:45", duration: 45, status: "planned" as const, prioritySnapshot: { academicLoad: 0, knowledgeGap: 0, difficulty: 0, urgency: 0, adaptation: 0, score: 0 } }],
  academicEvents: [{ id: "e", courseId: "c", type: "UTS" as const, title: "UTS Basis Data", date: "2026-08-25", importance: 5 as const, notes: "Bab 1-4" }],
};

test("jadwal kelas berulang, sesi, dan agenda digabung lalu diurutkan", () => {
  const events = combineCalendarEvents(source, { start: "2026-08-24", end: "2026-08-30" });
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.category), ["class", "study", "exam"]);
  assert.equal(events[0].date, "2026-08-24");
  assert.equal(events[0].editable, true);
});

test("recurrence dan batas tanggal tidak bergantung pada zona waktu mesin", () => {
  const events = combineCalendarEvents(source, { start: "2026-08-31", end: "2026-09-06" });
  assert.equal(events.filter((event) => event.category === "class").length, 1);
  assert.equal(events.some((event) => event.date < "2026-08-31"), false);
});

test("agenda Planify dari kursus semester lama tidak masuk kalender aktif", () => {
  const events = combineCalendarEvents({
    ...source,
    academicEvents: [...source.academicEvents, { id: "old", courseId: "old-course", type: "UTS", title: "Ujian lama", date: "2026-08-26", importance: 5, notes: "" }],
  }, { start: "2026-08-24", end: "2026-08-30" });
  assert.equal(events.some((event) => event.title === "Ujian lama"), false);
});

test("overlay Google eksternal read-only dan acara Planify dikecualikan", () => {
  const external = mapGoogleEventToCalendarEvent({ id: "external", summary: "Rapat organisasi", start: { dateTime: "2026-08-26T15:00:00+07:00" }, end: { dateTime: "2026-08-26T16:00:00+07:00" } }, "Etc/GMT-7");
  assert.equal(external?.source, "google");
  assert.equal(external?.editable, false);
  assert.equal(mapGoogleEventToCalendarEvent({ id: "managed", extendedProperties: { private: { planifyManaged: "true" } } }), null);
});

test("month view mengelompokkan kuliah, belajar, agenda, dan ujian", () => {
  const events = [
    { id: "class", source: "planify" as const, category: "class" as const, title: "Kuliah", date: "2026-08-24", editable: true },
    { id: "class-2", source: "planify" as const, category: "class" as const, title: "Kuliah lain", date: "2026-08-24", editable: true },
    { id: "study", source: "planify" as const, category: "study" as const, title: "Belajar", date: "2026-08-24", editable: true },
    { id: "exam", source: "planify" as const, category: "exam" as const, title: "Ujian", date: "2026-08-24", editable: true },
  ];
  const indicators = groupMonthEvents(events)["2026-08-24"];
  assert.deepEqual(indicators?.map((group) => group.category), ["class", "study", "exam"]);
  assert.equal(indicators?.[0]?.count, 2);
});

test("Google Calendar ditampilkan di zona non-UTC tanpa memotong offset", () => {
  const plusSeven = mapGoogleEventToCalendarEvent({ id: "plus-seven", start: { dateTime: "2026-08-26T15:00:00+07:00" }, end: { dateTime: "2026-08-26T16:00:00+07:00" } }, "Etc/GMT-7");
  const plusNine = mapGoogleEventToCalendarEvent({ id: "plus-nine", start: { dateTime: "2026-08-26T09:00:00+09:00" } }, "Etc/GMT-7");
  const utc = mapGoogleEventToCalendarEvent({ id: "utc", start: { dateTime: "2026-08-26T01:00:00Z" } }, "Etc/GMT-7");
  const midnight = mapGoogleEventToCalendarEvent({ id: "midnight", start: { dateTime: "2026-08-23T17:30:00Z" } }, "Etc/GMT-7");
  const allDay = mapGoogleEventToCalendarEvent({ id: "all-day", start: { date: "2026-08-26" }, end: { date: "2026-08-27" } }, "Etc/GMT-7");
  assert.deepEqual({ date: plusSeven?.date, startTime: plusSeven?.startTime }, { date: "2026-08-26", startTime: "15:00" });
  assert.equal(plusNine?.startTime, "07:00");
  assert.equal(utc?.startTime, "08:00");
  assert.deepEqual({ date: midnight?.date, startTime: midnight?.startTime }, { date: "2026-08-24", startTime: "00:30" });
  assert.equal(allDay?.startTime, undefined);
});

test("rentang Google Calendar mengikuti tengah malam lokal", () => {
  assert.deepEqual(calendarRangeToUtc("2026-08-24", "2026-08-30", "Etc/GMT-7"), { start: "2026-08-23T17:00:00.000Z", end: "2026-08-30T16:59:59.999Z" });
  assert.deepEqual(calendarRangeToUtc("2026-10-04", "2026-10-04", "Australia/Sydney"), { start: "2026-10-03T14:00:00.000Z", end: "2026-10-04T12:59:59.999Z" });
});
