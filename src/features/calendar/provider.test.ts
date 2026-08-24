import test from "node:test";
import assert from "node:assert/strict";
import {
  CalendarProviderError,
  GoogleCalendarProvider,
  deterministicCalendarEventId,
  isFutureLocalSession,
  mapStudySessionToCalendarEvent,
  removeManagedFutureEvent,
  syncManagedEvents,
} from "./provider";

const timing = { today: "2026-08-24", currentTime: "19:00" };
const session = { id: "row-1", sessionKey: "s-1", courseName: "Algoritma", date: "2026-08-25", startTime: "19:00", endTime: "19:45", studyGoal: "Latih konsep", status: "planned" as const };
const owned = (sessionKey: string) => ({ id: "event", extendedProperties: { private: { planifyManaged: "true", planifySessionKey: sessionKey } } });

test("overlay Google hanya melakukan GET saat listing dan tidak menyentuh update atau delete", async () => {
  const calls: Array<{ method: string; url: string }> = [];
  const provider = new GoogleCalendarProvider("token", async (input, init) => {
    calls.push({ method: init?.method ?? "", url: String(input) });
    return new Response(JSON.stringify({ items: [{ id: "external" }] }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const listed = await provider.list("primary", "2026-08-24T00:00:00.000Z", "2026-08-31T00:00:00.000Z");
  assert.equal(listed.items?.[0]?.id, "external");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, "GET");
  assert.match(calls[0]?.url ?? "", /\/calendars\/primary\/events\?/);
  assert.equal(calls.some((call) => call.method === "PUT" || call.method === "DELETE"), false);
});

test("pemetaan event menyimpan timezone dan metadata kepemilikan aplikasi", () => {
  const event = mapStudySessionToCalendarEvent(session, "Etc/GMT-7");
  assert.equal(event.start.dateTime, "2026-08-25T19:00:00");
  assert.equal(event.start.timeZone, "Etc/GMT-7");
  assert.equal(event.extendedProperties.private.planifyManaged, "true");
  assert.equal(event.extendedProperties.private.planifySessionKey, "s-1");
});

test("masa depan memakai tanggal lokal dan waktu akhir sesi", () => {
  assert.equal(isFutureLocalSession("2026-08-23", "23:59", timing.today, timing.currentTime), false);
  assert.equal(isFutureLocalSession("2026-08-24", "19:00", timing.today, timing.currentTime), false);
  assert.equal(isFutureLocalSession("2026-08-24", "19:01", timing.today, timing.currentTime), true);
  assert.equal(isFutureLocalSession("2026-08-25", "00:01", timing.today, timing.currentTime), true);
});

test("ID event deterministik dikirim di body insert untuk retry idempotent", async () => {
  let requestBody = "";
  const provider = {
    async insert(_calendar: string, event: Record<string, unknown>, eventId: string) { requestBody = JSON.stringify({ ...event, id: eventId }); return { id: eventId }; },
    async update() { return {}; },
    async delete() {},
    async get() { return owned("s-1"); },
  };
  await syncManagedEvents(provider, { sessions: [session], links: [], calendarId: "primary", timeZone: "Etc/GMT-7", ...timing });
  assert.equal(JSON.parse(requestBody).id, deterministicCalendarEventId("row-1"));
  assert.match(JSON.parse(requestBody).id, /^a[0-9a-f]{64}$/);
});

test("sinkronisasi memverifikasi link, meng-update yang dimiliki, membuat baru, dan menghapus stale yang dimiliki", async () => {
  const calls: string[] = [];
  const provider = {
    insert: async () => { calls.push("insert"); return { id: "google-new" }; },
    get: async (_calendar: string, eventId: string) => { calls.push(`get:${eventId}`); return owned(eventId === "google-old" ? "s-1" : "old"); },
    update: async (_calendar: string, eventId: string) => { calls.push(`update:${eventId}`); return { id: eventId }; },
    delete: async (_calendar: string, eventId: string) => { calls.push(`delete:${eventId}`); },
  };
  const result = await syncManagedEvents(provider, {
    sessions: [session, { ...session, id: "row-2", sessionKey: "s-2", date: "2026-08-26" }],
    links: [{ studySessionId: "row-1", sessionKey: "s-1", googleEventId: "google-old", googleCalendarId: "primary", sessionDate: session.date, sessionEndTime: session.endTime }, { studySessionId: "row-old", sessionKey: "old", googleEventId: "google-stale", googleCalendarId: "primary", sessionDate: "2026-08-30", sessionEndTime: "19:00" }],
    calendarId: "primary", timeZone: "Etc/GMT-7", ...timing,
  });
  assert.deepEqual(calls, ["get:google-old", "update:google-old", "insert", "get:google-stale", "delete:google-stale"]);
  assert.equal(result.inserts[0]?.eventId, "google-new");
  assert.equal(result.deletes[0]?.outcome, "deleted");
});

test("link aktif korup tidak menyentuh event unmanaged dan dipindahkan ke ID deterministik", async () => {
  const calls: string[] = [];
  const deterministicId = deterministicCalendarEventId("row-1");
  const provider = {
    get: async (_calendar: string, eventId: string) => { calls.push(`get:${eventId}`); return eventId === "google-unmanaged" ? owned("other-session") : owned("s-1"); },
    insert: async (calendar: string, _event: Record<string, unknown>, eventId: string) => { calls.push(`insert:${calendar}:${eventId}`); return { id: eventId }; },
    update: async () => { calls.push("update"); return {}; },
    delete: async () => { calls.push("delete"); },
  };
  const result = await syncManagedEvents(provider, {
    sessions: [session],
    links: [{ studySessionId: "row-1", sessionKey: "s-1", googleEventId: "google-unmanaged", googleCalendarId: "malicious-calendar", sessionDate: session.date, sessionEndTime: session.endTime }],
    calendarId: "primary", timeZone: "Etc/GMT-7", ...timing,
  });
  assert.deepEqual(calls, [`get:google-unmanaged`, `insert:primary:${deterministicId}`]);
  assert.equal(result.updates[0]?.eventId, deterministicId);
  assert.equal(result.updates[0]?.calendarId, "primary");
});

test("stale unmanaged event tidak dihapus meski tautan lokal dihapus", async () => {
  const calls: string[] = [];
  const result = await syncManagedEvents({
    insert: async () => ({ id: "new" }),
    update: async () => ({}),
    get: async () => { calls.push("get"); return owned("different"); },
    delete: async () => { calls.push("delete"); },
  }, {
    sessions: [],
    links: [{ studySessionId: "old", sessionKey: "old", googleEventId: "external", googleCalendarId: "primary", sessionDate: "2026-08-30", sessionEndTime: "19:00" }],
    calendarId: "primary", timeZone: "Etc/GMT-7", ...timing,
  });
  assert.deepEqual(calls, ["get"]);
  assert.equal(result.deletes[0]?.outcome, "unmanaged");
});

test("tautan sesi lampau dan sesi yang sudah berakhir hari ini tidak disentuh Google", async () => {
  const calls: string[] = [];
  const result = await syncManagedEvents({
    insert: async () => ({ id: "new" }),
    update: async () => ({}),
    get: async () => { calls.push("get"); return owned("past"); },
    delete: async () => { calls.push("delete"); },
  }, {
    sessions: [],
    links: [
      { studySessionId: "past", sessionKey: "past", googleEventId: "google-past", googleCalendarId: "primary", sessionDate: "2026-08-20", sessionEndTime: "19:00" },
      { studySessionId: "today-past", sessionKey: "today-past", googleEventId: "google-today", googleCalendarId: "primary", sessionDate: "2026-08-24", sessionEndTime: "18:59" },
    ],
    calendarId: "primary", timeZone: "Etc/GMT-7", ...timing,
  });
  assert.deepEqual(calls, []);
  assert.deepEqual(result.deletes, []);
});

test("remove helper hanya menghapus event milik Planify yang masih akan datang", async () => {
  const calls: string[] = [];
  const target = { googleCalendarId: "primary", googleEventId: "google", sessionKey: "s-1", sessionDate: "2026-08-24", sessionEndTime: "19:30" };
  const unmanaged = await removeManagedFutureEvent({ get: async () => { calls.push("get"); return owned("other"); }, delete: async () => { calls.push("delete"); } }, target, timing);
  assert.equal(unmanaged, "unmanaged");
  assert.deepEqual(calls, ["get"]);
  const deleted = await removeManagedFutureEvent({ get: async () => owned("s-1"), delete: async () => { calls.push("delete-owned"); } }, target, timing);
  assert.equal(deleted, "deleted");
  assert.equal(calls.at(-1), "delete-owned");
});

test("409 insert dipulihkan hanya jika event deterministik memiliki metadata Planify yang sesuai", async () => {
  const provider = {
    insert: async () => { throw new CalendarProviderError(409, "duplicate"); },
    get: async () => ({ id: deterministicCalendarEventId("row-1"), extendedProperties: { private: { planifyManaged: "true", planifySessionKey: "s-1" } } }),
    update: async () => ({}),
    delete: async () => undefined,
  };
  const result = await syncManagedEvents(provider, { sessions: [session], links: [], calendarId: "primary", timeZone: "Etc/GMT-7", ...timing });
  assert.equal(result.inserts[0]?.eventId, deterministicCalendarEventId("row-1"));
});

test("kegagalan Google menghentikan rekonsiliasi tanpa menghapus link berikutnya", async () => {
  const calls: string[] = [];
  await assert.rejects(() => syncManagedEvents({
    insert: async () => { calls.push("insert"); throw new Error("network"); },
    get: async () => { calls.push("get"); return owned("s-1"); },
    update: async () => ({}),
    delete: async () => { calls.push("delete"); },
  }, { sessions: [session], links: [], calendarId: "primary", timeZone: "Etc/GMT-7", ...timing }));
  assert.deepEqual(calls, ["insert"]);
});
