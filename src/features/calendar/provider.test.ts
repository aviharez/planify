import test from "node:test";
import assert from "node:assert/strict";
import { CalendarProviderError, deterministicCalendarEventId, mapStudySessionToCalendarEvent, syncManagedEvents } from "./provider";

const session = { id: "row-1", sessionKey: "s-1", courseName: "Algoritma", date: "2026-08-25", startTime: "19:00", endTime: "19:45", studyGoal: "Latih konsep", status: "planned" as const };

test("pemetaan event menyimpan timezone dan metadata kepemilikan aplikasi", () => {
  const event = mapStudySessionToCalendarEvent(session, "Asia/Jakarta");
  assert.equal(event.start.dateTime, "2026-08-25T19:00:00");
  assert.equal(event.start.timeZone, "Asia/Jakarta");
  assert.equal(event.extendedProperties.private.planifyManaged, "true");
  assert.equal(event.extendedProperties.private.planifySessionKey, "s-1");
});

test("ID event deterministik dikirim di body insert untuk retry idempotent", async () => {
  let requestBody = "";
  const provider = new (class {
    async insert(_calendar: string, event: object, eventId: string) { requestBody = JSON.stringify({ ...event, id: eventId }); return { id: eventId }; }
    async update() { return {}; }
    async delete() {}
  })();
  await syncManagedEvents(provider, { sessions: [session], links: [], calendarId: "primary", timeZone: "Asia/Jakarta", today: "2026-08-24" });
  assert.equal(JSON.parse(requestBody).id, deterministicCalendarEventId("row-1"));
  assert.match(JSON.parse(requestBody).id, /^a[0-9a-f]{64}$/);
});

test("sinkronisasi meng-update link lama, membuat yang baru, dan menghapus hanya link app", async () => {
  const calls: string[] = [];
  const provider = {
    insert: async () => { calls.push("insert"); return { id: "google-new" }; },
    update: async (_calendar: string, eventId: string) => { calls.push(`update:${eventId}`); return { id: eventId }; },
    delete: async (_calendar: string, eventId: string) => { calls.push(`delete:${eventId}`); },
  };
  const result = await syncManagedEvents(provider, {
    sessions: [session, { ...session, id: "row-2", sessionKey: "s-2", date: "2026-08-26" }],
    links: [{ studySessionId: "row-1", sessionKey: "s-1", googleEventId: "google-old", googleCalendarId: "primary" }, { studySessionId: "row-old", sessionKey: "old", googleEventId: "google-stale", googleCalendarId: "primary", sessionDate: "2026-08-30" }],
    calendarId: "primary",
    timeZone: "Asia/Jakarta",
    today: "2026-08-24",
  });
  assert.deepEqual(calls, ["update:google-old", "insert", "delete:google-stale"]);
  assert.equal(result.inserts[0]?.eventId, "google-new");
  assert.equal(result.deletes[0]?.linkId, "row-old");
});

test("tautan sesi lampau dipertahankan saat rencana aktif berubah", async () => {
  const calls: string[] = [];
  const result = await syncManagedEvents({
    insert: async () => ({ id: "new" }), update: async () => ({}), delete: async (_calendar, eventId) => { calls.push(eventId); },
  }, {
    sessions: [],
    links: [{ studySessionId: "past", sessionKey: "past", googleEventId: "google-past", googleCalendarId: "primary", sessionDate: "2026-08-20" }],
    calendarId: "primary", timeZone: "Asia/Jakarta", today: "2026-08-24",
  });
  assert.deepEqual(calls, []);
  assert.deepEqual(result.deletes, []);
});

test("sesi terlewat masa depan tidak dibuat dan session link tidak dideduplikasi dari event eksternal", async () => {
  let inserts = 0;
  const result = await syncManagedEvents({
    insert: async () => { inserts += 1; return { id: "new" }; },
    update: async () => ({}),
    delete: async () => undefined,
  }, {
    sessions: [{ ...session, status: "missed" }],
    links: [], calendarId: "primary", timeZone: "Asia/Jakarta", today: "2026-08-24",
  });
  assert.equal(inserts, 0);
  assert.equal(result.inserts.length, 0);
});

test("kegagalan Google menghentikan rekonsiliasi tanpa menghapus link berikutnya", async () => {
  const calls: string[] = [];
  await assert.rejects(() => syncManagedEvents({
    insert: async () => { calls.push("insert"); throw new Error("network"); },
    update: async () => ({}),
    delete: async () => { calls.push("delete"); },
  }, {
    sessions: [session],
    links: [{ studySessionId: "row-old", sessionKey: "old", googleEventId: "google-stale", googleCalendarId: "primary" }],
    calendarId: "primary", timeZone: "Asia/Jakarta", today: "2026-08-24",
  }));
  assert.deepEqual(calls, ["insert"]);
});

test("409 insert dipulihkan hanya jika event yang sudah ada memiliki metadata Planify", async () => {
  const provider = {
    insert: async () => { throw new CalendarProviderError(409, "duplicate"); },
    get: async () => ({ id: deterministicCalendarEventId("row-1"), extendedProperties: { private: { planifyManaged: "true", planifySessionKey: "s-1" } } }),
    update: async () => ({}),
    delete: async () => undefined,
  };
  const result = await syncManagedEvents(provider, { sessions: [session], links: [], calendarId: "primary", timeZone: "Asia/Jakarta", today: "2026-08-24" });
  assert.equal(result.inserts[0]?.eventId, deterministicCalendarEventId("row-1"));
});
