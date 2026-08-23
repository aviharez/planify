import test from "node:test";
import assert from "node:assert/strict";
import { combineCalendarEvents, mapGoogleEventToCalendarEvent } from "./transform";

const source = {
  courses: [{ id: "c", code: "IF", name: "Basis Data", credits: 3, semester: 3 }],
  classSchedules: { c: [{ id: "r", day: "Senin", start: "09:00", end: "10:30" }] },
  sessions: [{ id: "s", sessionKey: "s", courseId: "c", courseCode: "IF", courseName: "Basis Data", date: "2026-08-24", startTime: "19:00", endTime: "19:45", duration: 45, status: "planned" as const, prioritySnapshot: { academicLoad: 0, knowledgeGap: 0, difficulty: 0, urgency: 0, adaptation: 0, score: 0 } }],
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

test("overlay Google eksternal read-only dan acara Planify dikecualikan", () => {
  const external = mapGoogleEventToCalendarEvent({ id: "external", summary: "Rapat organisasi", start: { dateTime: "2026-08-26T15:00:00+07:00" }, end: { dateTime: "2026-08-26T16:00:00+07:00" } });
  assert.equal(external?.source, "google");
  assert.equal(external?.editable, false);
  assert.equal(mapGoogleEventToCalendarEvent({ id: "managed", extendedProperties: { private: { planifyManaged: "true" } } }), null);
});
