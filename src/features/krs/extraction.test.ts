import test from "node:test";
import assert from "node:assert/strict";
import { extractKrsFile, selectBestOcrResult, type OcrProvider } from "./extraction";

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
