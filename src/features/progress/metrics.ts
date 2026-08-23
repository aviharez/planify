import type { Course, StudySession } from "@/features/onboarding/types";

export type ProgressCounts = {
  completed: number;
  missed: number;
  partial: number;
  planned: number;
};

export type CourseProgress = {
  courseId: string;
  courseName: string;
  completedMinutes: number;
  plannedMinutes: number;
  completed: number;
  missed: number;
  partial: number;
};

export type ProgressSignal = {
  courseId: string;
  courseName: string;
  message: string;
  score: number;
};

export type ProgressMetrics = {
  weekStart: string;
  weekEnd: string;
  plannedMinutes: number;
  completedMinutes: number;
  counts: ProgressCounts;
  adherence: number | null;
  consistency: number | null;
  courseProgress: CourseProgress[];
  strongestImprovement?: ProgressSignal;
  needsAttention?: ProgressSignal;
  hasEnoughData: boolean;
};

type SessionLike = Pick<StudySession, "courseId" | "courseName" | "date" | "duration" | "status" | "feedback">;

function dateValue(date: string) {
  return Date.parse(`${date}T12:00:00Z`);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function monday(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return value.toISOString().slice(0, 10);
}

function inRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

function recorded(session: SessionLike) {
  return session.status === "completed" || session.status === "missed" || session.status === "partial";
}

function completedMinutes(sessions: SessionLike[]) {
  // Partial sessions have no measured duration, so they are deliberately excluded.
  return sessions.filter((session) => session.status === "completed").reduce((total, session) => total + session.duration, 0);
}

function averageUnderstanding(sessions: SessionLike[]) {
  const values = sessions.map((session) => session.feedback?.understanding).filter((value): value is number => value !== undefined);
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

export function calculateProgressMetrics(sessions: SessionLike[], courses: Course[], today: string): ProgressMetrics {
  const weekStart = monday(today);
  const weekEnd = addDays(weekStart, 6);
  const weekly = sessions.filter((session) => inRange(session.date, weekStart, weekEnd));
  const due = weekly.filter((session) => session.date < today || recorded(session));
  const counts = {
    completed: weekly.filter((session) => session.status === "completed").length,
    missed: weekly.filter((session) => session.status === "missed").length,
    partial: weekly.filter((session) => session.status === "partial").length,
    planned: weekly.filter((session) => session.status === "planned").length,
  };
  const recordedCount = due.length;
  const dueDays = new Set(due.map((session) => session.date)).size;
  const activeDays = new Set(due.filter((session) => session.status === "completed").map((session) => session.date)).size;
  const courseProgress = courses.map((course) => {
    const courseSessions = weekly.filter((session) => session.courseId === course.id);
    return {
      courseId: course.id,
      courseName: course.name,
      completedMinutes: completedMinutes(courseSessions),
      plannedMinutes: courseSessions.reduce((total, session) => total + session.duration, 0),
      completed: courseSessions.filter((session) => session.status === "completed").length,
      missed: courseSessions.filter((session) => session.status === "missed").length,
      partial: courseSessions.filter((session) => session.status === "partial").length,
    };
  });
  const previousStart = addDays(weekStart, -7);
  const previousEnd = addDays(weekStart, -1);
  const previous = sessions.filter((session) => inRange(session.date, previousStart, previousEnd));
  const improvementCandidates = courses.map((course) => {
    const currentUnderstanding = averageUnderstanding(weekly.filter((session) => session.courseId === course.id));
    const previousUnderstanding = averageUnderstanding(previous.filter((session) => session.courseId === course.id));
    return currentUnderstanding !== null && previousUnderstanding !== null
      ? { courseId: course.id, courseName: course.name, score: currentUnderstanding - previousUnderstanding, message: "Pemahamanmu menunjukkan perubahan positif dari minggu lalu." }
      : null;
  }).filter((value): value is ProgressSignal => Boolean(value && value.score > 0));
  const attentionCandidates = courseProgress.map((course) => {
    const totalRecorded = course.completed + course.missed + course.partial;
    const lowUnderstanding = averageUnderstanding(weekly.filter((session) => session.courseId === course.courseId));
    const missedRatio = totalRecorded ? (course.missed + course.partial) / totalRecorded : 0;
    const score = missedRatio + (lowUnderstanding !== null ? Math.max(0, (3 - lowUnderstanding) / 3) : 0);
    return score > 0 ? {
      courseId: course.courseId,
      courseName: course.courseName,
      score,
      message: lowUnderstanding !== null && lowUnderstanding < 3 ? "Pemahaman terakhir masih perlu diperkuat." : "Ada sesi yang belum selesai sesuai rencana.",
    } : null;
  }).filter((value): value is ProgressSignal => Boolean(value));
  const strongestImprovement = improvementCandidates.sort((a, b) => b.score - a.score)[0];
  const needsAttention = attentionCandidates.sort((a, b) => b.score - a.score)[0];

  return {
    weekStart,
    weekEnd,
    plannedMinutes: weekly.reduce((total, session) => total + session.duration, 0),
    completedMinutes: completedMinutes(weekly),
    counts,
    adherence: recordedCount ? counts.completed / recordedCount : null,
    consistency: dueDays ? activeDays / dueDays : null,
    courseProgress,
    strongestImprovement,
    needsAttention,
    hasEnoughData: recordedCount > 0,
  };
}

export function formatProgressMinutes(minutes: number) {
  return `${Math.floor(minutes / 60)} jam${minutes % 60 ? ` ${minutes % 60} menit` : ""}`;
}

export function formatProgressPercent(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("id-ID", { style: "percent", maximumFractionDigits: 0 }).format(value);
}

export function progressDateDistance(today: string, date: string) {
  return Math.round((dateValue(date) - dateValue(today)) / 86_400_000);
}
