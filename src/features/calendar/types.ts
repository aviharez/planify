import type { AcademicEvent, Course, StudySession, TimeRange } from "@/features/onboarding/types";

export type CalendarEventSource = "planify" | "google";
export type CalendarEventCategory = "class" | "study" | "assignment" | "quiz" | "exam" | "presentation" | "project" | "other";

export type PlanifyCalendarEvent = {
  id: string;
  source: CalendarEventSource;
  category: CalendarEventCategory;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  courseId?: string;
  courseName?: string;
  editable: boolean;
  details?: string;
};

export type CalendarDataSource = {
  courses: Course[];
  classSchedules: Record<string, TimeRange[]>;
  sessions: StudySession[];
  academicEvents: AcademicEvent[];
};
