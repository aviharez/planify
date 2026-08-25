import test from "node:test";
import assert from "node:assert/strict";
import { extractKrsFile, imageVariantPlan, mergeOcrResults, selectBestOcrResult, type OcrProvider } from "./extraction";

const ocrText = "Pemrograman Berorientasi\nObjek I 3 SKS";

test("hasil OCR yang valid tetap diterima walau confidence rendah", async () => {
  const provider: OcrProvider = {
    extractText: async () => ({ text: ocrText, confidence: 0.4 }),
  };
  const result = await extractKrsFile(
    new File([new Uint8Array([137, 80, 78, 71])], "krs.png", { type: "image/png" }),
    { ocrProvider: provider },
  );
  assert.equal(result.ocrConfidence, 0.4);
  assert.equal(result.needsVerification, true);
  assert.equal(result.candidates[0]?.name, "Pemrograman Berorientasi Objek I");
});

test("pemilihan OCR mengutamakan baris kursus valid daripada confidence global", () => {
  const selected = selectBestOcrResult([
    { text: "noise", confidence: 0.99, parsed: { candidates: [], confidence: 1, needsVerification: true, conflicts: [] } },
    { text: "Basis Data 3 SKS", confidence: 0.2, parsed: { candidates: [{ id: "basis-data", name: "Basis Data", credits: 3 }], confidence: 0.7, needsVerification: true, conflicts: [] } },
  ]);
  assert.equal(selected.text, "Basis Data 3 SKS");
});

test("varian OCR digabung menjadi union dan konflik SKS dipertahankan", () => {
  const merged = mergeOcrResults([
    { text: "A", confidence: 0.8, parsed: { candidates: [{ id: "a", name: "Basis Data", credits: 3 }], confidence: 0.8, needsVerification: false, conflicts: [] } },
    { text: "B", confidence: 0.7, parsed: { candidates: [{ id: "b", name: "Sistem Operasi", credits: 3 }, { id: "a2", name: "Basis Data", credits: 4 }], confidence: 0.7, needsVerification: true, conflicts: [{ identity: "basis data", field: "credits", values: ["3", "4"] }] } },
  ]);
  assert.deepEqual(merged.parsed.candidates.map((item) => item.name), ["Basis Data", "Sistem Operasi", "Basis Data"]);
  assert.equal(merged.parsed.candidates.length, 3);
  assert.equal(merged.parsed.conflicts.length, 1);
  assert.equal(merged.parsed.needsVerification, true);
});

test("wide image runs whole, enhanced, left, and right passes before merge", () => {
  assert.deepEqual(imageVariantPlan(1280, 905), ["whole", "enhanced", "left", "right"]);
  assert.deepEqual(imageVariantPlan(988, 1280), ["whole", "enhanced"]);
  const names = [
    ["Pra Skripsi", 3], ["Project Integration Methodology of Excellence", 3],
    ["Sistem Informasi Enterprise", 3], ["Pemrograman Mobile II", 3],
    ["Sistem Mikroprosesor", 3], ["Bahasa Indonesia", 2], ["Skripsi", 5],
  ] as const;
  const parsed = (items: readonly (readonly [string, number])[]) => ({
    candidates: items.map(([name, credits]) => ({ id: name, name, credits })),
    confidence: 0.9,
    needsVerification: false,
    conflicts: [],
    totalCourses: 7,
    totalCredits: 22,
  });
  const merged = mergeOcrResults([
    { text: "whole", confidence: 0.7, parsed: parsed(names.slice(0, 4)) },
    { text: "left", confidence: 0.8, parsed: parsed(names.slice(0, 5)) },
    { text: "right", confidence: 0.9, parsed: parsed(names) },
  ]);
  assert.equal(merged.parsed.candidates.length, 7);
  assert.equal(merged.parsed.candidates.reduce((sum, item) => sum + item.credits, 0), 22);
});

test("hasil OCR tanpa baris valid dikembalikan sebagai hasil kosong untuk diverifikasi", async () => {
  const provider: OcrProvider = {
    extractText: async () => ({ text: "dokumen tidak terbaca", confidence: 0.95 }),
  };
  const result = await extractKrsFile(
    new File([new Uint8Array([137, 80, 78, 71])], "krs.png", { type: "image/png" }),
    { ocrProvider: provider },
  );
  assert.deepEqual(result.candidates, []);
  assert.equal(result.needsVerification, true);
});
