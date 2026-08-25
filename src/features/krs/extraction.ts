import { deduplicateKrsCandidates, parseKrsText, type KrsParseResult } from "./parser";
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
    const { createWorker, PSM } = await import("tesseract.js");
    let worker;
    try {
      worker = await createWorker("ind+eng", 1, {
        logger: (message) => onProgress?.(message.progress ?? 0),
      });
    } catch {
      worker = await createWorker("ind", 1, {
        logger: (message) => onProgress?.(message.progress ?? 0),
      });
    }
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      const nodeBuffer = (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer;
      const image = nodeBuffer && input.image instanceof Blob
        ? nodeBuffer.from(await input.image.arrayBuffer())
        : input.image;
      const result = await worker.recognize(image as Parameters<typeof worker.recognize>[0]);
      return { text: result.data.text, confidence: result.data.confidence / 100 };
    } finally {
      await worker.terminate();
    }
  }
}

type PdfTextResult = { text: string; pageCount: number };

type ImageVariant = Blob | HTMLCanvasElement;

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
    pages.push(
      content.items
        .map((item) => ("str" in item ? String(item.str) : ""))
        .filter(Boolean)
        .join(" "),
    );
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

function drawCanvas(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  source?: { left: number; top: number; width: number; height: number },
) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  if (source) context.drawImage(bitmap, source.left, source.top, source.width, source.height, 0, 0, width, height);
  else context.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

export type ImageVariantKind = "whole" | "enhanced" | "left" | "right";

export function imageVariantPlan(width: number, height: number): ImageVariantKind[] {
  return width / height >= 1.3
    ? ["whole", "enhanced", "left", "right"]
    : ["whole", "enhanced"];
}

async function preprocessImage(image: ImageVariant): Promise<ImageVariant[]> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return [image];
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(image);
  } catch {
    return [image];
  }
  try {
    const scale = bitmap.width < 1600 ? 2 : 1.35;
    const base = drawCanvas(bitmap, bitmap.width * scale, bitmap.height * scale);
    if (!base) return [image];
    const context = base.getContext("2d", { willReadFrequently: true });
    if (!context) return [image, base];
    const pixels = context.getImageData(0, 0, base.width, base.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const gray = Math.round(
        pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114,
      );
      const contrast = Math.max(0, Math.min(255, Math.round((gray - 128) * 1.25 + 128)));
      pixels.data[index] = contrast;
      pixels.data[index + 1] = contrast;
      pixels.data[index + 2] = contrast;
    }
    context.putImageData(pixels, 0, 0);
    const variants: ImageVariant[] = [image, base];
    if (imageVariantPlan(bitmap.width, bitmap.height).includes("left")) {
      const half = bitmap.width / 2;
      const cropWidth = half * 1.04;
      for (const left of [0, bitmap.width - cropWidth]) {
        const crop = drawCanvas(bitmap, cropWidth * scale, bitmap.height * scale, {
          left,
          top: 0,
          width: cropWidth,
          height: bitmap.height,
        });
        if (crop) variants.push(crop);
      }
    }
    return variants;
  } finally {
    bitmap.close();
  }
}

export type ParsedOcrResult = OcrResult & { parsed: KrsParseResult };

function parseQuality(parsed: KrsParseResult) {
  const expected = parsed.totalCourses !== undefined && parsed.totalCredits !== undefined;
  const totalsMatch = expected && parsed.totalCourses === parsed.candidates.length && parsed.totalCredits === parsed.candidates.reduce((sum, item) => sum + item.credits, 0);
  return parsed.candidates.length * 10 + parsed.confidence * 5 + (totalsMatch ? 25 : 0) - parsed.conflicts.length * 3;
}

export function mergeOcrResults(results: ParsedOcrResult[]): ParsedOcrResult {
  if (!results.length) throw new Error("OCR belum menghasilkan teks.");
  const deduplicated = deduplicateKrsCandidates(results.flatMap((result) => result.parsed.candidates));
  const firstWithPeriod = results.find((result) => result.parsed.academicPeriod);
  const totals = results
    .map((result) => result.parsed)
    .filter((parsed) => parsed.totalCourses !== undefined || parsed.totalCredits !== undefined)
    .sort((a, b) => parseQuality(b) - parseQuality(a))[0];
  const conflicts = [...deduplicated.conflicts];
  for (const conflict of results.flatMap((result) => result.parsed.conflicts)) {
    if (!conflicts.some((existing) => existing.identity === conflict.identity && existing.field === conflict.field)) conflicts.push(conflict);
  }
  const sumCredits = deduplicated.candidates.reduce((sum, item) => sum + item.credits, 0);
  const completeTotals = totals?.totalCourses === undefined || totals.totalCredits === undefined || (totals.totalCourses === deduplicated.candidates.length && totals.totalCredits === sumCredits);
  const parsed: KrsParseResult = {
    academicPeriod: firstWithPeriod?.parsed.academicPeriod,
    candidates: deduplicated.candidates,
    totalCourses: totals?.totalCourses,
    totalCredits: totals?.totalCredits,
    confidence: Math.max(...results.map((result) => result.parsed.confidence)),
    needsVerification: conflicts.length > 0 || results.some((result) => result.parsed.needsVerification) || !completeTotals,
    conflicts,
  };
  const bestText = results.reduce((best, result) =>
    !best || parseQuality(result.parsed) > parseQuality(best.parsed) ? result : best,
  ).text;
  return {
    text: bestText,
    confidence: results.reduce((sum, result) => sum + result.confidence, 0) / results.length,
    parsed,
  };
}

