import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { KrsExtractionService } from "./extraction";

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
