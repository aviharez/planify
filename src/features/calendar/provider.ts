import { createHash } from "node:crypto";
import type { StudySession } from "@/features/onboarding/types";

export type CalendarEvent = {
  id?: string;
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  extendedProperties: { private: Record<string, string> };
};

export type GoogleCalendarEvent = {
  id?: string;
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
};

export type GoogleCalendarListResponse = { items?: GoogleCalendarEvent[]; nextPageToken?: string };

export type CalendarEventLink = {
  studySessionId: string;
  sessionKey: string;
  googleEventId: string;
  googleCalendarId: string;
  sessionDate?: string;
  sessionEndTime?: string;
};

type FetchLike = typeof fetch;

export class CalendarProviderError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function deterministicCalendarEventId(studySessionId: string) {
  return `a${createHash("sha256").update(studySessionId).digest("hex")}`;
}

function eventFromSession(
  session: Pick<StudySession, "sessionKey" | "courseName" | "date" | "startTime" | "endTime" | "studyGoal">,
  timeZone: string,
): CalendarEvent {
  const ownership = { planifyManaged: "true", planifySessionKey: session.sessionKey };
  return {
    summary: `Belajar — ${session.courseName}`,
    description: session.studyGoal ?? "Sesi belajar dari Planify.",
    start: { dateTime: `${session.date}T${session.startTime}:00`, timeZone },
    end: { dateTime: `${session.date}T${session.endTime}:00`, timeZone },
    extendedProperties: { private: ownership },
  };
}

export function mapStudySessionToCalendarEvent(
  session: Pick<StudySession, "sessionKey" | "courseName" | "date" | "startTime" | "endTime" | "studyGoal">,
  timeZone: string,
) {
  return eventFromSession(session, timeZone);
}

export function isManagedEventForSession(event: GoogleCalendarEvent | CalendarEvent, sessionKey: string) {
  const privateProperties = event.extendedProperties?.private;
  return privateProperties?.planifyManaged === "true" && privateProperties.planifySessionKey === sessionKey;
}

