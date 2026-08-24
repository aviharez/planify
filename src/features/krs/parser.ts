import type { KrsConflict, Course } from "@/features/onboarding/types";
import { normalizeCourseName } from "@/features/onboarding/normalize";

export type KrsCandidate = Course;

export type KrsParseResult = {
  academicPeriod?: string;
  candidates: KrsCandidate[];
  totalCourses?: number;
  totalCredits?: number;
  confidence: number;
  needsVerification: boolean;
  conflicts: KrsConflict[];
};

const STATUS = /(?:Approved|Disetujui|Pending|Rejected|Ditolak|Normal|Mengulang|Tambahan)(?:\s*\(\*?[A-Z]\))?/gi;
const FOOTER = /^(?:krs|universitas|program studi|teknologi|bandung|kelas|bagian|no\.?|kode|mata kuliah|semester|sks|status|persetujuan|rencana studi|jumlah|total|dosen|wali|mahasiswa|nama|nim|tanda tangan|tanggal|keuangan|keterangan|disetujui)\b/i;
const COURSE_CODE = /^(?:[A-Z]{2,8}[-\s]?\d{2,5})\s+/i;

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function cleanName(name: string) {
  return name
    .replace(/\s+/g, " ")
    .replace(/^[.\-:|]+|[.\-:|]+$/g, "")
    .replace(/^(?:\d{1,3}[.)]\s*)+/, "")
    .replace(COURSE_CODE, "")
    .trim();
}

function invalidName(name: string) {
  const normalized = name.toLocaleLowerCase("id-ID");
  return (
    name.length < 3 ||
    !/[a-zA-ZÀ-ÿ]/.test(name) ||
    /\d/.test(name) ||
    FOOTER.test(normalized) ||
    /(?:mata kuliah|jumlah sks|total sks|approved|disetujui|semester ganjil)/i.test(normalized)
  );
}

function stableCandidateId(name: string, credits: number, occurrence = 0) {
  const slug = normalizeCourseName(name)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "mata-kuliah";
  return `krs-${slug}-${credits}${occurrence ? `-${occurrence + 1}` : ""}`;
}

function identityOf(candidate: Pick<KrsCandidate, "name" | "credits">) {
  return `${normalizeCourseName(candidate.name)}|${candidate.credits}`;
}

function addCandidate(
  candidates: KrsCandidate[],
  name: string,
  credits: number,
) {
  const cleaned = cleanName(name);
  if (credits < 1 || credits > 12 || invalidName(cleaned)) return;
  candidates.push({
    id: stableCandidateId(cleaned, credits),
    name: cleaned,
    credits,
    confidence: 0.82,
  });
}

function parseTrailingCredits(segment: string) {
  const withoutStatus = segment.replace(STATUS, " ").replace(/\s+/g, " ").trim();
  const match = withoutStatus.match(/(?:^|\s)(\d{1,2})\s*(?:SKS)?\s*$/i);
  if (!match) return null;
  const credits = Number(match[1]);
  const beforeCredits = withoutStatus.slice(0, match.index).trim();
  const numbers = [...beforeCredits.matchAll(/(?:^|\s)(\d{1,2})(?=\s|$)/g)];
  const name = numbers.length
    ? beforeCredits.slice(0, numbers.at(-1)!.index).trim()
    : beforeCredits;
  return { name, credits };
}

function parseLineCandidates(lines: string[]) {
  const candidates: KrsCandidate[] = [];
  const normalizedLines = lines
    .map((line) => line.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  for (let index = 0; index < normalizedLines.length; index += 1) {
    const line = normalizedLines[index];
    const parsedLine = parseTrailingCredits(line);
    const isWrappedContinuation = index > 0 &&
      !/^(?:\d{1,3}[.)]\s*)/.test(line) &&
      !parseTrailingCredits(normalizedLines[index - 1]);
    if (parsedLine) {
      if (!isWrappedContinuation) addCandidate(candidates, parsedLine.name, parsedLine.credits);
      continue;
    }
    for (const size of [2, 3]) {
      const segment = normalizedLines.slice(index, index + size).join(" ");
      if (!segment) continue;
      const parsed = parseTrailingCredits(segment);
      if (parsed) {
        addCandidate(candidates, parsed.name, parsed.credits);
        break;
      }
    }
  }
  return candidates;
}

