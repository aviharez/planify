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

test("parser mengambil struktur baris dengan beragam kode dan tanpa kode", () => {
  const result = parseKrsText([
    "1. IF-028 Sistem Mikrokontroler 6 3 Approved (*T)",
    "2. IF-U08 Pra Skripsi 7 3 Approved (*T)",
    "3. IF-P02 Sistem Informasi Enterprise 5 3 Approved (*T)",
    "4. TI-A01 Algoritma dan Struktur Data 3 3 Approved",
    "5. SI-204 Analisis Sistem 4 3",
    "6. AKT-P02 Akuntansi Keuangan 3 3",
    "7. CS101 Introduction to Computing 3",
    "8. Pemrograman Web 2 3 SKS",
    "9. Kalkulus 2 3 SKS",
  ].join("\n"));
  assert.deepEqual(result.candidates.map(({ name, credits }) => ({ name, credits })), [
    { name: "Sistem Mikrokontroler", credits: 3 },
    { name: "Pra Skripsi", credits: 3 },
    { name: "Sistem Informasi Enterprise", credits: 3 },
    { name: "Algoritma dan Struktur Data", credits: 3 },
    { name: "Analisis Sistem", credits: 3 },
    { name: "Akuntansi Keuangan", credits: 3 },
    { name: "Introduction to Computing", credits: 3 },
    { name: "Pemrograman Web 2", credits: 3 },
    { name: "Kalkulus 2", credits: 3 },
  ]);
});

test("parser menggabungkan nama yang terbungkus dan menolak metadata", () => {
  const result = parseKrsText("1. IF-A01 Project Integration\nMethodology of Excellence 5 3 Approved\nJumlah Mata Kuliah 1\n3 SKS");
  assert.deepEqual(result.candidates.map((item) => item.name), ["Project Integration Methodology of Excellence"]);
  assert.equal(result.candidates[0]?.credits, 3);
});

test("baris tanpa kode tetap memisahkan semester dan SKS", () => {
  const result = parseKrsText("1. Kalkulus 2 4 3\n2. Basis Data 3 3");
  assert.deepEqual(result.candidates.map(({ name, credits }) => ({ name, credits })), [
    { name: "Kalkulus 2", credits: 3 },
    { name: "Basis Data", credits: 3 },
  ]);
});

test("angka di nama mata kuliah tidak dibuang saat SKS diberi label", () => {
  const result = parseKrsText("1. Pemrograman Web 2 3 SKS\n2. Kalkulus 2 3 SKS");
  assert.deepEqual(result.candidates.map((item) => item.name), ["Pemrograman Web 2", "Kalkulus 2"]);
});

test("normalisasi OCR typo tetap menghasilkan nama akademik yang terbaca", () => {
  const result = parseKrsText("1. IF-027 Sistem Mikroprosessor 5 3 Approved");
  assert.equal(result.candidates[0]?.name, "Sistem Mikroprosesor");
});

test("multiline side-by-side row splitting keeps the duplicated mobile course", () => {
  const result = parseKrsText([
    "No. Kode Mata Kuliah Semester SKS Status No. Kode Mata Kuliah Semester SKS Status",
    "4. | oa | Pemrograman Mobile I 5 3 |Approved (T)| | 4. | IF-024 |Pemrograman Mobile ll 5 3 [Approved CT)",
    "5 | 1F-027 Sistem Mikroprosessor 5 3 [Approved (T)| | 5. | IF-027 | Sistem Mikroprosessor 5 3 | Approved CT)",
    "7 Mata Kuliah 22 SKS",
  ].join("\n"));
  assert.deepEqual(result.candidates.map((item) => `${item.name}|${item.credits}`), [
    "Pemrograman Mobile II|3",
    "Sistem Mikroprosesor|3",
  ]);
});
