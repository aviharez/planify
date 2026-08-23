import type { Course } from "./types";

export function normalizeCourseName(name: string) {
  return name
    .trim()
    .toLocaleLowerCase("id-ID")
    .replace(/[.\-,/()]+/g, " ")
    .replace(/\s+/g, " ");
}

export function normalizeMockCourses(courses: Course[]) {
  const seen = new Map<string, Course>();
  const conflicts: Course[] = [];

  for (const course of courses) {
    const key = `${course.code.trim().toUpperCase()}|${normalizeCourseName(course.name)}|${course.credits}`;
    const previous = seen.get(key);
    if (!previous) {
      seen.set(key, {
        ...course,
        code: course.code.trim().toUpperCase(),
        name: course.name.trim(),
      });
    } else if (previous.semester !== course.semester) {
      conflicts.push(course);
    }
  }

  return { courses: [...seen.values()], conflicts };
}