export function timeInTimeZone(now: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.hour === "24" ? "00" : values.hour}:${values.minute}`;
  } catch {
    return now.toISOString().slice(11, 16);
  }
}

export function isFutureLocalSession(
  date: string | undefined,
  endTime: string | undefined,
  today: string,
  currentTime: string,
) {
  if (!date || !endTime) return false;
  const localDate = date.slice(0, 10);
  if (localDate > today) return true;
  if (localDate < today) return false;
  return endTime.slice(0, 5) > currentTime.slice(0, 5);
}

export class GoogleCalendarProvider {
  constructor(private readonly accessToken: string, private readonly fetchImpl: FetchLike = fetch) {}

  private async request(path: string, init: RequestInit = {}) {
    const response = await this.fetchImpl(`https://www.googleapis.com/calendar/v3${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.accessToken}`, "content-type": "application/json", ...(init.headers ?? {}) },
    });
    if (!response.ok) throw new CalendarProviderError(response.status, `Google Calendar meminta percobaan ulang (${response.status}).`);
    return response.status === 204 ? null : response.json();
  }

  insert(calendarId: string, event: CalendarEvent, eventId?: string) {
    return this.request(`/calendars/${encodeURIComponent(calendarId)}/events`, { method: "POST", body: JSON.stringify(eventId ? { ...event, id: eventId } : event) }) as Promise<{ id?: string }>;
  }

  update(calendarId: string, eventId: string, event: CalendarEvent) {
    return this.request(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "PUT", body: JSON.stringify(event) }) as Promise<{ id?: string }>;
  }

  delete(calendarId: string, eventId: string) {
    return this.request(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
  }

  get(calendarId: string, eventId: string) {
    return this.request(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`) as Promise<GoogleCalendarEvent>;
  }

  list(calendarId: string, timeMin: string, timeMax: string) {
    const params = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", maxResults: "250", timeMin, timeMax });
    return this.request(`/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`, { method: "GET" }) as Promise<GoogleCalendarListResponse>;
  }
}

export type CalendarProviderClient = Pick<GoogleCalendarProvider, "insert" | "update" | "delete" | "get">;

export type ManagedEventTarget = {
  googleCalendarId: string;
  googleEventId: string;
  sessionKey: string;
  sessionDate?: string;
  sessionEndTime?: string;
};

export type ManagedEventRemoval = "deleted" | "missing" | "unmanaged" | "not-future";

export function isReconciledManagedEvent(outcome: ManagedEventRemoval) {
  return outcome === "deleted" || outcome === "missing";
}

/** Deletes only a verified Planify event that has not ended in the user's local time. */
export async function removeManagedFutureEvent(
  provider: Pick<GoogleCalendarProvider, "get" | "delete">,
  target: ManagedEventTarget,
  timing: { today: string; currentTime: string },
): Promise<ManagedEventRemoval> {
  if (!isFutureLocalSession(target.sessionDate, target.sessionEndTime, timing.today, timing.currentTime)) return "not-future";
  let existing: GoogleCalendarEvent;
  try {
    existing = await provider.get(target.googleCalendarId, target.googleEventId);
  } catch (error) {
    if (error instanceof CalendarProviderError && error.status === 404) return "missing";
    throw error;
  }
  if (!isManagedEventForSession(existing, target.sessionKey)) return "unmanaged";
  try {
    await provider.delete(target.googleCalendarId, target.googleEventId);
  } catch (error) {
    if (error instanceof CalendarProviderError && error.status === 404) return "missing";
    throw error;
  }
  return "deleted";
}

export type SyncInput = {
  sessions: Array<Pick<StudySession, "id" | "sessionKey" | "courseName" | "date" | "startTime" | "endTime" | "studyGoal" | "status">>;
  links: CalendarEventLink[];
  calendarId: string;
  timeZone: string;
  today: string;
  currentTime: string;
};

async function createDeterministicEvent(provider: CalendarProviderClient, input: SyncInput, session: SyncInput["sessions"][number], event: CalendarEvent) {
  const eventId = deterministicCalendarEventId(session.id);
  const created = await provider.insert(input.calendarId, event, eventId).catch(async (error) => {
    if (!(error instanceof CalendarProviderError) || error.status !== 409) throw error;
    const existing = await provider.get(input.calendarId, eventId);
    if (!isManagedEventForSession(existing, session.sessionKey)) throw error;
    return { id: existing.id ?? eventId };
  });
  if (!created.id) throw new Error("Google Calendar tidak mengembalikan ID acara.");
  return created.id;
}

export async function syncManagedEvents(provider: CalendarProviderClient, input: SyncInput) {
  const future = input.sessions.filter((session) => isFutureLocalSession(session.date, session.endTime, input.today, input.currentTime) && session.status !== "missed");
  const linksBySession = new Map(input.links.map((link) => [link.studySessionId, link]));
  const desiredIds = new Set(future.map((session) => session.id));
  const updates: Array<{ sessionId: string; eventId: string; calendarId: string; event: CalendarEvent }> = [];
  const inserts: Array<{ sessionId: string; sessionKey: string; eventId: string }> = [];
  const deletes: Array<{ linkId: string; eventId: string; outcome: ManagedEventRemoval }> = [];
  for (const session of future) {
    const event = eventFromSession(session, input.timeZone);
    const link = linksBySession.get(session.id);
    if (link) {
      const linkedCalendarId = link.googleCalendarId || input.calendarId;
      let linkedEvent: GoogleCalendarEvent | undefined;
      try {
        linkedEvent = await provider.get(linkedCalendarId, link.googleEventId);
      } catch (error) {
        if (!(error instanceof CalendarProviderError) || error.status !== 404) throw error;
      }
      if (linkedEvent && isManagedEventForSession(linkedEvent, session.sessionKey)) {
        await provider.update(linkedCalendarId, link.googleEventId, event);
        updates.push({ sessionId: session.id, eventId: link.googleEventId, calendarId: linkedCalendarId, event });
      } else {
        const eventId = await createDeterministicEvent(provider, input, session, event);
        updates.push({ sessionId: session.id, eventId, calendarId: input.calendarId, event });
      }
    } else {
      const eventId = await createDeterministicEvent(provider, input, session, event);
      inserts.push({ sessionId: session.id, sessionKey: session.sessionKey, eventId });
    }
  }
  for (const link of input.links) {
    if (desiredIds.has(link.studySessionId)) continue;
    const outcome = await removeManagedFutureEvent(provider, link, { today: input.today, currentTime: input.currentTime });
    if (outcome !== "not-future") deletes.push({ linkId: link.studySessionId, eventId: link.googleEventId, outcome });
  }
  return { updates, inserts, deletes };
}
