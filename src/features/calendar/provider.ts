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

export type CalendarEventLink = {
  studySessionId: string;
  sessionKey: string;
  googleEventId: string;
  googleCalendarId: string;
  sessionDate?: string;
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

function eventFromSession(session: Pick<StudySession, "sessionKey" | "courseName" | "date" | "startTime" | "endTime" | "studyGoal">, timeZone: string): CalendarEvent {
  const ownership = { planifyManaged: "true", planifySessionKey: session.sessionKey };
  return {
    summary: `Belajar — ${session.courseName}`,
    description: session.studyGoal ?? "Sesi belajar dari Planify.",
    start: { dateTime: `${session.date}T${session.startTime}:00`, timeZone },
    end: { dateTime: `${session.date}T${session.endTime}:00`, timeZone },
    extendedProperties: { private: ownership },
  };
}

export function mapStudySessionToCalendarEvent(session: Pick<StudySession, "sessionKey" | "courseName" | "date" | "startTime" | "endTime" | "studyGoal">, timeZone: string) {
  return eventFromSession(session, timeZone);
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
    return this.request(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`) as Promise<{ id?: string; extendedProperties?: { private?: Record<string, string> } }>;
  }
}

export type SyncInput = {
  sessions: Array<Pick<StudySession, "id" | "sessionKey" | "courseName" | "date" | "startTime" | "endTime" | "studyGoal" | "status">>;
  links: CalendarEventLink[];
  calendarId: string;
  timeZone: string;
  today: string;
};

export async function syncManagedEvents(provider: Pick<GoogleCalendarProvider, "insert" | "update" | "delete">, input: SyncInput) {
  const future = input.sessions.filter((session) => session.date >= input.today && session.status !== "missed");
  const linksBySession = new Map(input.links.map((link) => [link.studySessionId, link]));
  const desiredIds = new Set(future.map((session) => session.id));
  const updates: Array<{ sessionId: string; eventId: string; event: CalendarEvent }> = [];
  const inserts: Array<{ sessionId: string; sessionKey: string; eventId: string }> = [];
  const deletes: Array<{ linkId: string; eventId: string }> = [];
  for (const session of future) {
    const event = eventFromSession(session, input.timeZone);
    const link = linksBySession.get(session.id);
    const eventId = deterministicCalendarEventId(session.id);
    if (link) {
      try {
        await provider.update(input.calendarId, link.googleEventId, event);
        updates.push({ sessionId: session.id, eventId: link.googleEventId, event });
      } catch (error) {
        if (!(error instanceof CalendarProviderError) || error.status !== 404) throw error;
        const recreated = await provider.insert(input.calendarId, event, eventId).catch(async (insertError) => {
          if (!(insertError instanceof CalendarProviderError) || insertError.status !== 409 || !("get" in provider)) throw insertError;
          const existing = await (provider as GoogleCalendarProvider).get(input.calendarId, eventId);
          if (existing.extendedProperties?.private?.planifySessionKey !== session.sessionKey || existing.extendedProperties?.private?.planifyManaged !== "true") throw insertError;
          return { id: eventId };
        });
        if (!recreated.id) throw new Error("Google Calendar tidak mengembalikan ID acara.");
        updates.push({ sessionId: session.id, eventId: recreated.id, event });
      }
    } else {
      const created = await provider.insert(input.calendarId, event, eventId).catch(async (error) => {
        if (!(error instanceof CalendarProviderError) || error.status !== 409 || !("get" in provider)) throw error;
        const existing = await (provider as GoogleCalendarProvider).get(input.calendarId, eventId);
        if (existing.extendedProperties?.private?.planifySessionKey !== session.sessionKey || existing.extendedProperties?.private?.planifyManaged !== "true") throw error;
        return { id: eventId };
      });
      if (!created.id) throw new Error("Google Calendar tidak mengembalikan ID acara.");
      inserts.push({ sessionId: session.id, sessionKey: session.sessionKey, eventId: created.id });
    }
  }
  for (const link of input.links) {
    if (!desiredIds.has(link.studySessionId) && link.sessionDate && link.sessionDate >= input.today) {
      await provider.delete(link.googleCalendarId, link.googleEventId);
      deletes.push({ linkId: link.studySessionId, eventId: link.googleEventId });
    }
  }
  return { updates, inserts, deletes };
}
