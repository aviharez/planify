import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { KrsExtractionService, TesseractOcrProvider } from "./extraction";

test("download.pdf diproses lewat jalur ekstraksi PDF dan menghasilkan tujuh mata kuliah unik", async () => {
  const pdf = await readFile("download.pdf");
  const service = new KrsExtractionService({
    extractText: async () => {
      throw new Error("OCR tidak boleh dipanggil untuk PDF digital ini");
    },
  });
  const result = await service.extract(new File([pdf], "download.pdf", { type: "application/pdf" }));
  assert.equal(result.pageCount, 1);
  assert.equal(result.candidates.length, 7);
  assert.equal(result.totalCredits, 21);
  assert.deepEqual(result.candidates.map((course) => course.name), [
    "Pemrograman Berorientasi Objek I",
    "Basis Data Terdistribusi",
    "Sistem Operasi",
    "Jaringan Komputer I",
    "Rekayasa Perangkat Lunak",
    "Statistika",
    "Teori Bahasa Otomata",
  ]);
  assert.deepEqual(result.candidates.map((course) => course.credits), [3, 3, 3, 3, 3, 3, 3]);
});

test("fixture KRS Ganjil side-by-side nyata dideduplikasi oleh OCR Tesseract", async () => {
  const image = await readFile("tests/fixtures/krs/utb-ganjil-2026-2027-side-by-side.jpeg");
  const result = await new KrsExtractionService(new TesseractOcrProvider()).extract(
    new File([image], "utb-ganjil-2026-2027-side-by-side.jpeg", { type: "image/jpeg" }),
  );
  assert.equal(result.academicPeriod, "Ganjil 2026/2027");
  assert.equal(result.candidates.length, 7);
  assert.equal(result.totalCredits, 22);
  assert.deepEqual(result.candidates.map((course) => `${course.name}|${course.credits}`).sort(), [
    "Bahasa Indonesia|2",
    "Pemrograman Mobile II|3",
    "Pra Skripsi|3",
    "Project Integration Methodology of Excellence|3",
    "Sistem Informasi Enterprise|3",
    "Sistem Mikroprosesor|3",
    "Skripsi|5",
  ]);
});

test("fixture KRS Genap nyata diproses dengan OCR Tesseract", async () => {
  const image = await readFile("tests/fixtures/krs/utb-genap-2025-2026.jpeg");
  const result = await new KrsExtractionService(new TesseractOcrProvider()).extract(
    new File([image], "utb-genap-2025-2026.jpeg", { type: "image/jpeg" }),
  );
  assert.equal(result.academicPeriod, "Genap 2025/2026");
  assert.equal(result.candidates.length, 5);
  assert.equal(result.totalCredits, 14);
  assert.deepEqual(result.candidates.map((course) => course.name).sort(), [
    "Android Development Associate (ADA)",
    "Metodologi Penelitian Informatika",
    "Pengujian Perangkat Lunak",
    "Sistem Mikrokontroler",
    "Teknik Penulisan Literatur Ilmiah",
  ]);
});
