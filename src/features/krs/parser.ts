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
const HEADER_OR_FOOTER = /^(?:krs|universitas|program studi|teknologi|bandung|kelas|bagian|no\.?|kode|mata kuliah|semester|sks|status|persetujuan|rencana studi|jumlah|total|dosen|wali|mahasiswa|nama|nim|tanda tangan|tanggal|keuangan|keterangan|disetujui)\b/i;
const METADATA = /(?:jumlah\s+(?:mata\s+kuliah|sks)|total\s+sks|persetujuan\s+rencana\s+studi|krs\s+semester|disetujui\s+di|(?:dosen|mahasiswa)\s*[:]|nim\s*[:]|tanda\s+tangan|tanggal\s+acc|keuangan\s*:|keterangan\s*:)/i;
const ROW_NUMBER = /^(?:\d{1,3}[.)]|\[?\d{1,3}\]?)(?:[\s:.-]+|$)/;

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function cleanName(name: string) {
  return name
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\-:|\[\]]+|[.\-:|\[\]]+$/g, "")
    .replace(/^(?:\d{1,3}[.)]\s*)+/, "")
    .replace(/prosessor\b/gi, "prosesor")
    .replace(/\bll\b/gi, "II")
    .trim();
}

function invalidName(name: string) {
  const normalized = name.trim().toLocaleLowerCase("id-ID");
  return (
    name.length < 3 ||
    !/[a-zA-ZÀ-ÿ]/.test(name) ||
    HEADER_OR_FOOTER.test(normalized) ||
    METADATA.test(normalized) ||
    /[|]/.test(name) ||
    /\b(?:approved|disetujui|pending|rejected|ditolak)\b/i.test(normalized) ||
    /^(?:approved|disetujui|pending|rejected|ditolak|normal|mengulang|tambahan)$/i.test(normalized)
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

function looksLikeCourseCode(token: string) {
  const value = token.replace(/[|,;:]$/, "");
  return (
    value.length >= 3 &&
    value.length <= 18 &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value) &&
    (/[-_/]/.test(value) || /^[A-Z]{1,8}\d[A-Z0-9]*$/i.test(value))
  );
}

function stripCode(name: string) {
  const tokens = [...name.matchAll(/[^\s|]+/g)].slice(0, 4);
  const code = tokens.find((token) => looksLikeCourseCode(token[0]));
  if (code && code.index !== undefined) return name.slice(code.index + code[0].length).replace(/^[\s|:.-]+/, "");
  return name.replace(/^[^\s|]{1,12}\s*\|\s*/, "").trim();
}

function parseTrailingCredits(segment: string) {
  let value = segment.replace(/\s+/g, " ").trim();
  const hadStatus = STATUS.test(value);
  STATUS.lastIndex = 0;
  value = value.replace(STATUS, " ").replace(/\s+/g, " ").trim();
  const match = value.match(/(?:^|\s)(\d{1,2})\s*(?:SKS)?\s*$/i);
  if (!match || match.index === undefined) return null;
  const credits = Number(match[1]);
  const beforeCredits = value.slice(0, match.index).trim();
  if (!beforeCredits) return null;
  const rowNumber = ROW_NUMBER.test(beforeCredits);
  const withoutRowNumber = beforeCredits.replace(ROW_NUMBER, "").trim();
  const withoutCode = stripCode(withoutRowNumber);
  const hadCode = withoutCode !== withoutRowNumber;
  let name = withoutCode;

  // A numbered, code-less row still has a semester column when it has two
  // trailing numeric columns. Explicit SKS text makes a lone trailing number
  // part of a numeric course name (for example, "Kalkulus 2 3 SKS").
  const explicitCreditsLabel = /\bSKS\b/i.test(segment);
  if ((rowNumber && !explicitCreditsLabel) || hadCode || hadStatus) {
    const semester = name.match(/(?:^|\s)(\d{1,2})\s*$/);
    if (semester && semester.index !== undefined) name = name.slice(0, semester.index).trim();
  }
  return { name, credits };
}

function parseNumericColumns(segment: string) {
  const value = segment.replace(/\s+/g, " ").trim();
  const matches = [...value.matchAll(/(?:^|\s)(\d{1,2})\s+(\d{1,2})(?=\s|$)/g)];
  const match = matches.at(-1);
  if (!match || match.index === undefined) return null;
  const rowOrCode = ROW_NUMBER.test(value) || looksLikeCourseCode(value.replace(ROW_NUMBER, "").trim().split(/\s+/)[0] ?? "");
  if (!rowOrCode) return null;
  const credits = Number(match[2]);
  const beforeColumns = value.slice(0, match.index).trim();
  const withoutRowNumber = beforeColumns.replace(ROW_NUMBER, "").trim();
  const name = stripCode(withoutRowNumber).replace(/\s+(?:Le|L|Da|D|Sa|Se)\s*$/i, "").trim();
  return { name, credits };
}

function parseCourseSegment(segment: string) {
  return parseTrailingCredits(segment) ?? parseNumericColumns(segment);
}

function parseLineCandidates(lines: string[]) {
  const candidates: KrsCandidate[] = [];
  const normalizedLines = lines
    .map((line) => line.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const consumed = new Set<number>();
  for (let index = 0; index < normalizedLines.length; index += 1) {
    const line = normalizedLines[index];
    const repeatedRows = [...line.matchAll(/(?:^|\s)(?:\d{1,3}[.)]|\d{1,3}\s*\|)/g)].length > 1;
    if (repeatedRows) continue;
    const direct = parseCourseSegment(line);
    const hasRowShape = /^(?:\d{1,3}[.;)]|\d{1,3}\s+|\|)/.test(line) || [...line.matchAll(/[^\s|]+/g)].slice(0, 4).some((token) => looksLikeCourseCode(token[0]));
    if (direct && hasRowShape) {
      addCandidate(candidates, direct.name, direct.credits);
      continue;
    }
    if (consumed.has(index)) continue;
    if (direct) {
      addCandidate(candidates, direct.name, direct.credits);
      continue;
    }

    // OCR commonly puts a wrapped course name on one line and its numeric
    // columns on the next. Try only a short window so footer text cannot bleed
    // into a candidate, and consume the continuation to avoid a partial copy.
    for (const size of [2, 3]) {
      const segment = normalizedLines.slice(index, index + size).join(" ");
      const parsed = parseCourseSegment(segment);
      if (!parsed) continue;
      addCandidate(candidates, parsed.name, parsed.credits);
      for (let offset = 1; offset < size; offset += 1) consumed.add(index + offset);
      break;
    }
  }
  return candidates;
}

