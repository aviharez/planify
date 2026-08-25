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
  name: string;
  credits: number;
  confidence?: number;
  needsVerification?: boolean;
};

export type KrsConflict = {
  identity: string;
  field: string;
  values: string[];
};

export type KrsExtractionMetadata = {
  source: "pdf-text" | "ocr" | "manual";
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
  /** Null means the first generated plan is waiting for the preview acknowledgement. */
  previewAcknowledgedAt?: string | null;
  krsExtraction?: KrsExtractionMetadata;
  krsStoragePath?: string;
  krsDocumentId?: string;
  planningSnapshot?: PlanningSnapshot;
  studyPlan?: StudyPlan;
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
    name: string;
    factors: PriorityFactors;
    score: number;
  }>;
  availability: TimeRange[];
};

export type StudySessionStatus = "planned" | "completed" | "partial" | "missed";

export type SessionFeedback = {
  reason?: string;
  understanding?: number;
  recordedAt: string;
};

export type StudySession = {
  id: string;
  sessionKey: string;
  courseId: string;
  courseName: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: StudySessionStatus;
  prioritySnapshot: PriorityFactors & { score: number };
  studyMethod?: string;
  studyGoal?: string;
  explanation?: string;
  completedAt?: string;
  sourceSessionId?: string;
  changeReason?: string;
  feedback?: SessionFeedback;
};

export type StudyPlan = {
  id: string;
  remoteId?: string;
  sourcePlanId?: string;
  adaptationReason?: string;
  changeSummary?: Array<{
    sessionKey: string;
    courseId: string;
    courseName: string;
    reason: string;
    sourceSessionId?: string;
  }>;
  generatedAt: string;
  planningPeriod: { start: string; end: string };
  weeklyCapacityMinutes: number;
  capacityPolicy: {
    capacityFactor: number;
    densityFactor: number;
    dailyMaximumMinutes: number;
    maximumSessionDuration: number;
    minimumBreakMinutes: number;
  };
  prioritySnapshot: PlanningSnapshot;
  sessions: StudySession[];
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

function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export const initialOnboardingData: OnboardingData = {
  step: 0,
  timezone: localTimeZone(),
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
    source: "ocr",
    status: "pending",
    confidence: 0,
    needsVerification: false,
    conflicts: [],
  },
};
