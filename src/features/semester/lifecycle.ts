import type { OnboardingData } from "@/features/onboarding/types";
import { initialOnboardingData } from "@/features/onboarding/types";

const SEMESTER_NAME = /^(Ganjil|Genap)\s+(\d{4})\/(\d{4})$/;

function nextFromName(name: string) {
  const match = SEMESTER_NAME.exec(name);
  if (!match) return null;
  const start = Number(match[2]);
  const end = Number(match[3]);
  return match[1] === "Ganjil"
    ? `Genap ${start}/${end}`
    : `Ganjil ${start + 1}/${end + 1}`;
}

/** Returns the next academic semester without colliding with known names. */
export function nextSemesterName(previousName: string | undefined, existingNames: Iterable<string> = [], fallbackYear = new Date().getFullYear()) {
  const names = new Set(existingNames);
  let candidate = nextFromName(previousName ?? "") ?? `Ganjil ${fallbackYear}/${fallbackYear + 1}`;
  while (names.has(candidate)) {
    candidate = nextFromName(candidate) ?? `Ganjil ${fallbackYear + 1}/${fallbackYear + 2}`;
  }
  return candidate;
}

export function createNewSemesterSetup(previous: OnboardingData, reusePreferences: boolean, name: string): OnboardingData {
  return {
    ...initialOnboardingData,
    timezone: previous.timezone,
    semester: name,
    availability: [],
    focusPeriods: reusePreferences ? [...previous.focusPeriods] : [...initialOnboardingData.focusPeriods],
    focusDuration: reusePreferences ? previous.focusDuration : initialOnboardingData.focusDuration,
    activityDensity: reusePreferences ? previous.activityDensity : initialOnboardingData.activityDensity,
    procrastination: reusePreferences ? previous.procrastination : initialOnboardingData.procrastination,
  };
}
