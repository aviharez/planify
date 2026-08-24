import { z } from "zod";
import { normalizeOnboardingPayload } from "./normalize";
import { ONBOARDING_STEPS, type OnboardingData } from "./types";

const timeRangeSchema = z.object({
  id: z.string(),
  day: z.string(),
  start: z.string(),
  end: z.string(),
});

const courseSchema = z.object({
  id: z.string(),
  name: z.string(),
  credits: z.number().int().min(1).max(12),
  confidence: z.number().min(0).max(1).optional(),
  needsVerification: z.boolean().optional(),
});

const factorsSchema = z.object({
  academicLoad: z.number(),
  knowledgeGap: z.number(),
  difficulty: z.number(),
  urgency: z.number(),
  adaptation: z.number(),
});

const snapshotSchema = z.object({
  reason: z.enum(["initial", "adaptation"]),
  generatedAt: z.string(),
  planningPeriod: z.object({ start: z.string(), end: z.string() }),
  weights: z.object({
    academicLoad: z.number(),
    knowledgeGap: z.number(),
    difficulty: z.number(),
    urgency: z.number(),
    adaptation: z.number(),
  }),
  courseFactors: z.array(z.object({
    courseId: z.string(),
    name: z.string(),
    factors: factorsSchema,
    score: z.number(),
  })),
  availability: z.array(timeRangeSchema),
});

const sessionSchema = z.object({
  id: z.string(),
  sessionKey: z.string(),
  courseId: z.string(),
  courseName: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  duration: z.number().int().min(15).max(180),
  status: z.enum(["planned", "completed", "partial", "missed"]),
  prioritySnapshot: factorsSchema.extend({ score: z.number() }),
  studyMethod: z.string().optional(),
  studyGoal: z.string().optional(),
  explanation: z.string().optional(),
  completedAt: z.string().optional(),
  sourceSessionId: z.string().optional(),
  changeReason: z.string().optional(),
  feedback: z.object({
    reason: z.string().optional(),
    understanding: z.number().int().min(1).max(5).optional(),
    recordedAt: z.string(),
  }).optional(),
});

const planSchema = z.object({
  id: z.string(),
  remoteId: z.string().optional(),
  sourcePlanId: z.string().optional(),
  adaptationReason: z.string().optional(),
  changeSummary: z.array(z.object({
    sessionKey: z.string(),
    courseId: z.string(),
    courseName: z.string(),
    reason: z.string(),
    sourceSessionId: z.string().optional(),
  })).optional(),
  generatedAt: z.string(),
  planningPeriod: z.object({ start: z.string(), end: z.string() }),
  weeklyCapacityMinutes: z.number().int().nonnegative(),
  capacityPolicy: z.object({
    capacityFactor: z.number().min(0).max(1),
    densityFactor: z.number().min(0).max(1),
    dailyMaximumMinutes: z.number().int().positive(),
    maximumSessionDuration: z.number().int().positive(),
    minimumBreakMinutes: z.number().int().nonnegative(),
  }),
  prioritySnapshot: snapshotSchema,
  sessions: z.array(sessionSchema),
});

const onboardingDataObjectSchema = z.object({
  step: z.number().int().min(0).max(5),
  timezone: z.string().min(1),
  krsFileName: z.string(),
  krsFileType: z.string(),
  krsFileSize: z.number().nonnegative(),
  krsUploadedAt: z.string(),
  semester: z.string().min(1),
  courses: z.array(courseSchema),
  classSchedules: z.record(z.array(timeRangeSchema)),
  availability: z.array(timeRangeSchema),
  focusPeriods: z.array(z.enum(["Pagi", "Siang", "Sore", "Malam"])),
  focusDuration: z.number().int().min(15).max(180),
  activityDensity: z.enum(["Sangat Longgar", "Cukup Longgar", "Seimbang", "Padat", "Sangat Padat"]),
  procrastination: z.enum(["Jarang", "Kadang-kadang", "Sering", "Sangat Sering"]),
  evaluations: z.record(z.object({
    understanding: z.number().int().min(1).max(5),
    difficulty: z.number().int().min(1).max(5),
  })),
  academicEvents: z.array(z.object({
    id: z.string(),
    courseId: z.string(),
    type: z.enum(["Tugas", "Kuis", "UTS", "UAS", "Presentasi", "Proyek", "Lainnya"]),
    title: z.string(),
    date: z.string(),
    importance: z.number().int().min(1).max(5),
    notes: z.string(),
  })),
  planActive: z.boolean(),
  previewAcknowledgedAt: z.string().nullable().optional(),
  krsExtraction: z.object({
    source: z.enum(["pdf-text", "ocr", "manual"]),
    status: z.enum(["pending", "processing", "completed", "failed", "manual"]),
    confidence: z.number().min(0).max(1),
    ocrConfidence: z.number().min(0).max(1).optional(),
    needsVerification: z.boolean(),
    academicPeriod: z.string().optional(),
    totalCourses: z.number().int().nonnegative().optional(),
    totalCredits: z.number().nonnegative().optional(),
    pageCount: z.number().int().positive().optional(),
    rawTextLength: z.number().int().nonnegative().optional(),
    conflicts: z.array(z.object({
      identity: z.string(),
      field: z.string(),
      values: z.array(z.string()),
    })),
    error: z.string().optional(),
  }).optional().default({
    source: "manual",
    status: "manual",
    confidence: 0,
    needsVerification: false,
    conflicts: [],
  }),
  krsStoragePath: z.string().optional(),
  krsDocumentId: z.string().optional(),
  planningSnapshot: snapshotSchema.optional(),
  studyPlan: planSchema.optional(),
});

export const onboardingDataSchema = z.preprocess(
  (value) => normalizeOnboardingPayload(value),
  onboardingDataObjectSchema,
);

export function canAdvance(data: OnboardingData) {
  if (data.step === 0) {
    if (data.krsExtraction?.status === "processing" || data.krsExtraction?.status === "failed") return false;
    return data.courses.length > 0 && Boolean(data.krsFileName);
  }
  if (data.step === 1)
    return data.courses.length > 0 && data.courses.every((course) => course.name.trim() && course.credits > 0);
  if (data.step === 2) return data.availability.length > 0;
  if (data.step === 3) return data.focusPeriods.length > 0 && data.focusDuration > 0;
  if (data.step === 4) return data.courses.every((course) => data.evaluations[course.id]);
  return true;
}

export function nextStep(data: OnboardingData): OnboardingData {
  if (!canAdvance(data)) return data;
  return { ...data, step: Math.min(data.step + 1, ONBOARDING_STEPS.length - 1) };
}

export function previousStep(data: OnboardingData): OnboardingData {
  return { ...data, step: Math.max(data.step - 1, 0) };
}

export function jumpToStep(data: OnboardingData, step: number): OnboardingData {
  return { ...data, step: Math.max(0, Math.min(step, ONBOARDING_STEPS.length - 1)) };
}
