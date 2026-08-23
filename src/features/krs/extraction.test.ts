import test from "node:test";
import assert from "node:assert/strict";
import { extractKrsFile, type OcrProvider } from "./extraction";

const ocrText = "KRS SEMESTER GANJIL 2024/2025 1. IF-015 Pemrograman Berorientasi Objek I 3 3 Approved (*T)";

test("confidence OCR rendah diteruskan ke hasil dan verifikasi", async () => {
  const provider: OcrProvider = {
    extractText: async () => ({ text: ocrText, confidence: 0.4 }),
  };
  const result = await extractKrsFile(
    new File([new Uint8Array([137, 80, 78, 71])], "krs.png", { type: "image/png" }),
    { ocrProvider: provider },
  );
  assert.equal(result.ocrConfidence, 0.4);
  assert.equal(result.needsVerification, true);
  assert.equal(result.candidates[0].needsVerification, true);
  assert.ok(result.candidates[0].confidence < 0.4);
});

test("hasil OCR tanpa mata kuliah dianggap gagal dibaca", async () => {
  const provider: OcrProvider = {
    extractText: async () => ({ text: "dokumen tidak terbaca", confidence: 0.95 }),
  };
  await assert.rejects(
    extractKrsFile(
      new File([new Uint8Array([137, 80, 78, 71])], "krs.png", { type: "image/png" }),
      { ocrProvider: provider },
    ),
  );
});
