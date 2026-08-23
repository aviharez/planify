import { parseKrsText, type KrsParseResult } from "./parser";
import { loadPdfJs } from "./pdf";

export type ExtractionProgress = {
  stage: "reading" | "rendering" | "recognizing" | "parsing" | "done";
  progress: number;
  message: string;
};

export type OcrInput = {
  image: Blob | HTMLCanvasElement;
  page?: number;
};

export type OcrResult = {
  text: string;
  confidence: number;
};

export interface OcrProvider {
  extractText(
    input: OcrInput,
    onProgress?: (progress: number) => void,
  ): Promise<OcrResult>;
}

export class TesseractOcrProvider implements OcrProvider {
  async extractText(
    input: OcrInput,
    onProgress?: (progress: number) => void,
  ): Promise<OcrResult> {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("ind", 1, {
      logger: (message) => onProgress?.(message.progress ?? 0),
    });
    try {
      const result = await worker.recognize(input.image);
      const confidence = result.data.confidence / 100;
      return { text: result.data.text, confidence };
    } finally {
      await worker.terminate();
    }
  }
}

type PdfTextResult = { text: string; pageCount: number };

function report(
  onProgress: ((progress: ExtractionProgress) => void) | undefined,
  value: ExtractionProgress,
) {
  onProgress?.(value);
}

export async function extractPdfText(
  file: Blob | Uint8Array,
  onProgress?: (progress: number) => void,
): Promise<PdfTextResult> {
  const pdfjs = await loadPdfJs();
  const data = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? String(item.str) : ""))
      .filter(Boolean)
      .join(" ");
    pages.push(text);
    onProgress?.(pageNumber / document.numPages);
  }
  return { text: pages.join("\n"), pageCount: document.numPages };
}

export async function renderPdfPages(
  file: Blob,
  onProgress?: (progress: number) => void,
): Promise<HTMLCanvasElement[]> {
  if (typeof document === "undefined") throw new Error("PDF perlu diproses di browser.");
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const documentProxy = await pdfjs.getDocument({ data }).promise;
  const canvases: HTMLCanvasElement[] = [];
  for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
    const page = await documentProxy.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.8 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Dokumen belum bisa dirender.");
    await page.render({ canvasContext: context, canvas, viewport }).promise;
    canvases.push(canvas);
    onProgress?.(pageNumber / documentProxy.numPages);
  }
  return canvases;
}

export type KrsExtractionResult = KrsParseResult & {
  source: "pdf-text" | "ocr";
  pageCount: number;
  rawTextLength: number;
  ocrConfidence?: number;
};

export class KrsExtractionService {
  constructor(private readonly ocrProvider?: OcrProvider) {}

  extract(
    file: File,
    options: { onProgress?: (progress: ExtractionProgress) => void } = {},
  ) {
    return extractKrsFile(file, { ...options, ocrProvider: this.ocrProvider });
  }
}

function hasMeaningfulText(text: string, parsed: KrsParseResult) {
  return text.replace(/\s/g, "").length >= 40 && parsed.candidates.length > 0;
}

export async function extractKrsFile(
  file: File,
  options: {
    ocrProvider?: OcrProvider;
    onProgress?: (progress: ExtractionProgress) => void;
  } = {},
): Promise<KrsExtractionResult> {
  if (![
    "application/pdf",
    "image/jpeg",
    "image/png",
  ].includes(file.type))
    throw new Error("Format KRS tidak didukung.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Ukuran KRS terlalu besar.");
  const onProgress = options.onProgress;
  let rawText = "";
  let pageCount = 1;
  let source: "pdf-text" | "ocr" = "ocr";
  const ocrConfidences: number[] = [];
  if (file.type === "application/pdf") {
    report(onProgress, { stage: "reading", progress: 0.1, message: "Membaca dokumen" });
    const embedded = await extractPdfText(file, (progress) =>
      report(onProgress, { stage: "reading", progress: 0.1 + progress * 0.35, message: "Membaca dokumen" }),
    );
    pageCount = embedded.pageCount;
    const embeddedResult = parseKrsText(embedded.text);
    if (hasMeaningfulText(embedded.text, embeddedResult)) {
      rawText = embedded.text;
      source = "pdf-text";
    } else {
      report(onProgress, { stage: "rendering", progress: 0.5, message: "Menyiapkan halaman dokumen" });
      const pages = await renderPdfPages(file, (progress) =>
        report(onProgress, { stage: "rendering", progress: 0.5 + progress * 0.2, message: "Menyiapkan halaman dokumen" }),
      );
      const provider = options.ocrProvider ?? new TesseractOcrProvider();
      const texts: string[] = [];
      for (let index = 0; index < pages.length; index += 1) {
        const result = await provider.extractText({ image: pages[index], page: index + 1 }, (progress) =>
          report(onProgress, {
            stage: "recognizing",
            progress: 0.7 + ((index + progress) / pages.length) * 0.2,
            message: "Mengenali isi dokumen",
          }),
        );
        texts.push(result.text);
        ocrConfidences.push(Math.max(0, Math.min(1, result.confidence)));
      }
      rawText = texts.join("\n");
    }
  } else {
    report(onProgress, { stage: "recognizing", progress: 0.2, message: "Mengenali isi dokumen" });
    const provider = options.ocrProvider ?? new TesseractOcrProvider();
    const result = await provider.extractText({ image: file }, (progress) =>
      report(onProgress, { stage: "recognizing", progress: 0.2 + progress * 0.7, message: "Mengenali isi dokumen" }),
    );
    rawText = result.text;
    ocrConfidences.push(Math.max(0, Math.min(1, result.confidence)));
  }
  report(onProgress, { stage: "parsing", progress: 0.92, message: "Menyiapkan hasil" });
  const parsed = parseKrsText(rawText);
  if (parsed.candidates.length === 0) throw new Error("Mata kuliah belum berhasil ditemukan.");
  const ocrConfidence = ocrConfidences.length
    ? ocrConfidences.reduce((sum, confidence) => sum + confidence, 0) / ocrConfidences.length
    : undefined;
  const confidence = ocrConfidence === undefined ? parsed.confidence : parsed.confidence * ocrConfidence;
  const needsVerification = parsed.needsVerification || (ocrConfidence !== undefined && ocrConfidence < 0.8);
  const candidates = ocrConfidence === undefined
    ? parsed.candidates
    : parsed.candidates.map((candidate) => ({
        ...candidate,
        confidence: candidate.confidence * ocrConfidence,
        needsVerification: candidate.needsVerification || ocrConfidence < 0.8,
      }));
  report(onProgress, { stage: "done", progress: 1, message: "Dokumen berhasil dibaca" });
  return {
    ...parsed,
    candidates,
    confidence,
    needsVerification,
    source,
    pageCount,
    rawTextLength: rawText.length,
    ocrConfidence,
  };
}