function parseStructuredRows(text: string) {
  const candidates: KrsCandidate[] = [];
  const rowPattern = /(?:^|\s)(?:\d{1,3}[.)]\s*)?(?:[A-Z]{2,8}[-\s]?\d{2,5}\s+)(.+?)\s+\d{1,2}\s+(\d{1,2})(?=\s+(?:Approved|Disetujui|Pending|Rejected|Ditolak|Normal|Mengulang|Tambahan)|\s+\d{1,3}[.)]\s*(?:[A-Z]{2,8}[-\s]?\d{2,5})\b|\s+PERSETUJUAN|\s+Jumlah|$)/gi;
  for (const match of text.matchAll(rowPattern)) {
    const name = match[1];
    const credits = Number(match[2]);
    if (name) addCandidate(candidates, name, credits);
  }
  return candidates;
}

export function deduplicateKrsCandidates(candidates: KrsCandidate[]) {
  const byIdentity = new Map<string, KrsCandidate>();
  const creditsByName = new Map<string, Set<number>>();
  for (const candidate of candidates) {
    const name = cleanName(candidate.name);
    if (invalidName(name)) continue;
    const canonical = { ...candidate, id: stableCandidateId(name, candidate.credits), name };
    const identity = identityOf(canonical);
    if (!byIdentity.has(identity)) byIdentity.set(identity, canonical);
    const credits = creditsByName.get(normalizeCourseName(name)) ?? new Set<number>();
    credits.add(candidate.credits);
    creditsByName.set(normalizeCourseName(name), credits);
  }
  const conflicts: KrsConflict[] = [];
  for (const [identity, credits] of creditsByName) {
    if (credits.size > 1) conflicts.push({ identity, field: "credits", values: [...credits].sort((a, b) => a - b).map(String) });
  }
  const usedIds = new Map<string, number>();
  const unique = [...byIdentity.values()].map((candidate) => {
    const baseId = stableCandidateId(candidate.name, candidate.credits);
    const occurrence = usedIds.get(baseId) ?? 0;
    usedIds.set(baseId, occurrence + 1);
    return {
      ...candidate,
      id: stableCandidateId(candidate.name, candidate.credits, occurrence),
      ...(creditsByName.get(normalizeCourseName(candidate.name))?.size && creditsByName.get(normalizeCourseName(candidate.name))!.size > 1
        ? { needsVerification: true }
        : {}),
    };
  });
  return { candidates: unique, conflicts };
}

export function parseKrsText(rawText: string): KrsParseResult {
  const source = rawText.replace(/\u00a0/g, " ").replace(/\r/g, "");
  const flattened = source.replace(/\s+/g, " ").trim();
  const periodMatch = flattened.match(/KRS\s+SEMESTER\s+([A-Za-z]+)\s+(\d{4}\s*\/\s*\d{4})/i);
  const academicPeriod = periodMatch
    ? `${periodMatch[1][0].toUpperCase()}${periodMatch[1].slice(1).toLowerCase()} ${periodMatch[2].replace(/\s+/g, "")}`
    : undefined;
  const candidates = [
    ...parseStructuredRows(flattened),
    ...parseLineCandidates(source.split("\n")),
  ];
  const deduplicated = deduplicateKrsCandidates(candidates);
  const totalCreditsMatches = [...flattened.matchAll(/(\d+(?:[.,]\d+)?)\s*SKS\b/gi)];
  const totalCoursesMatches = [...flattened.matchAll(/(\d+)\s+Mata\s+Kuliah\b/gi)];
  const totalCreditsMatch = totalCreditsMatches.at(-1);
  const totalCoursesMatch = totalCoursesMatches.at(-1);
  const totalCredits = totalCreditsMatch ? Number(totalCreditsMatch[1].replace(",", ".")) : undefined;
  const totalCourses = totalCoursesMatch ? Number(totalCoursesMatch[1]) : undefined;
  const sumCredits = deduplicated.candidates.reduce((sum, item) => sum + item.credits, 0);
  const completeTotals = totalCredits === undefined || totalCourses === undefined || (totalCredits === sumCredits && totalCourses === deduplicated.candidates.length);
  const confidence = clamp(
    (academicPeriod ? 0.1 : 0) +
      Math.min(0.75, deduplicated.candidates.length * 0.11) +
      (completeTotals && totalCredits !== undefined ? 0.15 : 0),
  );
  return {
    academicPeriod,
    candidates: deduplicated.candidates,
    totalCourses,
    totalCredits,
    confidence: deduplicated.candidates.length ? Math.max(0.65, confidence) : 0.1,
    needsVerification: deduplicated.conflicts.length > 0 || confidence < 0.8 || !completeTotals,
    conflicts: deduplicated.conflicts,
  };
}
