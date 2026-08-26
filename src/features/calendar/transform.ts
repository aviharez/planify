import type { AcademicEvent, Course, StudySession, TimeRange } from "@/features/onboarding/types";
import type { CalendarDataSource, CalendarEventCategory, PlanifyCalendarEvent } from "./types";
import type { GoogleCalendarEvent } from "./provider";

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
const CATEGORY_ORDER: Record<CalendarEventCategory, number> = { class: 0, study: 1, assignment: 2, quiz: 3, exam: 4, presentation: 5, project: 6, other: 7 };
export type MonthEventGroup = "class" | "study" | "agenda" | "exam";
export type MonthEventIndicator = { category: MonthEventGroup; count: number; eventIds: string[] };

const MONTH_GROUP_ORDER: MonthEventGroup[] = ["class", "study", "agenda", "exam"];

function monthEventGroup(category: CalendarEventCategory): MonthEventGroup {
  if (category === "class" || category === "study" || category === "exam") return category;
  return "agenda";
}

function addDays(date: string, offset: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function dayName(date: string) {
  return DAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

function categoryForAcademicEvent(type: AcademicEvent["type"]): CalendarEventCategory {
  if (type === "Tugas") return "assignment";
  if (type === "Kuis") return "quiz";
  if (type === "UTS" || type === "UAS") return "exam";
  if (type === "Presentasi") return "presentation";
  if (type === "Proyek") return "project";
  return "other";
}

function eventSortKey(event: PlanifyCalendarEvent) {
  return `${event.date}|${event.startTime ?? "99:99"}|${CATEGORY_ORDER[event.category]}|${event.title}|${event.id}`;
}

export function classScheduleEvents(
  courses: Course[],
  classSchedules: Record<string, TimeRange[]>,
  range: { start: string; end: string },
): PlanifyCalendarEvent[] {
  const events: PlanifyCalendarEvent[] = [];
  const days = Math.max(0, Math.floor((Date.parse(`${range.end}T12:00:00Z`) - Date.parse(`${range.start}T12:00:00Z`)) / 86_400_000));
  const coursesById = new Map(courses.map((course) => [course.id, course]));
  for (let offset = 0; offset <= days; offset += 1) {
    const date = addDays(range.start, offset);
    const weekday = dayName(date);
    for (const [courseId, schedules] of Object.entries(classSchedules)) {
      const course = coursesById.get(courseId);
      if (!course) continue;
      for (const schedule of schedules.filter((item) => item.day === weekday)) {
        events.push({ id: `class-${courseId}-${date}-${schedule.id}`, source: "planify", category: "class", title: `Kuliah · ${course.name}`, date, startTime: schedule.start, endTime: schedule.end, courseId, courseName: course.name, editable: true });
      }
    }
  }
  return events;
}

export function studySessionEvents(sessions: StudySession[]): PlanifyCalendarEvent[] {
  return sessions.map((session) => ({ id: `study-${session.sessionKey}`, source: "planify", category: "study", title: `Belajar · ${session.courseName}`, date: session.date, startTime: session.startTime, endTime: session.endTime, courseId: session.courseId, courseName: session.courseName, editable: true, details: [session.studyMethod, session.studyGoal].filter(Boolean).join("\n") || undefined }));
}

export function academicEventCalendarEvents(events: AcademicEvent[], courses: Course[]): PlanifyCalendarEvent[] {
  const names = new Map(courses.map((course) => [course.id, course.name]));
  return events.filter((event) => event.date && names.has(event.courseId)).map((event) => ({ id: `academic-${event.id}`, source: "planify", category: categoryForAcademicEvent(event.type), title: event.title || `${event.type}${names.get(event.courseId) ? ` · ${names.get(event.courseId)}` : ""}`, date: event.date, courseId: event.courseId, courseName: names.get(event.courseId), editable: true, details: event.notes || undefined }));
}

function localDateTimeToUtc(localDateTime: string, timeZone: string) {
  const naiveUtc = Date.parse(`${localDateTime}Z`);
  if (!Number.isFinite(naiveUtc)) return null;
  const naiveSecond = Math.floor(naiveUtc / 1000) * 1000;
  const milliseconds = naiveUtc - naiveSecond;
  let candidate = naiveUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const displayedUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
    const candidateSecond = Math.floor(candidate / 1000) * 1000;
    const next = naiveSecond - (displayedUtc - candidateSecond) + milliseconds;
    if (next === candidate) return new Date(candidate);
    candidate = next;
  }
  return new Date(candidate);
}

function googleDateTimeToInstant(value: string, sourceTimeZone: string | undefined) {
  if (/[zZ]|[+-]\d{2}(?::?\d{2})?$/.test(value)) {
    const instant = new Date(value);
    return Number.isNaN(instant.getTime()) ? null : instant;
  }
  return localDateTimeToUtc(value, sourceTimeZone ?? "UTC");
}

function formatCalendarInstant(value: string, sourceTimeZone: string | undefined, timeZone: string) {
  const instant = googleDateTimeToInstant(value, sourceTimeZone);
  if (!instant) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

export function calendarRangeToUtc(startDate: string, endDate: string, timeZone: string) {
  const start = localDateTimeToUtc(`${startDate}T00:00:00`, timeZone);
  const end = localDateTimeToUtc(`${endDate}T23:59:59.999`, timeZone);
  if (!start || !end) throw new RangeError("Rentang kalender atau zona waktu belum valid.");
  return { start: start.toISOString(), end: end.toISOString() };
}

export function groupMonthEvents(events: PlanifyCalendarEvent[]) {
  const grouped = new Map<string, Map<MonthEventGroup, MonthEventIndicator>>();
  for (const event of events) {
    const category = monthEventGroup(event.category);
    const dateGroups = grouped.get(event.date) ?? new Map<MonthEventGroup, MonthEventIndicator>();
    const current = dateGroups.get(category) ?? { category, count: 0, eventIds: [] };
    dateGroups.set(category, { category, count: current.count + 1, eventIds: [...current.eventIds, event.id] });
    grouped.set(event.date, dateGroups);
  }
  return Object.fromEntries([...grouped].map(([date, dateGroups]) => [date, MONTH_GROUP_ORDER.flatMap((category) => dateGroups.get(category) ?? [])]));
}

export function mapGoogleEventToCalendarEvent(event: GoogleCalendarEvent, timeZone = "UTC"): PlanifyCalendarEvent | null {
  if (!event.id || event.extendedProperties?.private?.planifyManaged === "true") return null;
  const dateTime = event.start?.dateTime;
  const endDateTime = event.end?.dateTime;
  if (!dateTime && event.start?.date) return { id: `google-${event.id}`, source: "google", category: "other", title: event.summary || "Kegiatan Google Calendar", date: event.start.date, editable: false, details: event.description || undefined };
  const localStart = dateTime ? formatCalendarInstant(dateTime, event.start?.timeZone, timeZone) : null;
  const localEnd = endDateTime ? formatCalendarInstant(endDateTime, event.end?.timeZone ?? event.start?.timeZone, timeZone) : null;
  const date = localStart?.date ?? "";
  if (!date) return null;
  return { id: `google-${event.id}`, source: "google", category: "other", title: event.summary || "Kegiatan Google Calendar", date, startTime: localStart?.time, endTime: localEnd?.time, editable: false, details: event.description || undefined };
}

export function combineCalendarEvents(input: CalendarDataSource, range: { start: string; end: string }, overlays: PlanifyCalendarEvent[] = []) {
  return [...classScheduleEvents(input.courses, input.classSchedules, range), ...studySessionEvents(input.sessions), ...academicEventCalendarEvents(input.academicEvents, input.courses), ...overlays]
    .filter((event) => event.date >= range.start && event.date <= range.end)
    .sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b)));
}

export function calendarRangeForPlan(today: string, planningPeriod?: { start: string; end: string }) {
  return planningPeriod ?? { start: today, end: addDays(today, 27) };
}
