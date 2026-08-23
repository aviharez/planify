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
  status?: string;
  confidence?: number;
  needsVerification?: boolean;
};

export type KrsConflict = {
  identity: string;
  field: string;
  values: string[];
};

export type KrsExtractionMetadata = {
  source: "pdf-text" | "ocr" | "manual" | "demo";
  status: "pending" | "processing" | "completed" | "failed" | "manual";
  confidence: number;
  ocrConfidence?: number;
  needsVerification: boolean;
  academicPeriod?: string;
  totalCourses?: number;
  totalCredits?: number;
  pageCount?: number;
  rawTextLength?: number;
  conflicts: KrsConflict[];
  error?: string;
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
  krsExtraction?: KrsExtractionMetadata;
  krsStoragePath?: string;
  krsDocumentId?: string;
  planningSnapshot?: PlanningSnapshot;
};

export type PriorityWeights = {
  academicLoad: number;
  knowledgeGap: number;
  difficulty: number;
  urgency: number;
  adaptation: number;
};

export type PriorityFactors = {
  academicLoad: number;
  knowledgeGap: number;
  difficulty: number;
  urgency: number;
  adaptation: number;
};

export type PlanningSnapshot = {
  reason: "initial" | "adaptation";
  generatedAt: string;
  planningPeriod: { start: string; end: string };
  weights: PriorityWeights;
  courseFactors: Array<{
    courseId: string;
    code: string;
    name: string;
    factors: PriorityFactors;
    score: number;
  }>;
  availability: TimeRange[];
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
  krsExtraction: {
    source: "manual",
    status: "manual",
    confidence: 0,
    needsVerification: false,
    conflicts: [],
  },
};