function parseStructuredRows(text: string) {
  const candidates: KrsCandidate[] = [];
  const flattened = text.replace(/\s+/g, " ").trim();
  const rowStarts = [...flattened.matchAll(/(?:^|\s)(\d{1,3}(?:[.)]|\s*\|(?!\s*(?:Approved|Disetujui|Pending|Rejected|Ditolak|Normal|Mengulang|Tambahan)\b)))\s*/gi)].map((match) =>
    (match.index ?? 0) + (match[0].startsWith(" ") ? 1 : 0),
  );
  for (let index = 0; index < rowStarts.length; index += 1) {
    const start = rowStarts[index];
    const end = rowStarts[index + 1];
    const segment = flattened.slice(start, end).trim();
    const parsed = parseCourseSegment(segment);
    if (parsed) addCandidate(candidates, parsed.name, parsed.credits);
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
    const existing = byIdentity.get(identity);
    if (!existing || (candidate.confidence ?? 0) > (existing.confidence ?? 0)) byIdentity.set(identity, canonical);
    const normalizedName = normalizeCourseName(name);
    const credits = creditsByName.get(normalizedName) ?? new Set<number>();
    credits.add(candidate.credits);
    creditsByName.set(normalizedName, credits);
  }
  const conflicts: KrsConflict[] = [];
  for (const [identity, credits] of creditsByName) {
    if (credits.size > 1) {
      conflicts.push({
        identity,
        field: "credits",
        values: [...credits].sort((a, b) => a - b).map(String),
      });
    }
  }
  const usedIds = new Map<string, number>();
  const unique = [...byIdentity.values()].map((candidate) => {
    const baseId = stableCandidateId(candidate.name, candidate.credits);
    const occurrence = usedIds.get(baseId) ?? 0;
    usedIds.set(baseId, occurrence + 1);
    const normalizedName = normalizeCourseName(candidate.name);
    const hasConflict = (creditsByName.get(normalizedName)?.size ?? 0) > 1;
    return {
      ...candidate,
      id: stableCandidateId(candidate.name, candidate.credits, occurrence),
      ...(hasConflict ? { needsVerification: true } : {}),
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
    confidence,
    needsVerification: deduplicated.conflicts.length > 0 || confidence < 0.8 || !completeTotals,
    conflicts: deduplicated.conflicts,
  };
}