export function selectBestOcrResult(results: ParsedOcrResult[]) {
  return mergeOcrResults(results);
}

async function recognizeBest(
  image: ImageVariant,
  provider: OcrProvider,
  page: number | undefined,
  onProgress: (progress: number) => void,
): Promise<ParsedOcrResult> {
  const variants = await preprocessImage(image);
  const results: ParsedOcrResult[] = [];
  for (let index = 0; index < variants.length; index += 1) {
    const result = await provider.extractText({ image: variants[index], page }, (progress) =>
      onProgress((index + progress) / variants.length),
    );
    results.push({ ...result, parsed: parseKrsText(result.text) });
  }
  return mergeOcrResults(results);
}

function isCompletePdfExtraction(parsed: KrsParseResult) {
  if (!parsed.candidates.length || parsed.conflicts.length) return false;
  if (parsed.totalCourses !== undefined || parsed.totalCredits !== undefined) {
    return parsed.totalCourses === parsed.candidates.length && parsed.totalCredits === parsed.candidates.reduce((sum, item) => sum + item.credits, 0);
  }
  return parsed.candidates.length > 1 && !parsed.needsVerification;
}

type RenderPages = (file: Blob, onProgress?: (progress: number) => void) => Promise<HTMLCanvasElement[]>;

export async function extractKrsFile(
  file: File,
  options: {
    ocrProvider?: OcrProvider;
    onProgress?: (progress: ExtractionProgress) => void;
    renderPages?: RenderPages;
  } = {},
): Promise<KrsExtractionResult> {
  if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type))
    throw new Error("Format KRS tidak didukung.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Ukuran KRS terlalu besar.");
  const onProgress = options.onProgress;
  let rawText = "";
  let parsedOverride: KrsParseResult | undefined;
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
    if (isCompletePdfExtraction(embeddedResult)) {
      rawText = embedded.text;
      source = "pdf-text";
    } else {
      report(onProgress, { stage: "rendering", progress: 0.5, message: "Menyiapkan halaman dokumen" });
      const render = options.renderPages ?? renderPdfPages;
      const pages = await render(file, (progress) =>
        report(onProgress, { stage: "rendering", progress: 0.5 + progress * 0.2, message: "Menyiapkan halaman dokumen" }),
      );
      const provider = options.ocrProvider ?? new TesseractOcrProvider();
      const results: ParsedOcrResult[] = [{ text: embedded.text, confidence: 1, parsed: embeddedResult }];
      for (let index = 0; index < pages.length; index += 1) {
        const result = await recognizeBest(pages[index], provider, index + 1, (progress) =>
          report(onProgress, {
            stage: "recognizing",
            progress: 0.7 + ((index + progress) / pages.length) * 0.2,
            message: "Mengenali isi dokumen",
          }),
        );
        results.push(result);
        ocrConfidences.push(Math.max(0, Math.min(1, result.confidence)));
      }
      const merged = mergeOcrResults(results);
      rawText = results.map((result) => result.text).filter(Boolean).join("\n");
      parsedOverride = merged.parsed;
      source = "ocr";
    }
  } else {
    report(onProgress, { stage: "recognizing", progress: 0.2, message: "Mengenali isi dokumen" });
    const provider = options.ocrProvider ?? new TesseractOcrProvider();
    const result = await recognizeBest(file, provider, undefined, (progress) =>
      report(onProgress, { stage: "recognizing", progress: 0.2 + progress * 0.7, message: "Mengenali isi dokumen" }),
    );
    rawText = result.text;
    parsedOverride = result.parsed;
    ocrConfidences.push(Math.max(0, Math.min(1, result.confidence)));
  }
  report(onProgress, { stage: "parsing", progress: 0.92, message: "Menyiapkan hasil" });
  const parsed = parsedOverride ?? parseKrsText(rawText);
  const ocrConfidence = ocrConfidences.length
    ? ocrConfidences.reduce((sum, confidence) => sum + confidence, 0) / ocrConfidences.length
    : undefined;
  const needsVerification = parsed.needsVerification || (ocrConfidence !== undefined && ocrConfidence < 0.8);
  const candidates = ocrConfidence === undefined
    ? parsed.candidates
    : parsed.candidates.map((candidate) => ({
        ...candidate,
        needsVerification: candidate.needsVerification || ocrConfidence < 0.8,
      }));
  report(onProgress, { stage: "done", progress: 1, message: candidates.length ? "Dokumen berhasil dibaca" : "Tidak ada baris yang dapat dipastikan" });
  return {
    ...parsed,
    candidates,
    confidence: parsed.confidence,
    needsVerification,
    source,
    pageCount,
    rawTextLength: rawText.length,
    ocrConfidence,
  };
}
