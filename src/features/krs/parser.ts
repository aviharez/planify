import type { Course } from "@/features/onboarding/types";
import type { KrsConflict } from "@/features/onboarding/types";
import { normalizeCourseName } from "@/features/onboarding/normalize";

export type KrsCandidate = Course & { status: string; confidence: number };

export type KrsParseResult = {
  academicPeriod?: string;
  candidates: KrsCandidate[];
  totalCourses?: number;
  totalCredits?: number;
  confidence: number;
  needsVerification: boolean;
  conflicts: KrsConflict[];
};

const STATUS =
  "Approved(?:\\s*\\(\\*?[A-Z]\\))?|Disetujui(?:\\s*\\(\\*?[A-Z]\\))?|Pending|Rejected|Ditolak|Normal|Mengulang|Tambahan";

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeCode(code: string) {
  return code.replace(/\s+/g, "-").trim().toUpperCase();
}

function cleanName(name: string) {
  return name
    .replace(/\s+/g, " ")
    .replace(/^[.\-:]+|[.\-:]+$/g, "")
    .trim();
}

function identityOf(candidate: Pick<KrsCandidate, "code" | "name">) {
  return `${normalizeCode(candidate.code)}|${normalizeCourseName(candidate.name)}`;
}

function fieldValue(candidate: KrsCandidate, field: keyof KrsCandidate) {
  return String(candidate[field]);
}

function stableCandidateId(candidate: KrsCandidate) {
  return [
    normalizeCode(candidate.code),
    normalizeCourseName(candidate.name),
    candidate.credits,
    candidate.semester,
    normalizeCourseName(candidate.status),
  ]
    .join("-")
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

export function deduplicateKrsCandidates(candidates: KrsCandidate[]) {
  const unique: KrsCandidate[] = [];
  const groups = new Map<string, KrsCandidate[]>();
  for (const candidate of candidates) {
    const normalized = {
      ...candidate,
      code: normalizeCode(candidate.code),
      name: cleanName(candidate.name),
    };
    const key = `${normalized.code}|${normalizeCourseName(normalized.name)}|${normalized.credits}`;
    const group = groups.get(key) ?? [];
    if (!group.some((item) => item.semester === normalized.semester && item.status === normalized.status))
      group.push(normalized);
    groups.set(key, group);
  }

  const conflicts: KrsConflict[] = [];
  for (const [key, group] of groups) {
    const identity = identityOf(group[0]);
    const fields: (keyof KrsCandidate)[] = ["semester", "credits", "status"];
    const differing = fields.filter(
      (field) => new Set(group.map((candidate) => fieldValue(candidate, field))).size > 1,
    );
    if (differing.length) {
      for (const field of differing) {
        conflicts.push({
          identity,
          field,
          values: [...new Set(group.map((candidate) => fieldValue(candidate, field)))],
        });
      }
      unique.push(...group.map((candidate) => ({ ...candidate, needsVerification: true })));
    } else {
      unique.push(group[0]);
    }
    // Keep the key in scope to make the grouping contract explicit for future fields.
    void key;
  }

  const byIdentity = new Map<string, KrsCandidate[]>();
  for (const candidate of unique) {
    const group = byIdentity.get(identityOf(candidate)) ?? [];
    group.push(candidate);
    byIdentity.set(identityOf(candidate), group);
  }
  for (const [identity, group] of byIdentity) {
    for (const field of ["semester", "credits", "status"] as const) {
      const values = [...new Set(group.map((candidate) => fieldValue(candidate, field)))];
      if (values.length > 1 && !conflicts.some((item) => item.identity === identity && item.field === field))
        conflicts.push({ identity, field, values });
    }
  }

  const ids = new Map<string, number>();
  const deduplicatedCandidates = unique.map((candidate) => {
    const baseId = `krs-${stableCandidateId(candidate)}`;
    const occurrence = ids.get(baseId) ?? 0;
    ids.set(baseId, occurrence + 1);
    return {
      ...candidate,
      id: occurrence ? `${baseId}-${occurrence + 1}` : baseId,
      ...(conflicts.some((conflict) => conflict.identity === identityOf(candidate))
        ? { needsVerification: true }
        : {}),
    };
  });
  return {
    candidates: deduplicatedCandidates,
    conflicts,
  };
}

export function parseKrsText(rawText: string): KrsParseResult {
  const text = rawText.replace(/\u00a0/g, " ").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  const periodMatch = text.match(/KRS\s+SEMESTER\s+([A-Za-z]+)\s+(\d{4}\s*\/\s*\d{4})/i);
  const academicPeriod = periodMatch
    ? `${periodMatch[1][0].toUpperCase()}${periodMatch[1].slice(1).toLowerCase()} ${periodMatch[2].replace(/\s+/g, "")}`
    : undefined;
  const rowPattern = new RegExp(
    `(?:^|\\s)(?:\\d+\\.\\s*)?([A-Z]{2,6}[-\\s]\\d{3,5})\\s+(.+?)\\s+(\\d{1,2})\\s+(\\d{1,2})\\s+(${STATUS})(?=\\s+(?:\\d+\\.\\s*)?[A-Z]{2,6}[-\\s]\\d{3,5}\\b|\\s+\\d+\\.\\s|\\s+PERSETUJUAN|\\s+Jumlah|\\s+\\d+\\s+Mata\\s+Kuliah|$)`,
    "gi",
  );
  const candidates: KrsCandidate[] = [];
  for (const match of text.matchAll(rowPattern)) {
    const [, code, name, semester, credits, status] = match;
    if (!code || !name || !semester || !credits || !status) continue;
    const numericSemester = Number(semester);
    const numericCredits = Number(credits);
    if (!numericSemester || !numericCredits) continue;
    candidates.push({
      id: `krs-${normalizeCode(code).toLowerCase()}-${numericCredits}`,
      code: normalizeCode(code),
      name: cleanName(name),
      semester: numericSemester,
      credits: numericCredits,
      status: status.replace(/\s+/g, " ").trim(),
      confidence: 0.96,
    });
  }

  const deduplicated = deduplicateKrsCandidates(candidates);
  const totalCreditsMatches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*SKS\b/gi)];
  const totalCoursesMatches = [...text.matchAll(/(\d+)\s+Mata\s+Kuliah\b/gi)];
  const totalCreditsMatch = totalCreditsMatches.at(-1);
  const totalCoursesMatch = totalCoursesMatches.at(-1);
  const totalCredits = totalCreditsMatch ? Number(totalCreditsMatch[1].replace(",", ".")) : undefined;
  const totalCourses = totalCoursesMatch ? Number(totalCoursesMatch[1]) : undefined;
  const completeTotals = totalCredits === undefined || totalCourses === undefined ||
    (totalCredits === deduplicated.candidates.reduce((sum, item) => sum + item.credits, 0) && totalCourses === deduplicated.candidates.length);
  const confidence = clamp(
    (academicPeriod ? 0.15 : 0) +
      Math.min(0.7, deduplicated.candidates.length * 0.1) +
      (completeTotals && totalCredits !== undefined ? 0.15 : 0),
  );
  return {
    academicPeriod,
    candidates: deduplicated.candidates,
    totalCourses,
    totalCredits,
    confidence: Math.max(candidates.length ? 0.65 : 0.1, confidence),
    needsVerification: deduplicated.conflicts.length > 0 || confidence < 0.8,
    conflicts: deduplicated.conflicts,
  };
}
