import { z } from "zod";
import { ONBOARDING_STEPS, type OnboardingData } from "./types";

export const onboardingDataSchema = z.object({
  step: z.number().int().min(0).max(5),
  timezone: z.string().min(1),
  krsFileName: z.string(),
  krsFileType: z.string(),
  krsFileSize: z.number().nonnegative(),
  krsUploadedAt: z.string(),
  semester: z.string().min(1),
  courses: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      credits: z.number().int().min(1).max(12),
      semester: z.number().int().min(1).max(20),
      status: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
      needsVerification: z.boolean().optional(),
    }),
  ),
  classSchedules: z.record(
    z.array(
      z.object({
        id: z.string(),
        day: z.string(),
        start: z.string(),
        end: z.string(),
      }),
    ),
  ),
  availability: z.array(
    z.object({
      id: z.string(),
      day: z.string(),
      start: z.string(),
      end: z.string(),
    }),
  ),
  focusPeriods: z.array(z.enum(["Pagi", "Siang", "Sore", "Malam"])),
  focusDuration: z.number().int().min(15).max(180),
  activityDensity: z.enum([
    "Sangat Longgar",
    "Cukup Longgar",
    "Seimbang",
    "Padat",
    "Sangat Padat",
  ]),
  procrastination: z.enum([
    "Jarang",
    "Kadang-kadang",
    "Sering",
    "Sangat Sering",
  ]),
  evaluations: z.record(
    z.object({
      understanding: z.number().int().min(1).max(5),
      difficulty: z.number().int().min(1).max(5),
    }),
  ),
  academicEvents: z.array(
    z.object({
      id: z.string(),
      courseId: z.string(),
      type: z.enum([
        "Tugas",
        "Kuis",
        "UTS",
        "UAS",
        "Presentasi",
        "Proyek",
        "Lainnya",
      ]),
      title: z.string(),
      date: z.string(),
      importance: z.number().int().min(1).max(5),
      notes: z.string(),
    }),
  ),
  planActive: z.boolean(),
  krsExtraction: z
    .object({
      source: z.enum(["pdf-text", "ocr", "manual", "demo"]),
      status: z.enum([
        "pending",
        "processing",
        "completed",
        "failed",
        "manual",
      ]),
      confidence: z.number().min(0).max(1),
      ocrConfidence: z.number().min(0).max(1).optional(),
      needsVerification: z.boolean(),
      academicPeriod: z.string().optional(),
      totalCourses: z.number().int().nonnegative().optional(),
      totalCredits: z.number().nonnegative().optional(),
      pageCount: z.number().int().positive().optional(),
      rawTextLength: z.number().int().nonnegative().optional(),
      conflicts: z.array(
        z.object({
          identity: z.string(),
          field: z.string(),
          values: z.array(z.string()),
        }),
      ),
      error: z.string().optional(),
    })
    .optional()
    .default({
      source: "manual",
      status: "manual",
      confidence: 0,
      needsVerification: false,
      conflicts: [],
    }),
  krsStoragePath: z.string().optional(),
  krsDocumentId: z.string().optional(),
  planningSnapshot: z
    .object({
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
      courseFactors: z.array(
        z.object({
          courseId: z.string(),
          code: z.string(),
          name: z.string(),
          factors: z.object({
            academicLoad: z.number(),
            knowledgeGap: z.number(),
            difficulty: z.number(),
            urgency: z.number(),
            adaptation: z.number(),
          }),
          score: z.number(),
        }),
      ),
      availability: z.array(
        z.object({
          id: z.string(),
          day: z.string(),
          start: z.string(),
          end: z.string(),
        }),
      ),
    })
    .optional(),
  studyPlan: z
    .object({
      id: z.string(),
      remoteId: z.string().optional(),
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
      prioritySnapshot: z.object({
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
        courseFactors: z.array(
          z.object({
            courseId: z.string(),
            code: z.string(),
            name: z.string(),
            factors: z.object({
              academicLoad: z.number(),
              knowledgeGap: z.number(),
              difficulty: z.number(),
              urgency: z.number(),
              adaptation: z.number(),
            }),
            score: z.number(),
          }),
        ),
        availability: z.array(
          z.object({ id: z.string(), day: z.string(), start: z.string(), end: z.string() }),
        ),
      }),
      sessions: z.array(
        z.object({
          id: z.string(),
          sessionKey: z.string(),
          courseId: z.string(),
          courseCode: z.string(),
          courseName: z.string(),
          date: z.string(),
          startTime: z.string(),
          endTime: z.string(),
          duration: z.number().int().positive(),
          status: z.enum(["planned", "completed", "partial", "missed"]),
          prioritySnapshot: z.object({
            academicLoad: z.number(),
            knowledgeGap: z.number(),
            difficulty: z.number(),
            urgency: z.number(),
            adaptation: z.number(),
            score: z.number(),
          }),
          studyMethod: z.string().optional(),
          studyGoal: z.string().optional(),
          explanation: z.string().optional(),
          completedAt: z.string().optional(),
          sourceSessionId: z.string().optional(),
        }),
      ),
    })
    .optional(),
});

export function canAdvance(data: OnboardingData) {
  if (data.step === 0) {
    if (data.krsExtraction?.status === "processing" || data.krsExtraction?.status === "failed")
      return false;
    return data.courses.length > 0 && Boolean(data.krsFileName);
  }
  if (data.step === 1)
    return (
      data.courses.length > 0 &&
      data.courses.every(
        (course) =>
          course.name.trim() && course.code.trim() && course.credits > 0,
      )
    );
  if (data.step === 2) return data.availability.length > 0;
  if (data.step === 3)
    return data.focusPeriods.length > 0 && data.focusDuration > 0;
  if (data.step === 4)
    return data.courses.every((course) => data.evaluations[course.id]);
  return true;
}

export function nextStep(data: OnboardingData): OnboardingData {
  if (!canAdvance(data)) return data;
  return {
    ...data,
    step: Math.min(data.step + 1, ONBOARDING_STEPS.length - 1),
  };
}

export function previousStep(data: OnboardingData): OnboardingData {
  return { ...data, step: Math.max(data.step - 1, 0) };
}

export function jumpToStep(data: OnboardingData, step: number): OnboardingData {
  return {
    ...data,
    step: Math.max(0, Math.min(step, ONBOARDING_STEPS.length - 1)),
  };
}
