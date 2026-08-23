export const ONBOARDING_STEPS = [
  "KRS",
  "Mata Kuliah",
  "Jadwal Mingguan",
  "Kebiasaan Belajar",
  "Evaluasi Mata Kuliah",
  "Ringkasan",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type FocusPeriod = "Pagi" | "Siang" | "Sore" | "Malam";
export type ActivityDensity =
  | "Sangat Longgar"
  | "Cukup Longgar"
  | "Seimbang"
  | "Padat"
  | "Sangat Padat";
export type Procrastination =
  | "Jarang"
  | "Kadang-kadang"
  | "Sering"
  | "Sangat Sering";
export type AcademicEventType =
  | "Tugas"
  | "Kuis"
  | "UTS"
  | "UAS"
  | "Presentasi"
  | "Proyek"
  | "Lainnya";

export type Course = {
  id: string;
  code: string;
  name: string;
  credits: number;
  semester: number;
};

export type TimeRange = {
  id: string;
  day: string;
  start: string;
  end: string;
};

export type AcademicEvent = {
  id: string;
  courseId: string;
  type: AcademicEventType;
  title: string;
  date: string;
  importance: 1 | 2 | 3 | 4 | 5;
  notes: string;
};

export type CourseEvaluation = {
  understanding: number;
  difficulty: number;
};

export type OnboardingData = {
  step: number;
  timezone: string;
  krsFileName: string;
  krsFileType: string;
  krsFileSize: number;
  krsUploadedAt: string;
  semester: string;
  courses: Course[];
  classSchedules: Record<string, TimeRange[]>;
  availability: TimeRange[];
  focusPeriods: FocusPeriod[];
  focusDuration: number;
  activityDensity: ActivityDensity;
  procrastination: Procrastination;
  evaluations: Record<string, CourseEvaluation>;
  academicEvents: AcademicEvent[];
  planActive: boolean;
};

export const DAYS = [
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
  "Minggu",
] as const;

export const initialOnboardingData: OnboardingData = {
  step: 0,
  timezone: "Asia/Jakarta",
  krsFileName: "",
  krsFileType: "",
  krsFileSize: 0,
  krsUploadedAt: "",
  semester: "Ganjil 2026/2027",
  courses: [],
  classSchedules: {},
  availability: [],
  focusPeriods: ["Malam"],
  focusDuration: 45,
  activityDensity: "Seimbang",
  procrastination: "Kadang-kadang",
  evaluations: {},
  academicEvents: [],
  planActive: false,
};
