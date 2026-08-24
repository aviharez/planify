import test from "node:test";
import assert from "node:assert/strict";
import { deduplicateKrsCandidates, parseKrsText, type KrsCandidate } from "./parser";

const candidate = (patch: Partial<KrsCandidate> = {}): KrsCandidate => ({
  id: "course",
  name: "Algoritma",
  credits: 3,
  confidence: 0.82,
  ...patch,
});

test("parser mengambil nama dan SKS dari baris KRS lengkap tanpa metadata", () => {
  const result = parseKrsText(
    "KRS SEMESTER GANJIL 2024/2025\n1. Pemrograman Berorientasi Objek I\n3 SKS\n2. Basis Data Terdistribusi 3 SKS\n7 Mata Kuliah\n21 SKS",
  );
  assert.equal(result.academicPeriod, "Ganjil 2024/2025");
  assert.deepEqual(result.candidates.map((item) => item.name), [
    "Pemrograman Berorientasi Objek I",
    "Basis Data Terdistribusi",
  ]);
  assert.deepEqual(result.candidates.map((item) => item.credits), [3, 3]);
  assert.equal(result.totalCourses, 7);
  assert.equal(result.totalCredits, 21);
});

test("parser menerima OCR berisik, baris terpotong, dan menolak footer", () => {
  const result = parseKrsText(
    "2. Basis Data\nTerdistribusi 3 3 Approved\n3. Sistem Operasi 3 SKS\nJumlah Mata Kuliah 2\nTotal 6 SKS",
  );
  assert.deepEqual(result.candidates.map((item) => item.name), ["Basis Data Terdistribusi", "Sistem Operasi"]);
  assert.ok(!result.candidates.some((item) => /Jumlah|Total/i.test(item.name)));
});

test("deduplikasi memakai nama dan SKS", () => {
  const result = deduplicateKrsCandidates([
    candidate(),
    candidate({ id: "duplicate", name: " Algoritma " }),
    candidate({ id: "different", name: "Basis Data", credits: 3 }),
  ]);
  assert.equal(result.candidates.length, 2);
  assert.equal(new Set(result.candidates.map((item) => item.id)).size, 2);
});

test("baris parsial tetap dikembalikan dan SKS berbeda tidak hilang", () => {
  const result = parseKrsText("Pemrograman Jaringan 3 SKS\nPemrograman Jaringan 4 SKS");
  assert.equal(result.candidates.length, 2);
  assert.ok(result.conflicts.some((item) => item.field === "credits"));
});
