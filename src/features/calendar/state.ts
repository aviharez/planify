import { randomBytes, timingSafeEqual } from "node:crypto";

export const CALENDAR_STATE_COOKIE = "planify_google_calendar_state";

export function createCalendarState() {
  return randomBytes(32).toString("base64url");
}

export function verifyCalendarState(expected: string | undefined, actual: string | null) {
  if (!expected || !actual) return false;
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}
