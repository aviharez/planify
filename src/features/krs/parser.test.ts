import test from "node:test";
import assert from "node:assert/strict";
import { deduplicateKrsCandidates, parseKrsText, type KrsCandidate } from "./parser";

const candidate = (patch: Partial<KrsCandidate> = {}): KrsCandidate => ({
  id: "course",
  code: "IF-001",
  name: "Algoritma",
  semester: 3,
  credits: 3,
  status: "Approved (*T)",
  confidence: 0.96,
  ...patch,
});

test("parser membaca periode, baris mata kuliah, status, dan total", () => {
  const result = parseKrsText(
    "KRS SEMESTER GANJIL 2024/2025 1. IF-015 Pemrograman Berorientasi Objek I 3 3 Approved (*T) 2. IF-005 Basis Data Terdistribusi 3 3 Approved (*T) 7 Mata Kuliah 21 SKS",
  );
  assert.equal(result.academicPeriod, "Ganjil 2024/2025");
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].status, "Approved (*T)");
  assert.equal(result.totalCourses, 7);
  assert.equal(result.totalCredits, 21);
});

test("deduplikasi hanya menghapus baris identik dan menandai konflik", () => {
  const same = candidate();
  const duplicate = candidate({ id: "duplicate", name: " Algoritma " });
  const conflicting = candidate({ id: "conflicting", semester: 4, status: "Pending" });
  const result = deduplicateKrsCandidates([same, duplicate, conflicting]);
  assert.equal(result.candidates.length, 2);
  assert.equal(new Set(result.candidates.map((item) => item.id)).size, result.candidates.length);
  assert.equal(result.conflicts.length, 2);
  assert.ok(result.candidates.every((item) => item.needsVerification));
});

test("perbedaan SKS pada identitas yang sama tetap dipertahankan", () => {
  const result = deduplicateKrsCandidates([
    candidate(),
    candidate({ id: "credit-conflict", credits: 4 }),
  ]);
  assert.equal(result.candidates.length, 2);
  assert.equal(new Set(result.candidates.map((item) => item.id)).size, result.candidates.length);
  assert.ok(result.conflicts.some((item) => item.field === "credits"));
});
